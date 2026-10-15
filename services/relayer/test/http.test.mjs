import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRelayerHandler } from '../src/http.mjs';
import { createSolanaRpc } from '../src/runtime.mjs';

const url = 'https://alpha.example/api/relayer';
const handler = createRelayerHandler({ siteOrigin: 'https://alpha.example',
  runtime: async () => { throw new Error('Runtime should not be reached'); } });
const request = (body, headers = {}) => new Request(url, { method: 'POST',
  headers: { Origin: 'https://alpha.example', 'Content-Type': 'application/json', ...headers }, body });

test('HTTP route rejects other origins, bad encoding and oversized requests before runtime', async () => {
  assert.equal((await handler(request('{}', { Origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(request('{bad'))).status, 400);
  assert.equal((await handler(request(JSON.stringify({ instruction: '???' })))).status, 400);
  assert.equal((await handler(request('x'.repeat(8193)))).status, 400);
});

test('RPC transport allows only required methods and does not expose URL in errors', async () => {
  const rpc = createSolanaRpc('https://devnet.example/?api-key=secret', async (_, options) => {
    assert.equal(JSON.parse(options.body).method, 'getGenesisHash');
    return { ok: true, json: async () => ({ result: 'genesis' }) };
  });
  assert.equal(await rpc('getGenesisHash', []), 'genesis');
  await assert.rejects(rpc('getProgramAccounts', []), /not allowed/);
  assert.throws(() => createSolanaRpc('http://devnet.example'), /HTTPS/);
});
