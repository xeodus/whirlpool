import {
  address, appendTransactionMessageInstruction, compileTransaction,
  createTransactionMessage, getBase58Encoder, getProgramDerivedAddress,
  getTransactionEncoder, pipe, setTransactionMessageConfig,
  setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { FUNDING_SOURCE as TEST_WALLET } from './funding-transaction.mjs';

export const TEST_PROGRAM = address('FLRDXx6d2cHpikjP5t5XwHz8H1HDygPn7N74HX3f12F9');
export const TEST_POOL = address('862hBP83RtusQWdg9Ya9FT1DKfzLxMkMCveSdouNYJ8N');
const SYSTEM = address('11111111111111111111111111111111');
const field = (bytes, i) => BigInt(`0x${Array.from(bytes.subarray(257 + i * 32, 289 + i * 32),
  x => x.toString(16).padStart(2, '0')).join('')}`);
const be32 = n => Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');

export function validatePoolInstruction(action, data) {
  if (!(data instanceof Uint8Array) || !['shield','transfer','exit','exit_change'].includes(action))
    throw new Error('Unsupported pool action');
  const tag = { shield: 3, transfer: 4, exit: 8, exit_change: 8 }[action];
  const signalCount = action === 'shield' ? 6 : action === 'transfer' ? 12 : 7;
  const proofEnd = 1 + 256 + 32 * signalCount;
  if (data[0] !== tag || data.length < proofEnd) throw new Error('Wrong proof instruction');
  const payloadSize = action === 'shield' ? 295 : action === 'transfer' ? 589 : 0;
  if (data.length !== proofEnd + (payloadSize ? 2 + payloadSize : 0))
    throw new Error('Wrong proof or ciphertext size');
  if (payloadSize && (data[proofEnd] !== (payloadSize & 255) ||
      data[proofEnd + 1] !== (payloadSize >> 8))) throw new Error('Bad ciphertext length');
  if (field(data, 0) !== 0n || (action === 'shield' &&
      (field(data, 1) !== 10_000_000n || field(data, 2) !== 55n)) ||
      (action === 'transfer' &&
        (field(data, 6) !== 0n || field(data, 7) !== 0n || field(data, 8) !== 0n || field(data, 9) !== 1_000_000n)) ||
      (['exit','exit_change'].includes(action) &&
        (field(data, 3) !== 55n || field(data, 4) !== (action === 'exit' ? 6_000_000n : 3_000_000n))))
    throw new Error('Proof signals do not match the fixed test amounts');
  if (['exit','exit_change'].includes(action)) {
    const payout = getBase58Encoder().encode(TEST_WALLET);
    const lo = BigInt(`0x${hex(payout.subarray(0, 16))}`);
    const hi = BigInt(`0x${hex(payout.subarray(16))}`);
    if (field(data, 5) !== lo || field(data, 6) !== hi) throw new Error('Wrong exit recipient');
  }
  return true;
}

export async function buildPoolTransaction(action, data, latestBlockhash) {
  validatePoolInstruction(action, data);
  const accounts = [
    { address: TEST_POOL, role: 1 },
    { address: address(TEST_WALLET), role: 3 },
  ];
  if (['exit','exit_change'].includes(action)) accounts.push({ address: address(TEST_WALLET), role: 1 });
  if (action !== 'shield') {
    const nullifier = be32(field(data, action === 'transfer' ? 3 : 2));
    const [marker] = await getProgramDerivedAddress({ programAddress: TEST_PROGRAM,
      seeds: [new TextEncoder().encode('nf'), getBase58Encoder().encode(TEST_POOL), nullifier] });
    accounts.push({ address: marker, role: 1 });
  }
  accounts.push({ address: SYSTEM, role: 0 });
  const message = pipe(createTransactionMessage({ version: 1 }),
    m => setTransactionMessageFeePayer(address(TEST_WALLET), m),
    m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    m => appendTransactionMessageInstruction({ programAddress: TEST_PROGRAM, accounts, data }, m),
    m => setTransactionMessageConfig({ computeUnitLimit: 1_400_000,
      loadedAccountsDataSizeLimit: 2 * 1024 * 1024, priorityFeeLamports: 0n }, m));
  const transaction = compileTransaction(message);
  const bytes = getTransactionEncoder().encode(transaction);
  if (bytes.length > 4096) throw new Error(`Transaction exceeds v1 size: ${bytes.length}`);
  return { transaction, bytes };
}
