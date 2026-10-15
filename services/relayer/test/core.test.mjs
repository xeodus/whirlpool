import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, getAddressFromPublicKey, getBase58Decoder,
  getTransactionDecoder, signBytes } from '@solana/kit';
import { readPrivateActionStatus, submitPrivateAction } from '../src/core.mjs';

const be32 = value => Uint8Array.from(BigInt(value).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
const key = seed => getBase58Decoder().decode(Uint8Array.from({ length: 32 }, (_, i) => i + seed));
const instruction = fee => Uint8Array.from([4, ...new Uint8Array(256), ...[
  0n, 1n, 2n, 3n, 4n, 5n, 0n, 0n, 0n, fee, 6n, 7n,
].flatMap(value => Array.from(be32(value))), 589 & 255, 589 >> 8, ...new Uint8Array(589)]);
const intentId = '894e93db-8c32-4af4-b86e-36590c4e2bf3';

async function setup(sendFailure = false) {
  const pair = await generateKeyPair();
  const signer = { address: await getAddressFromPublicKey(pair.publicKey),
    sign: bytes => signBytes(pair.privateKey, bytes),
    verify: (signature, bytes) => crypto.subtle.verify('Ed25519', pair.publicKey, signature, bytes) };
  const records = new Map();
  let sends = 0;
  const store = {
    lookup: async (invite, id) => records.get(`${invite}:${id}`),
    claim: async record => {
      const id = `${record.inviteId}:${record.intentId}`;
      if (records.has(id)) return { created: false, record: records.get(id) };
      records.set(id, record);
      return { created: true, record };
    },
  };
  const rpc = async (method, params) => {
    if (method === 'getLatestBlockhash') return { value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 123 } };
    if (method === 'simulateTransaction') return { value: { err: null, unitsConsumed: 200_000 } };
    if (method === 'getFeeForMessage') return { value: 5_000 };
    if (method === 'getBalance') return { value: 1_000_000_000 };
    if (method === 'getSignatureStatuses') return { value: [{ err: null, confirmationStatus: 'finalized' }] };
    if (method === 'sendTransaction') {
      sends++;
      if (sendFailure) throw new Error('Uncertain RPC timeout');
      const wire = Buffer.from(params[0], 'base64');
      const signature = getTransactionDecoder().decode(wire).signatures[signer.address];
      return getBase58Decoder().decode(signature);
    }
    throw new Error(`Unexpected RPC ${method}`);
  };
  return { deps: { signer, rpc, store, invites: { authenticate: async token => token === 'test-only' ? 'invite-1' : null },
    programId: key(1), poolId: key(33) }, sends: () => sends, records };
}

test('relayer signs once after simulation and binds an intent to its instruction', async () => {
  const { deps, sends, records } = await setup();
  const request = { inviteToken: 'test-only', intentId, data: instruction(1_000_000n) };
  const first = await submitPrivateAction(request, deps);
  assert.equal(first.state, 'accepted');
  assert.equal(sends(), 1);
  assert.equal(records.size, 1);
  const second = await submitPrivateAction(request, deps);
  assert.equal(second.state, 'previously-submitted');
  assert.equal(second.signature, first.signature);
  assert.equal(sends(), 1);
  const changed = { ...request, data: request.data.slice() };
  changed.data[257 + 4 * 32] ^= 1;
  await assert.rejects(submitPrivateAction(changed, deps), /different data/);
  assert.equal(sends(), 1);
});

test('ambiguous broadcast is recorded and never retried automatically', async () => {
  const { deps, sends } = await setup(true);
  const request = { inviteToken: 'test-only', intentId, data: instruction(1_000_000n) };
  const first = await submitPrivateAction(request, deps);
  assert.equal(first.state, 'ambiguous');
  assert.equal((await submitPrivateAction(request, deps)).state, 'previously-submitted');
  assert.equal((await readPrivateActionStatus({ inviteToken: request.inviteToken,
    intentId }, deps)).state, 'finalized');
  assert.equal(sends(), 1);
});

test('rejects uninvited requests, non-private actions, and altered fee', async () => {
  const { deps, sends } = await setup();
  await assert.rejects(submitPrivateAction({ inviteToken: 'wrong', intentId,
    data: instruction(1_000_000n) }, deps), /Invitation/);
  await assert.rejects(submitPrivateAction({ inviteToken: 'test-only', intentId,
    data: instruction(2_000_000n) }, deps), /fee/);
  assert.equal(sends(), 0);
});

test('status does not expose another invitation’s saved signature', async () => {
  const { deps } = await setup();
  const request = { inviteToken: 'test-only', intentId, data: instruction(1_000_000n) };
  await submitPrivateAction(request, deps);
  assert.equal((await readPrivateActionStatus({ inviteToken: 'wrong', intentId }, deps).catch(error => error.message)),
    'Invitation is unavailable');
  assert.equal((await readPrivateActionStatus({ inviteToken: 'test-only',
    intentId: 'ae2ef694-9b4a-4c5a-b455-b297378bff6d' }, deps)).state, 'not-recorded');
});
