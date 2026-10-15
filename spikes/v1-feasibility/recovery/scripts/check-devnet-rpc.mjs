// Read-only. Pass provider URLs through environment variables; never print them.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
const programBytes = statSync(resolve(import.meta.dirname, '../../pool/target/deploy/whirlpool_feasibility_pool.so')).size;
const urls = [process.env.WHIRLPOOL_DEVNET_RPC_URL,
  process.env.WHIRLPOOL_SECONDARY_RPC_URL || 'https://api.devnet.solana.com'].filter(Boolean);
if (!urls.length) throw new Error('No devnet RPC configured');
async function rpc(url, method, params = []) {
  const started = performance.now();
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return { value: body.result, ms: Math.round(performance.now() - started) };
}
for (let i = 0; i < urls.length; i++) {
  try {
    const version = await rpc(urls[i], 'getVersion');
    const slot = await rpc(urls[i], 'getSlot', [{ commitment: 'finalized' }]);
    const v1Feature = await rpc(urls[i], 'getAccountInfo', [
      'txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL',
      { encoding: 'base64', commitment: 'finalized' },
    ]);
    const featureAccount = v1Feature.value?.value;
    const featureData = featureAccount?.data?.[0] ? Buffer.from(featureAccount.data[0], 'base64') : null;
    const v1ActivationSlot = featureData?.length === 9 && featureData[0] === 1
      ? Number(featureData.readBigUInt64LE(1)) : null;
    const rents = {};
    for (const [name, bytes] of [['pool', 2513], ['nullifier', 1], ['mint', 82],
      ['tokenAccount', 165], ['programDataEstimate', programBytes + 45], ['programAccountEstimate', 36]]) {
      rents[name] = (await rpc(urls[i], 'getMinimumBalanceForRentExemption', [bytes])).value;
    }
    console.log(JSON.stringify({ provider: i + 1, version: version.value['solana-core'], programBytes,
      v1FeatureAccountPresent: Boolean(featureAccount),
      v1ActivationSlot,
      finalizedSlot: slot.value, versionMs: version.ms, slotMs: slot.ms, rentLamports: rents }));
  } catch (error) {
    console.error(JSON.stringify({ provider: i + 1, error: error.message }));
    process.exitCode = 1;
  }
}
