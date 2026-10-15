import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSignedMemo } from '../src/validate.mjs';

const root = resolve(import.meta.dirname, '..');
const rpcUrl = 'https://api.devnet.solana.com';
const allowed = new Set(['getLatestBlockhash', 'getBalance', 'simulateTransaction', 'getFeeForMessage']);
// The approved one-shot test completed and finalized; do not enable again without a new decision.
const ALLOW_BROADCAST = false;
let broadcastAttempted = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'");
  if (req.method === 'GET' && ['/','/browser.js'].includes(req.url)) {
    const path = req.url === '/' ? 'web/index.html' : 'generated/browser.js';
    res.setHeader('Content-Type', req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
    try { res.end(readFileSync(resolve(root, path))); }
    catch { res.writeHead(404).end('Build the browser bundle first'); }
    return;
  }
  if (req.method === 'POST' && req.url === '/broadcast' && ALLOW_BROADCAST &&
      req.headers.origin === `http://127.0.0.1:${server.address().port}`) {
    try {
      if (broadcastAttempted) throw new Error('One-shot broadcast already attempted; check chain history');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8_000) throw new Error('Request too large');
      }
      const { address, transaction } = JSON.parse(raw);
      const checked = await validateSignedMemo(address, transaction);
      broadcastAttempted = true;
      const upstream = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction',
          params: [transaction, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }] }),
        signal: AbortSignal.timeout(15_000) });
      const body = await upstream.json();
      if (!upstream.ok || body.error) throw new Error(body.error?.message || `RPC HTTP ${upstream.status}`);
      if (body.result !== checked.signature) throw new Error('RPC returned a different signature; inspect chain history');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ signature: body.result }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/rpc' ||
      req.headers.origin !== `http://127.0.0.1:${server.address().port}`) {
    res.writeHead(404).end(); return;
  }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10_000) throw new Error('Request too large');
    }
    const { method, params } = JSON.parse(raw);
    if (!allowed.has(method) || !Array.isArray(params)) throw new Error('Unsupported method');
    if (method === 'simulateTransaction' &&
        (typeof params[0] !== 'string' || params[0].length > 6000 || params[1]?.encoding !== 'base64' || params[1]?.sigVerify !== false))
      throw new Error('Invalid simulation request');
    const upstream = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    const result = await upstream.json();
    if (!upstream.ok || result.error) throw new Error(result.error?.message || `RPC HTTP ${upstream.status}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result: result.result }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
  }
});
const port = Number(process.env.WHIRLPOOL_WALLET_TEST_PORT || 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid loopback port');
server.listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${server.address().port}/`));
