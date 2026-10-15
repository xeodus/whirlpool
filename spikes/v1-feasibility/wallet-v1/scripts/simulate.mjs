// Read-only CLI counterpart to the browser page. Takes a public fee-payer address.
import { getBase64Decoder } from '@solana/kit';
import { buildUnsignedMemoTransaction } from '../src/transaction.mjs';

const feePayer = process.argv[2];
if (!feePayer) throw new Error('Usage: node scripts/simulate.mjs <public-devnet-address>');
async function rpc(method, params) {
  const response = await fetch('https://api.devnet.solana.com', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || `HTTP ${response.status}`);
  return body.result;
}
const blockhash = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
const { bytes, size, transaction } = buildUnsignedMemoTransaction(feePayer, blockhash.value);
const simulation = await rpc('simulateTransaction', [getBase64Decoder().decode(bytes), {
  encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed',
}]);
const fee = await rpc('getFeeForMessage', [getBase64Decoder().decode(transaction.messageBytes),
  { commitment: 'confirmed' }]);
console.log(JSON.stringify({ version: 1, size, simulationError: simulation.value.err,
  unitsConsumed: simulation.value.unitsConsumed, feeLamports: fee.value,
  signed: false, sent: false }));
if (simulation.value.err) process.exitCode = 1;
