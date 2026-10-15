const port = process.argv[2];
if (!/^\d{1,5}$/.test(port || '')) throw new Error('Pass the local DevTools port');
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1'));
if (!target) throw new Error('No local benchmark page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
  ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: {
    expression: `({status:document.getElementById('status')?.textContent, ready:document.readyState, snarkjs:typeof snarkjs})`,
    returnByValue: true,
  } }));
});
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id === 3) console.log(JSON.stringify(message.result));
  if (message.method === 'Log.entryAdded') console.log('LOG', JSON.stringify(message.params.entry));
  if (message.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', JSON.stringify(message.params.exceptionDetails));
});
await new Promise(resolve => setTimeout(resolve, 5000));
ws.close();
