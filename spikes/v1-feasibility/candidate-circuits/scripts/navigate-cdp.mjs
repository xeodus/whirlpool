const port = process.argv[2];
const url = new URL(process.argv[3]);
if (!/^\d{1,5}$/.test(port || '') || url.hostname !== '127.0.0.1' ||
  !['/', '/journey'].includes(url.pathname) || !url.searchParams.has('autorun')) {
  throw new Error('Use the local DevTools port and loopback autorun URL');
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1'));
if (!target) throw new Error('No local benchmark page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
const done = new Promise((resolve, reject) => {
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: url.href } }));
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id === 1) message.error ? reject(new Error(message.error.message)) : resolve();
  });
  ws.addEventListener('error', reject);
});
await done;
ws.close();
console.log(`Navigated to ${url.pathname}${url.search}`);
