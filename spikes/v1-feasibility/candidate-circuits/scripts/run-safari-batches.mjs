import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [session, port, name, batchCountArg, runsArg] = process.argv.slice(2);
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const batches = Number(batchCountArg), runs = Number(runsArg);
if (!/^[\w-]+$/.test(session || '') || !/^\d{1,5}$/.test(port || '') ||
    !allowed.has(name) || !Number.isInteger(batches) || batches < 1 || batches > 20 ||
    !Number.isInteger(runs) || runs < 1 || runs > 100 || batches * runs > 100) {
  throw new Error('Usage: node run-safari-batches.mjs <session> <port> <circuit> <batches> <runs-per-batch>');
}
const out = join(resolve(import.meta.dirname, '..'), 'generated');
async function webdriver(path, data) {
  const response = await fetch(`http://127.0.0.1:4444/session/${session}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(result.value?.message || `WebDriver ${response.status}`);
  return result.value;
}
const results = [];
for (let batch = 1; batch <= batches; batch++) {
  const started = Date.now();
  await webdriver('url', { url: `http://127.0.0.1:${port}/?circuit=${name}&runs=${runs}&autorun=1` });
  const path = join(out, `${name}_browser_result.json`);
  let result;
  while (Date.now() - started < Math.max(180_000, runs * 25_000)) {
    try {
      if (statSync(path).mtimeMs >= started) {
        result = JSON.parse(readFileSync(path, 'utf8'));
        break;
      }
    } catch { /* still proving */ }
    const status = await webdriver('execute/sync', {
      script: 'return document.getElementById("status")?.textContent', args: [],
    });
    if (typeof status === 'string' && status.startsWith('Failed:')) throw new Error(`${name} batch ${batch}: ${status}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!result) throw new Error(`${name} batch ${batch}: timed out`);
  if (!/Safari\//.test(result.userAgent) || result.timesMs.length !== runs)
    throw new Error(`${name} batch ${batch}: wrong browser or run count`);
  copyFileSync(path, join(out, `${name}_safari_batch_${batch}_of_${batches}.json`));
  results.push({ batch, artifactLoadMs: result.artifactLoadMs, timesMs: result.timesMs,
    jsHeapBytes: result.jsHeapBytes });
  const warm = result.timesMs.slice(1).sort((a, b) => a - b);
  console.log(`${name} batch ${batch}/${batches}: first ${result.timesMs[0].toFixed(0)} ms, warm p95 ${warm[Math.ceil(warm.length * .95) - 1]?.toFixed(0) ?? 'n/a'} ms`);
}
const warm = results.flatMap(x => x.timesMs.slice(1)).sort((a, b) => a - b);
const summary = { circuit: name, browser: 'Safari', batches, runsPerBatch: runs,
  completedProofs: batches * runs, warmP95Ms: warm[Math.ceil(warm.length * .95) - 1],
  warmMaxMs: warm.at(-1), results };
writeFileSync(join(out, `${name}_safari_${batches}x${runs}_summary.json`), JSON.stringify(summary, null, 2));
console.log(`${name}: ${summary.completedProofs} proofs in ${batches} fresh pages; combined warm p95 ${summary.warmP95Ms.toFixed(0)} ms`);
