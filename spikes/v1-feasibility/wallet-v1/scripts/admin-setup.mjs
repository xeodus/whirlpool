import { readFileSync } from 'node:fs';
import {
  address, appendTransactionMessageInstruction, compileTransaction,
  createKeyPairSignerFromBytes, createTransactionMessage, getBase64Decoder,
  getTransactionEncoder, pipe, setTransactionMessageConfig,
  setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionWithSigners,
} from '@solana/kit';
import { singletonApprovalRoot } from '../../recovery/src/history.mjs';

// Throwaway SOL pool setup only. Signer paths point outside Git. No browser/user action here.
const SYSTEM = address('11111111111111111111111111111111');
const PROGRAM = address('FLRDXx6d2cHpikjP5t5XwHz8H1HDygPn7N74HX3f12F9');
const POOL_SIZE = 2513;
const keyDir = process.env.WHIRLPOOL_TEST_KEYS;
const rpcUrl = process.env.WHIRLPOOL_TEST_RPC_URL;
const action = process.argv[2];
const send = process.argv.includes('--send');
if (!keyDir || !rpcUrl || !['setup', 'approve', 'revoke', 'pause'].includes(action))
  throw new Error('Set WHIRLPOOL_TEST_KEYS and WHIRLPOOL_TEST_RPC_URL; choose setup|approve|revoke|pause');
if (send && !['http://127.0.0.1:8899', 'http://localhost:8899'].includes(rpcUrl) &&
    process.env.WHIRLPOOL_ALLOW_DEVNET_ADMIN !== 'yes')
  throw new Error('Devnet send requires explicit WHIRLPOOL_ALLOW_DEVNET_ADMIN=yes');
const key = async name => createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(
  readFileSync(`${keyDir}/${name}.json`, 'utf8'))));
const [admin, pool, asp, guardian] = await Promise.all(['admin','pool','asp','guardian'].map(key));
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || `RPC HTTP ${response.status}`);
  return body.result;
}
function createAccount(lamports) {
  const data = new Uint8Array(52);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0, true); // SystemProgram::CreateAccount
  view.setBigUint64(4, BigInt(lamports), true);
  view.setBigUint64(12, BigInt(POOL_SIZE), true);
  // base58 decoder gives public-key bytes
  data.set(programBytes, 20);
  return { programAddress: SYSTEM, accounts: [
    { address: admin.address, role: 3 }, { address: pool.address, role: 3 },
  ], data };
}
const { getBase58Encoder } = await import('@solana/kit');
const programBytes = getBase58Encoder().encode(PROGRAM);
const be32 = n => Uint8Array.from(BigInt(n).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
let instructions, signers;
if (action === 'setup') {
  const rent = await rpc('getMinimumBalanceForRentExemption', [POOL_SIZE]);
  instructions = [createAccount(rent), { programAddress: PROGRAM, accounts: [
    { address: pool.address, role: 1 }, { address: asp.address, role: 2 },
    { address: guardian.address, role: 2 },
  ], data: Uint8Array.of(0) }];
  signers = [admin, pool, asp, guardian];
  console.log(`Pool: ${pool.address}; program: ${PROGRAM}; rent: ${rent} lamports`);
} else {
  const data = action === 'approve' ? Uint8Array.of(1, ...be32(singletonApprovalRoot(55n))) :
    action === 'revoke' ? Uint8Array.of(1, ...be32(0n)) : Uint8Array.of(2, 1);
  const authority = action === 'pause' ? guardian : asp;
  instructions = [{ programAddress: PROGRAM, accounts: [
    { address: pool.address, role: 1 }, { address: authority.address, role: 2 },
  ], data }];
  signers = [admin, authority];
  console.log(`Action: ${action}; pool: ${pool.address}; authority: ${authority.address}`);
}
const latest = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
let message = pipe(createTransactionMessage({ version: 1 }),
  m => setTransactionMessageFeePayer(admin.address, m),
  m => setTransactionMessageLifetimeUsingBlockhash(latest.value, m),
  m => setTransactionMessageConfig({ computeUnitLimit: 600_000,
    loadedAccountsDataSizeLimit: 1024 * 1024, priorityFeeLamports: 0n }, m));
for (const instruction of instructions) message = appendTransactionMessageInstruction(instruction, message);
const unsigned = compileTransaction(message);
const simulation = await rpc('simulateTransaction', [getBase64Decoder().decode(getTransactionEncoder().encode(unsigned)),
  { encoding: 'base64', sigVerify: false, commitment: 'confirmed' }]);
console.log(`Unsigned simulation: ${JSON.stringify(simulation.value.err)}; CU: ${simulation.value.unitsConsumed}`);
if (simulation.value.err !== null) throw new Error('Simulation failed; nothing sent');
if (!send) { console.log('Dry run only; pass --send after review'); process.exit(0); }
const signed = await signTransactionWithSigners(signers, unsigned);
const wire = getBase64Decoder().decode(getTransactionEncoder().encode(signed));
const signature = await rpc('sendTransaction', [wire, { encoding: 'base64', skipPreflight: false,
  preflightCommitment: 'confirmed', maxRetries: 0 }]);
console.log(`Submitted: ${signature}`);
for (let i = 0; i < 30; i++) {
  const status = (await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
  if (status?.err) throw new Error(`Chain execution failed: ${JSON.stringify(status.err)}`);
  if (status?.confirmationStatus === 'finalized') {
    console.log(`Finalized: ${signature}; slot: ${status.slot}`); process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error(`Finalization unknown; inspect signature ${signature} before retry`);
