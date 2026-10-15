import { createKeyPairFromBytes, getAddressFromPublicKey, signBytes } from '@solana/kit';
import { createInvitations } from './access.mjs';
import { createRedisRest } from './redis-rest.mjs';
import { createIntentStore } from './store.mjs';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function createServerSigner(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(base64))
    throw new Error('Relayer signer must be a 64-byte base64 secret key');
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  if (bytes.length !== 64) throw new Error('Relayer signer must be 64 bytes');
  try {
    const pair = await createKeyPairFromBytes(bytes);
    return { address: await getAddressFromPublicKey(pair.publicKey),
      sign: message => signBytes(pair.privateKey, message),
      verify: (signature, message) => crypto.subtle.verify('Ed25519', pair.publicKey, signature, message) };
  } finally { bytes.fill(0); }
}

export function createSolanaRpc(url, fetchImpl = fetch) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash)
    throw new Error('RPC endpoint must use HTTPS');
  const methods = new Set(['getGenesisHash', 'getLatestBlockhash', 'simulateTransaction',
    'getFeeForMessage', 'getBalance', 'sendTransaction', 'getSignatureStatuses']);
  return async (method, params) => {
    if (!methods.has(method)) throw new Error('RPC method not allowed');
    const response = await fetchImpl(endpoint, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`RPC request failed (${response.status})`);
    const body = await response.json();
    if (body.error || !Object.hasOwn(body, 'result')) throw new Error('RPC rejected request');
    return body.result;
  };
}

export async function createRuntime(env) {
  if (env.WHIRLPOOL_RELAYER_ENABLED !== 'true') throw new Error('Relayer transaction route is disabled');
  if (!SOLANA_ADDRESS.test(env.WHIRLPOOL_PROGRAM_ID ?? '') ||
      !SOLANA_ADDRESS.test(env.WHIRLPOOL_POOL_ID ?? '')) throw new Error('Missing Devnet pool configuration');
  const rpc = createSolanaRpc(env.WHIRLPOOL_DEVNET_RPC_URL);
  if (!SOLANA_ADDRESS.test(env.WHIRLPOOL_DEVNET_GENESIS_HASH ?? '') ||
      await rpc('getGenesisHash', []) !== env.WHIRLPOOL_DEVNET_GENESIS_HASH)
    throw new Error('RPC cluster does not match configured Devnet genesis');
  return {
    programId: env.WHIRLPOOL_PROGRAM_ID,
    poolId: env.WHIRLPOOL_POOL_ID,
    signer: await createServerSigner(env.WHIRLPOOL_RELAYER_SECRET_KEY_BASE64),
    rpc,
    invites: createInvitations(env.WHIRLPOOL_INVITE_SHA256),
    store: createIntentStore(createRedisRest({ url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN })),
  };
}
