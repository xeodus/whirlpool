import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [port, runsArg, assetArg] = process.argv.slice(2);
const runs = Number(runsArg), asset = Number(assetArg);
if (!/^\d{1,5}$/.test(port || '') || !Number.isInteger(runs) || runs < 1 || runs > 100 || ![0,1].includes(asset))
  throw new Error('Usage: node run-firefox-journey.mjs <port> <runs> <asset: 0|1>');
const out = join(resolve(import.meta.dirname, '..'), 'generated');
const profile = mkdtempSync(join(tmpdir(), 'whirlpool-firefox-journey-'));
const url = `http://127.0.0.1:${port}/journey?runs=${runs}&asset=${asset}&autorun=1`;
const child = spawn('/Applications/Firefox.app/Contents/MacOS/firefox',
  ['--headless', '--no-remote', '--profile', profile, url], { stdio: 'ignore' });
try {
  const started = Date.now();
  const path = join(out, 'restored_journey_browser_result.json');
  let result;
  while (Date.now() - started < Math.max(180_000, runs * 10_000)) {
    if (child.exitCode !== null) throw new Error(`Firefox exited ${child.exitCode}`);
    try {
      if (statSync(path).mtimeMs >= started) {
        result = JSON.parse(readFileSync(path, 'utf8'));
        break;
      }
    } catch { /* still proving */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!result || result.asset !== asset || result.restoredSpendAndExit !== true ||
      !/Firefox\//.test(result.userAgent) || result.timings.transfer_one.length !== runs ||
      result.timings.public_exit.length !== runs) throw new Error('Incomplete Firefox journey');
  copyFileSync(path, join(out, `restored_journey_firefox_asset${asset}_${runs}_result.json`));
  console.log(`Firefox asset ${asset}: ${runs} restored-state transfer and exit proofs verified`);
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
  rmSync(profile, { recursive: true, force: true });
}
