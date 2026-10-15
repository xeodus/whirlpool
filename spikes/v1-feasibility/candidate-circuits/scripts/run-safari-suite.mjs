import { copyFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [session, port, runsArg, ...names] = process.argv.slice(2);
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const runs = Number(runsArg);
if (!/^[\w-]+$/.test(session || '') || !/^\d{1,5}$/.test(port || '') ||
    !Number.isInteger(runs) || runs < 1 || runs > 100 ||
    !names.length || names.some(name => !allowed.has(name))) {
  throw new Error('Usage: node run-safari-suite.mjs <WebDriver session> <server port> <runs> <circuit...>');
}
const out = join(resolve(import.meta.dirname, '..'), 'generated');
async function webdriver(path, data) {
  const response = await fetch(`http://127.0.0.1:4444/session/${session}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(result.value?.message || `WebDriver ${response.status}`);
  return result.value;
}
for (const name of names) {
  const started = Date.now();
  await webdriver('url', { url: `http://127.0.0.1:${port}/?circuit=${name}&runs=${runs}&autorun=1` });
  const path = join(out, `${name}_browser_result.json`);
  let result;
  while (Date.now() - started < Math.max(180_000, runs * 20_000)) {
    try {
      if (statSync(path).mtimeMs >= started) {
        result = JSON.parse(readFileSync(path, 'utf8'));
        break;
      }
    } catch { /* still proving */ }
    const status = await webdriver('execute/sync', {
      script: 'return document.getElementById("status")?.textContent', args: [],
    });
    if (typeof status === 'string' && status.startsWith('Failed:')) throw new Error(`${name}: ${status}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!result) throw new Error(`${name}: timed out`);
  if (!/Safari\//.test(result.userAgent) || result.timesMs.length !== runs) throw new Error('Wrong browser or run count');
  copyFileSync(path, join(out, `${name}_safari_${runs}_result.json`));
  const warm = result.timesMs.slice(1).sort((a, b) => a - b);
  console.log(`${name}: first ${result.timesMs[0].toFixed(0)} ms, warm p95 ${warm[Math.ceil(warm.length * .95) - 1]?.toFixed(0) ?? 'n/a'} ms`);
}
