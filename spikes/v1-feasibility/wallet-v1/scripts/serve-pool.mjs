import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSignedPool } from '../src/pool-validate.mjs';

const root = resolve(import.meta.dirname, '..');
const generated = process.env.WHIRLPOOL_RESEARCH_OUTPUT;
const rpcUrl = process.env.WHIRLPOOL_DEVNET_RPC_URL;
if (!generated || !rpcUrl) throw new Error('Set isolated WHIRLPOOL_RESEARCH_OUTPUT and WHIRLPOOL_DEVNET_RPC_URL');
const allowedRpc = new Set(['getLatestBlockhash','getBalance','simulateTransaction','getFeeForMessage',
  'getSignaturesForAddress','getTransaction','getAccountInfo','getSignatureStatuses']);
const sent = new Set();
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'unsafe-inline'");
  if (req.method === 'GET') {
    let file, type;
    if (req.url === '/') [file, type] = [resolve(root, 'web/pool.html'), 'text/html; charset=utf-8'];
    else if (req.url === '/pool.js') [file, type] = [resolve(root, 'generated/pool.js'), 'text/javascript; charset=utf-8'];
    else if (req.url === '/snarkjs.js') [file, type] = [resolve(root, '../candidate-circuits/node_modules/snarkjs/build/snarkjs.min.js'), 'text/javascript; charset=utf-8'];
    else {
      const match = /^\/(wasm|zkey|vk)\/(shield|transfer_one|public_exit)$/.exec(req.url);
      if (match) {
        const [, kind, name] = match;
        file = resolve(generated, kind === 'wasm' ? `${name}_js/${name}.wasm` :
          kind === 'zkey' ? `${name}_final.zkey` : `${name}_vk.json`);
        type = kind === 'vk' ? 'application/json' : 'application/octet-stream';
      }
    }
    if (!file) { res.writeHead(404).end(); return; }
    try {
      const stat = statSync(file);
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404).end('Missing research artifact'); }
    return;
  }
  if (req.method !== 'POST' || !['/rpc','/broadcast'].includes(req.url) ||
      req.headers.origin !== `http://127.0.0.1:${server.address().port}`) {
    res.writeHead(404).end(); return;
  }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 9_000) throw new Error('Request too large');
    }
    const body = JSON.parse(raw);
    let method, params, checked;
    if (req.url === '/broadcast') {
      checked = await validateSignedPool(body.transaction);
      if (sent.has(checked.action)) throw new Error('This action already had a broadcast attempt; inspect history');
      sent.add(checked.action); // An ambiguous send must be read back, never automatically retried.
      method = 'sendTransaction';
      params = [body.transaction, { encoding: 'base64', skipPreflight: false,
        preflightCommitment: 'confirmed', maxRetries: 0 }];
    } else {
      method = body.method; params = body.params;
      if (!allowedRpc.has(method) || !Array.isArray(params)) throw new Error('Unsupported RPC method');
      if (method === 'simulateTransaction' &&
          (typeof params[0] !== 'string' || params[0].length > 6000 ||
            params[1]?.encoding !== 'base64' || params[1]?.sigVerify !== false))
        throw new Error('Invalid simulation request');
    }
    const upstream = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
    const result = await upstream.json();
    if (!upstream.ok || result.error) throw new Error(result.error?.message || `RPC HTTP ${upstream.status}`);
    if (checked && result.result !== checked.signature) throw new Error('RPC signature mismatch; inspect history');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(checked ? { signature: checked.signature } : { jsonrpc: '2.0', id: 1, result: result.result }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
  }
});
const port = Number(process.env.WHIRLPOOL_POOL_PORT || 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
server.listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${server.address().port}/`));
