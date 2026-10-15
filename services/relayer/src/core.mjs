import { getBase58Decoder, getBase64Decoder, getTransactionEncoder } from '@solana/kit';
import { buildPoolTransaction, inspectPoolAction } from '@whirlpool/protocol-client/src/transaction.mjs';

const encode64 = bytes => getBase64Decoder().decode(bytes);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FEE = 20_000;
const MIN_RESERVE = 100_000_000;
const digest = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');

// `store.claim` must atomically persist a signed transaction before any RPC
// broadcast. A duplicate intent returns the stored signature, never resends.
export async function submitPrivateAction(request, { programId, poolId, signer, rpc, invites, store }) {
  if (!UUID.test(request?.intentId ?? '')) throw new Error('Invalid intent ID');
  if (!(request.data instanceof Uint8Array) || request.data.length > 4096)
    throw new Error('Invalid public proof instruction');
  const action = inspectPoolAction(request.data);
  if (!['transfer', 'withdraw'].includes(action.kind)) throw new Error('Relayer accepts private actions only');
  const inviteId = await invites.authenticate(request.inviteToken);
  if (!inviteId) throw new Error('Invitation is unavailable');
  const requestHash = await digest(request.data);
  const existing = await store.lookup(inviteId, request.intentId);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new Error('Intent ID was already used for different data');
    return { state: 'previously-submitted', signature: existing.signature };
  }
  const latest = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const built = await buildPoolTransaction({ programId, poolId, submitter: signer.address,
    data: request.data, latestBlockhash: latest.value });
  const [simulation, fee, balance] = await Promise.all([
    rpc('simulateTransaction', [encode64(built.wire), { encoding: 'base64', sigVerify: false,
      replaceRecentBlockhash: false, commitment: 'confirmed' }]),
    rpc('getFeeForMessage', [encode64(built.transaction.messageBytes), { commitment: 'confirmed' }]),
    rpc('getBalance', [signer.address, { commitment: 'confirmed' }]),
  ]);
  if (simulation?.value?.err != null) throw new Error('Devnet simulation rejected the public proof');
  if (!Number.isSafeInteger(fee?.value) || fee.value < 0 || fee.value > MAX_FEE)
    throw new Error('Network fee outside relayer limit');
  if (!Number.isSafeInteger(balance?.value) || balance.value < MIN_RESERVE + fee.value +
    655_320 * action.inputs) throw new Error('Relayer test budget is too low');
  const signatureBytes = await signer.sign(built.transaction.messageBytes);
  if (!(signatureBytes instanceof Uint8Array) || signatureBytes.length !== 64 ||
    !await signer.verify(signatureBytes, built.transaction.messageBytes))
    throw new Error('Relayer signature failed local verification');
  const signed = { ...built.transaction,
    signatures: { ...built.transaction.signatures, [signer.address]: signatureBytes } };
  const wire = getTransactionEncoder().encode(signed);
  const signature = getBase58Decoder().decode(signatureBytes);
  const claimed = await store.claim({ inviteId, intentId: request.intentId, requestHash,
    signature, wire: encode64(wire), action: action.kind });
  if (!claimed.created) {
    if (claimed.record.requestHash !== requestHash) throw new Error('Intent ID was already used for different data');
    return { state: 'previously-submitted', signature: claimed.record.signature };
  }
  try {
    const returned = await rpc('sendTransaction', [encode64(wire), { encoding: 'base64',
      skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }]);
    if (returned !== signature) throw new Error('RPC returned another signature');
    return { state: 'accepted', signature };
  } catch {
    // The signed message is durably recorded; never auto-retry an ambiguous send.
    return { state: 'ambiguous', signature };
  }
}

export async function readPrivateActionStatus(request, { rpc, invites, store }) {
  if (!UUID.test(request?.intentId ?? '')) throw new Error('Invalid intent ID');
  const inviteId = await invites.authenticate(request.inviteToken);
  if (!inviteId) throw new Error('Invitation is unavailable');
  const record = await store.lookup(inviteId, request.intentId);
  if (!record) return { state: 'not-recorded' };
  const result = await rpc('getSignatureStatuses', [[record.signature],
    { searchTransactionHistory: true }]);
  const status = result?.value?.[0];
  if (!status) return { state: 'recorded-unresolved', signature: record.signature };
  if (status.err) return { state: 'failed-on-chain', signature: record.signature };
  return { state: status.confirmationStatus === 'finalized' ? 'finalized' : 'pending',
    signature: record.signature };
}
