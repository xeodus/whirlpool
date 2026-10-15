import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const files = new Map([
  ['/', [join(root, 'web', 'index.html'), 'text/html; charset=utf-8']],
  ['/snarkjs.min.js', [join(root, 'node_modules', 'snarkjs', 'build', 'snarkjs.min.js'), 'text/javascript']],
  ['/square.wasm', [join(out, 'square_js', 'square.wasm'), 'application/wasm']],
  ['/square_final.zkey', [join(out, 'square_final.zkey'), 'application/octet-stream']],
  ['/verification_key.json', [join(out, 'verification_key.json'), 'application/json']],
]);

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const pathName = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && files.has(pathName)) {
    const [path, type] = files.get(pathName);
    try {
      res.setHeader('Content-Type', type);
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404).end('Run npm run setup first');
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/fixture') {
    if (req.headers.origin !== `http://127.0.0.1:${server.address().port}`) {
      res.writeHead(403).end('Wrong origin');
      return;
    }
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 16_384) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.publicSignals?.length !== 1 || parsed.publicSignals[0] !== '49' || !parsed.proof) {
          throw new Error('Unexpected proof fixture');
        }
        writeFileSync(join(out, 'browser-proof.json'), JSON.stringify(parsed, null, 2));
        res.writeHead(201).end('Saved');
      } catch {
        res.writeHead(400).end('Invalid fixture');
      }
    });
    return;
  }
  res.writeHead(404).end('Not found');
});

server.listen(0, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${server.address().port}/`);
});
