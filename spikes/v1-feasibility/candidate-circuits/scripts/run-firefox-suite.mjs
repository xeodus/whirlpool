import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [port, runsArg, ...names] = process.argv.slice(2);
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const runs = Number(runsArg);
if (!/^\d{1,5}$/.test(port || '') || !Number.isInteger(runs) || runs < 1 || runs > 100 ||
    !names.length || names.some(name => !allowed.has(name))) {
  throw new Error('Usage: node run-firefox-suite.mjs <server port> <runs> <circuit...>');
}
const out = join(resolve(import.meta.dirname, '..'), 'generated');
for (const name of names) {
  const profile = mkdtempSync(join(tmpdir(), 'whirlpool-firefox-'));
  const url = `http://127.0.0.1:${port}/?circuit=${name}&runs=${runs}&autorun=1`;
  const child = spawn('/Applications/Firefox.app/Contents/MacOS/firefox',
    ['--headless', '--no-remote', '--profile', profile, url], { stdio: 'ignore' });
  try {
    const started = Date.now();
    const path = join(out, `${name}_browser_result.json`);
    const progressPath = join(out, `${name}_browser_progress.json`);
    let result;
    while (Date.now() - started < Math.max(180_000, runs * 10_000)) {
      if (child.exitCode !== null) throw new Error(`${name}: Firefox exited ${child.exitCode}`);
      try {
        if (statSync(path).mtimeMs >= started) {
          result = JSON.parse(readFileSync(path, 'utf8'));
          break;
        }
      } catch { /* still proving */ }
      try {
        if (statSync(progressPath).mtimeMs >= started) {
          const progress = JSON.parse(readFileSync(progressPath, 'utf8'));
          if (progress.stage.startsWith('failed:')) throw new Error(`${name}: ${progress.stage}`);
        }
      } catch (error) { if (error.message.startsWith(`${name}:`)) throw error; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!result) throw new Error(`${name}: timed out`);
    if (!/Firefox\//.test(result.userAgent) || result.timesMs.length !== runs)
      throw new Error('Wrong browser or run count');
    copyFileSync(path, join(out, `${name}_firefox_${runs}_result.json`));
    const warm = result.timesMs.slice(1).sort((a, b) => a - b);
    console.log(`${name}: first ${result.timesMs[0].toFixed(0)} ms, warm p95 ${warm[Math.ceil(warm.length * .95) - 1]?.toFixed(0) ?? 'n/a'} ms`);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    rmSync(profile, { recursive: true, force: true });
  }
}
