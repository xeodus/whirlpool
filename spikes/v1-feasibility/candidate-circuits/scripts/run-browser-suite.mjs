import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const debugPort = process.argv[2];
const serverPort = process.argv[3];
if (!/^\d{1,5}$/.test(debugPort || '') || !/^\d{1,5}$/.test(serverPort || '')) {
  throw new Error('Pass local DevTools and benchmark server ports');
}
const runArgument = process.argv[4]?.match(/^--runs=(\d+)$/);
const runs = runArgument ? Number(runArgument[1]) : 3;
const names = process.argv.slice(runArgument ? 5 : 4);
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
if (!Number.isInteger(runs) || runs < 1 || runs > 100 ||
  names.length === 0 || names.some(name => !allowed.has(name))) throw new Error('Choose 1-100 runs and supported circuits');
const out = join(resolve(import.meta.dirname, '..'), 'generated');
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const target = targets.find(item => item.type === 'page' &&
  (item.url.includes('127.0.0.1') || item.url === 'about:blank'));
if (!target) throw new Error('No local benchmark page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 1;
function navigate(name) {
  const id = nextId++;
  const url = `http://127.0.0.1:${serverPort}/?circuit=${name}&runs=${runs}&autorun=1`;
  return new Promise((resolve, reject) => {
    const handler = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      ws.removeEventListener('message', handler);
      message.error ? reject(new Error(message.error.message)) : resolve();
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: 'Page.navigate', params: { url } }));
  });
}
for (const name of names) {
  const resultPath = join(out, `${name}_browser_result.json`);
  const progressPath = join(out, `${name}_browser_progress.json`);
  const started = Date.now();
  await navigate(name);
  let result;
  while (Date.now() - started < Math.max(120_000, runs * 6_000)) {
    try {
      if (statSync(resultPath).mtimeMs >= started) {
        result = JSON.parse(readFileSync(resultPath, 'utf8'));
        break;
      }
    } catch { /* Result has not been saved. */ }
    try {
      if (statSync(progressPath).mtimeMs >= started) {
        const progress = JSON.parse(readFileSync(progressPath, 'utf8'));
        if (progress.stage.startsWith('failed:')) throw new Error(`${name}: ${progress.stage}`);
      }
    } catch (error) {
      if (error.message.startsWith(`${name}:`)) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!result) throw new Error(`${name}: browser result timed out`);
  const warm = result.timesMs.slice(1).sort((a, b) => a - b);
  const p95 = warm[Math.ceil(warm.length * 0.95) - 1];
  console.log(`${name}: runs=${result.timesMs.length}, first=${result.timesMs[0].toFixed(0)} ms, warm_p95=${p95?.toFixed(0) ?? 'n/a'} ms, warm_max=${warm.at(-1)?.toFixed(0) ?? 'n/a'} ms`);
}
ws.close();
