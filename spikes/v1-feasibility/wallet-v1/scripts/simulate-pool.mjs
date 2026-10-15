import { readFileSync } from 'node:fs';
import { getBase64Decoder } from '@solana/kit';
import { buildPoolTransaction } from '../src/pool-transaction.mjs';

const generated = process.env.WHIRLPOOL_RESEARCH_OUTPUT;
const url = process.env.WHIRLPOOL_TEST_RPC_URL;
const action = process.argv[2];
if (!generated || !url || !['shield','transfer','exit','exit_change'].includes(action))
  throw new Error('Set WHIRLPOOL_RESEARCH_OUTPUT and WHIRLPOOL_TEST_RPC_URL; choose shield|transfer|exit|exit_change');
async function rpc(method, params = []) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || `RPC HTTP ${response.status}`);
  return body.result;
}
let data;
if (process.env.WHIRLPOOL_PROOF_INSTRUCTION) {
  data = new Uint8Array(readFileSync(process.env.WHIRLPOOL_PROOF_INSTRUCTION));
} else {
  const fixture = { shield: 'shield', transfer: 'transfer_one', exit: 'public_exit' }[action];
  if (!fixture) throw new Error('Change exit requires WHIRLPOOL_PROOF_INSTRUCTION');
  const proof = readFileSync(`${generated}/${fixture}_restored_instruction.bin`);
  const payload = action === 'exit' ? null : readFileSync(`${generated}/${fixture}_restored_payload.bin`);
  data = Uint8Array.from([action === 'shield' ? 3 : action === 'transfer' ? 4 : 8,
    ...proof, ...(payload ? [payload.length & 255, payload.length >> 8, ...payload] : [])]);
}
const latest = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
const built = await buildPoolTransaction(action, data, latest.value);
const wire = getBase64Decoder().decode(built.bytes);
const simulation = await rpc('simulateTransaction', [wire, { encoding: 'base64', sigVerify: false,
  replaceRecentBlockhash: false, commitment: 'confirmed' }]);
const fee = await rpc('getFeeForMessage', [getBase64Decoder().decode(built.transaction.messageBytes),
  { commitment: 'confirmed' }]);
console.log(JSON.stringify({ action, bytes: built.bytes.length, fee: fee.value,
  error: simulation.value.err, units: simulation.value.unitsConsumed,
  logs: simulation.value.err ? simulation.value.logs : undefined }));
