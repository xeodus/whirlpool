// Read-only check after a wallet broadcast error; do not infer failure from HTTP status alone.
import { decompileTransactionMessage, getBase64Encoder,
  getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { buildUnsignedMemoTransaction } from '../src/transaction.mjs';
const address = process.argv[2];
if (!address) throw new Error('Usage: node scripts/readback.mjs <public-devnet-address>');
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
const signatures = await rpc('getSignaturesForAddress', [address, { limit: 20, commitment: 'confirmed' }]);
const found = [];
for (const entry of signatures) {
  const tx = await rpc('getTransaction', [entry.signature, {
    commitment: 'confirmed', encoding: 'base64', maxSupportedTransactionVersion: 1,
  }]);
  let expectedMemo = false, bytes = null;
  if (tx?.version === 1 && Array.isArray(tx.transaction)) {
    const wire = getBase64Encoder().encode(tx.transaction[0]);
    bytes = wire.length;
    const decoded = getTransactionDecoder().decode(wire);
    const message = decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(decoded.messageBytes));
    if (message.feePayer.address === address) {
      const expected = buildUnsignedMemoTransaction(address, message.lifetimeConstraint);
      expectedMemo = decoded.messageBytes.length === expected.transaction.messageBytes.length &&
        decoded.messageBytes.every((byte, i) => byte === expected.transaction.messageBytes[i]);
    }
  }
  found.push({ signature: entry.signature, slot: entry.slot, confirmationStatus: entry.confirmationStatus,
    err: entry.err, memo: entry.memo?.slice(0, 100) ?? null, version: tx?.version ?? null,
    bytes, expectedMemo, feeLamports: tx?.meta?.fee ?? null });
}
console.log(JSON.stringify({ address, fetched: found.length, transactions: found }, null, 2));
