import { writeFileSync } from 'node:fs';

const port = Number(process.argv[2]);
const action = process.argv[3] ?? 'shield';
if (!Number.isInteger(port) || !['shield','transfer','exit','exit_change'].includes(action))
  throw new Error('Pass headless Brave DevTools port and shield|transfer|exit|exit_change');
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(x => x.type === 'page' && x.url.includes('127.0.0.1'));
if (!target) throw new Error('No loopback page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true });
});
let id = 0;
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const request = ++id;
    const handler = event => {
      const body = JSON.parse(event.data);
      if (body.id !== request) return;
      ws.removeEventListener('message', handler);
      body.error ? reject(new Error(body.error.message)) : resolve(body.result.result?.value);
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: request, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true } }));
  });
}
await evaluate('location.reload()');
for (let attempt = 0; attempt < 50; attempt++) {
  if (await evaluate(`document.readyState === 'complete' && !!document.getElementById('${action}')`)) break;
  if (attempt === 49) throw new Error(`Page did not load ${action} button`);
  await new Promise(resolve => setTimeout(resolve, 100));
}
await evaluate(`document.getElementById('${action}').click()`);
const start = Date.now();
for (;;) {
  const result = await evaluate("({status:document.getElementById('status').textContent, proofLength:document.getElementById('proof').value.length})");
  if (result.proofLength || /failed:/i.test(result.status)) {
    console.log(JSON.stringify(result));
    if (result.proofLength && process.env.WHIRLPOOL_PROOF_OUT) {
      const encoded = await evaluate("document.getElementById('proof').value");
      writeFileSync(process.env.WHIRLPOOL_PROOF_OUT, Buffer.from(encoded, 'base64'));
    }
    if (!result.proofLength) process.exitCode = 1;
    break;
  }
  if (Date.now() - start > 90_000) throw new Error(`Browser proof timeout: ${result.status}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
ws.close();
