import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const staticFiles = new Map([
  ['/', [join(root, 'web', 'index.html'), 'text/html; charset=utf-8']],
  ['/journey', [join(root, 'web', 'journey.html'), 'text/html; charset=utf-8']],
  ['/journey.js', [join(root, '..', 'recovery', 'generated', 'browser-journey.js'), 'text/javascript; charset=utf-8']],
  ['/wallet-check', [join(root, 'web', 'wallet-check.html'), 'text/html; charset=utf-8']],
  ['/wallet-check.js', [join(root, '..', 'recovery', 'generated', 'wallet-check.js'), 'text/javascript; charset=utf-8']],
  ['/main.js', [join(root, 'web', 'main.js'), 'text/javascript; charset=utf-8']],
  ['/snarkjs.min.js', [join(root, 'node_modules', 'snarkjs', 'build', 'snarkjs.min.js'), 'text/javascript']],
]);

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // snarkjs 0.7.6 creates Blob-backed workers for Groth16; production CSP
  // and worker packaging require a separate security review.
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'self'");
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'GET') {
    let item = staticFiles.get(pathname);
    const match = /^\/(wasm|zkey|input|vk)\/([a-z_]+)$/.exec(pathname);
    if (match && allowed.has(match[2])) {
      const [, kind, name] = match;
      item = kind === 'wasm' ? [join(out, `${name}_js`, `${name}.wasm`), 'application/wasm']
        : kind === 'zkey' ? [join(out, `${name}_final.zkey`), 'application/octet-stream']
        : kind === 'input' ? [join(out, 'inputs', `${name}.json`), 'application/json']
        : [join(out, `${name}_vk.json`), 'application/json'];
    }
    if (item) {
      try {
        res.setHeader('Content-Type', item[1]);
        res.end(readFileSync(item[0]));
      } catch {
        res.writeHead(404).end('Generate circuit artifacts first');
      }
      return;
    }
  }
  if (req.method === 'POST' && (pathname === '/results' || pathname === '/progress' || pathname === '/journey-results')) {
    if (req.headers.origin !== `http://127.0.0.1:${server.address().port}`) {
      res.writeHead(403).end('Wrong origin');
      return;
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > (pathname === '/progress' ? 2_000 : 128_000)) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (pathname === '/journey-results') {
          if (typeof data.userAgent !== 'string' || data.userAgent.length > 500 || ![0, 1].includes(data.asset) ||
            data.restoredSpendAndExit !== true || !data.timings ||
            !['shield', 'transfer_one', 'public_exit'].every(name =>
              Array.isArray(data.timings[name]) && data.timings[name].length >= 1 &&
              data.timings[name].length <= 100 &&
              data.timings[name].every(n => Number.isFinite(n) && n >= 0))) {
            throw new Error('Invalid journey result');
          }
          writeFileSync(join(out, 'restored_journey_browser_result.json'), JSON.stringify(data, null, 2));
          res.writeHead(201).end('Saved');
          return;
        }
        if (pathname === '/progress') {
          if (!allowed.has(data.circuit) || typeof data.stage !== 'string' || data.stage.length > 200) {
            throw new Error('Invalid progress');
          }
          writeFileSync(join(out, `${data.circuit}_browser_progress.json`), JSON.stringify(data, null, 2));
          res.writeHead(201).end('Saved');
          return;
        }
        if (!allowed.has(data.circuit) || !Array.isArray(data.timesMs) ||
          data.timesMs.length < 1 || data.timesMs.length > 100 ||
          !data.timesMs.every(n => Number.isFinite(n) && n >= 0) ||
          !Array.isArray(data.publicSignals) || !data.proof ||
          typeof data.userAgent !== 'string' || data.userAgent.length > 500) {
          throw new Error('Invalid result');
        }
        writeFileSync(join(out, `${data.circuit}_browser_result.json`), JSON.stringify(data, null, 2));
        res.writeHead(201).end('Saved');
      } catch {
        res.writeHead(400).end('Invalid result');
      }
    });
    return;
  }
  res.writeHead(404).end('Not found');
});

server.listen(0, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${server.address().port}/?circuit=transfer_one&runs=3`);
});
