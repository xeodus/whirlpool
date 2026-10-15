import { address, appendTransactionMessageInstruction, compileTransaction,
  createTransactionMessage, getBase58Decoder, getBase58Encoder, getProgramDerivedAddress,
  getTransactionEncoder, pipe, setTransactionMessageConfig,
  setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash } from '@solana/kit';
import { RELAYER_FEE } from './prepare.mjs';

const SYSTEM = address('11111111111111111111111111111111');
const fields = { 3: 6, 4: 12, 5: 13, 6: 12, 7: 13, 8: 7 };
const payloadSize = { 3: 295, 4: 589, 5: 589, 6: 295, 7: 295, 8: 0 };
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const signal = (data, index) => BigInt(`0x${hex(data.subarray(257 + index * 32, 289 + index * 32))}`);
const be32 = value => Uint8Array.from(value.toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));

function recipientAddress(lo, hi) {
  if (lo >= 1n << 128n || hi >= 1n << 128n) throw new Error('Recipient limbs exceed 128 bits');
  return address(getBase58Decoder().decode(Uint8Array.from([...be32(lo).subarray(16), ...be32(hi).subarray(16)])));
}

export function inspectPoolAction(data) {
  if (!(data instanceof Uint8Array) || !Object.hasOwn(fields, data[0])) throw new Error('Unsupported pool instruction');
  const tag = data[0], count = fields[tag], proofEnd = 1 + 256 + count * 32;
  const payload = payloadSize[tag];
  if (data.length !== proofEnd + (payload ? 2 + payload : 0)) throw new Error('Wrong proof or output length');
  if (payload && (data[proofEnd] !== (payload & 255) || data[proofEnd + 1] !== payload >> 8))
    throw new Error('Malformed output length');
  if (signal(data, 0) !== 0n) throw new Error('Expected SOL proof');
  if (tag === 3) {
    const amount = signal(data, 1), origin = signal(data, 2);
    if (amount < 1n || amount > (1n << 64n) - 1n || origin > (1n << 64n) - 1n)
      throw new Error('Invalid shield amount or origin');
    return { kind: 'shield', amount, origin, tag };
  }
  if (tag === 8) {
    const amount = signal(data, 4), origin = signal(data, 3);
    if (amount < 1n || amount > (1n << 64n) - 1n || origin > (1n << 64n) - 1n)
      throw new Error('Invalid public exit amount or origin');
    return { kind: 'exit', amount, origin, recipient: recipientAddress(signal(data, 5), signal(data, 6)),
      nullifiers: [signal(data, 2)], tag };
  }
  const inputs = tag === 5 || tag === 7 ? 2 : 1;
  const base = 3 + inputs;
  const fee = signal(data, base + 5), amount = signal(data, base + 2);
  const withdrawal = tag === 6 || tag === 7;
  if (fee !== RELAYER_FEE) throw new Error('Unexpected private action fee');
  if (withdrawal ? amount < 1n || amount > (1n << 64n) - 1n :
      amount !== 0n || signal(data, base + 3) !== 0n || signal(data, base + 4) !== 0n)
    throw new Error('Invalid private action payout');
  return { kind: withdrawal ? 'withdraw' : 'transfer', amount, fee, inputs,
    recipient: withdrawal ? recipientAddress(signal(data, base + 3), signal(data, base + 4)) : undefined,
    nullifiers: Array.from({ length: inputs }, (_, i) => signal(data, 3 + i)), tag };
}

export async function buildPoolTransaction({ programId, poolId, submitter, data,
  latestBlockhash, computeUnitLimit = 1_400_000, loadedAccountsDataSizeLimit = 2 * 1024 * 1024 }) {
  const program = address(programId), pool = address(poolId), signer = address(submitter);
  const action = inspectPoolAction(data);
  if (!latestBlockhash?.blockhash || !Number.isInteger(latestBlockhash.lastValidBlockHeight))
    throw new Error('Expected a recent blockhash lifetime');
  if (!Number.isInteger(computeUnitLimit) || computeUnitLimit < 1 || computeUnitLimit > 1_400_000 ||
      !Number.isInteger(loadedAccountsDataSizeLimit) || loadedAccountsDataSizeLimit < 1)
    throw new Error('Invalid v1 resource limits');
  const accounts = [{ address: pool, role: 1 }, { address: signer, role: 3 }];
  if (action.recipient) accounts.push({ address: action.recipient, role: 1 });
  for (const nf of action.nullifiers ?? []) {
    const [marker] = await getProgramDerivedAddress({ programAddress: program,
      seeds: [new TextEncoder().encode('nf'), getBase58Encoder().encode(pool), be32(nf)] });
    accounts.push({ address: marker, role: 1 });
  }
  accounts.push({ address: SYSTEM, role: 0 });
  const message = pipe(createTransactionMessage({ version: 1 }),
    value => setTransactionMessageFeePayer(signer, value),
    value => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, value),
    value => appendTransactionMessageInstruction({ programAddress: program, accounts, data }, value),
    value => setTransactionMessageConfig({ computeUnitLimit, loadedAccountsDataSizeLimit,
      priorityFeeLamports: 0n }, value));
  const transaction = compileTransaction(message);
  const wire = getTransactionEncoder().encode(transaction);
  if (wire.length > 4096) throw new Error('Proof transaction exceeds Solana v1 size limit');
  return { action, transaction, wire, message };
}
