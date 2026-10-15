// Observed RSS high-water during one Safari benchmark; not a true peak or private-memory metric.
import { execFileSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = join(resolve(import.meta.dirname, '..'), 'generated');
const resultPath = join(out, 'transfer_two_safari_100_result.json');
const started = Date.now();
let samples = 0, maxContentRssKiB = 0, maxAllWebKitRssKiB = 0;
while (Date.now() - started < 2_000_000) {
  const rows = execFileSync('ps', ['-axo', 'rss,command'], { encoding: 'utf8' }).split('\n');
  const content = [], all = [];
  for (const row of rows) {
    if (!row.includes('/System/Library/Frameworks/WebKit.framework/') ||
        !row.includes('/XPCServices/com.apple.WebKit.')) continue;
    const rssKiB = Number(row.trim().split(/\s+/, 1)[0]);
    if (!Number.isFinite(rssKiB)) continue;
    all.push(rssKiB);
    if (row.includes('WebContent.xpc')) content.push(rssKiB);
  }
  samples++;
  maxContentRssKiB = Math.max(maxContentRssKiB, ...content, 0);
  maxAllWebKitRssKiB = Math.max(maxAllWebKitRssKiB, all.reduce((sum, rss) => sum + rss, 0));
  const summary = { samples, sampleIntervalSeconds: 5, startedAt: new Date(started).toISOString(),
    lastSampleAt: new Date().toISOString(), maxContentRssKiB, maxAllWebKitRssKiB,
    caveat: 'RSS is sampled and shared pages may be counted more than once; unrelated WebKit processes may be included.' };
  writeFileSync(join(out, 'safari_rss_progress.json'), JSON.stringify(summary, null, 2));
  try { if (statSync(resultPath).mtimeMs >= started) { console.log(JSON.stringify(summary)); break; } }
  catch { /* benchmark not complete */ }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
