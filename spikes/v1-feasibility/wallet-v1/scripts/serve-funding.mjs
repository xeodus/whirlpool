import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSignedFunding } from '../src/funding-validate.mjs';

const root = resolve(import.meta.dirname, '..');
const rpcUrl = process.env.WHIRLPOOL_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const allowed = new Set(['getLatestBlockhash', 'getBalance', 'simulateTransaction', 'getFeeForMessage']);
let broadcastAttempted = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'");
  if (req.method === 'GET' && (req.url === '/' || req.url === '/funding.js')) {
    const path = req.url === '/' ? 'web/funding.html' : 'generated/funding.js';
    res.setHeader('Content-Type', req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
    try { res.end(readFileSync(resolve(root, path))); } catch { res.writeHead(404).end('Build funding bundle first'); }
    return;
  }
  if (req.method !== 'POST' || !['/rpc', '/broadcast'].includes(req.url) ||
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
      if (broadcastAttempted) throw new Error('One-shot broadcast already attempted');
      checked = await validateSignedFunding(body.transaction);
      broadcastAttempted = true; // Set before network request: ambiguous outcomes require readback.
      method = 'sendTransaction';
      params = [body.transaction, { encoding: 'base64', skipPreflight: false,
        preflightCommitment: 'confirmed', maxRetries: 0 }];
    } else {
      method = body.method; params = body.params;
      if (!allowed.has(method) || !Array.isArray(params)) throw new Error('Unsupported RPC method');
      if (method === 'simulateTransaction' &&
          (typeof params[0] !== 'string' || params[0].length > 6000 ||
            params[1]?.encoding !== 'base64' || params[1]?.sigVerify !== false))
        throw new Error('Invalid simulation request');
    }
    const upstream = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    const result = await upstream.json();
    if (!upstream.ok || result.error) throw new Error(result.error?.message || `RPC HTTP ${upstream.status}`);
    if (checked && result.result !== checked.signature) throw new Error('RPC signature mismatch; inspect history');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(checked ? { signature: checked.signature } : { result: result.result }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
  }
});
const port = Number(process.env.WHIRLPOOL_FUNDING_PORT || 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid loopback port');
server.listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${server.address().port}/`));
