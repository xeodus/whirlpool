// Feeds an in-memory disposable signer to repeated CLI opens of a named pipe.
// The FIFO contains no persistent bytes and is removed by its parent process.
import { openSync, writeSync, closeSync } from 'node:fs';

const path = process.argv[2];
if (!path?.startsWith('/private/tmp/whirlpool-signer-')) throw new Error('Invalid FIFO path');
let key = '';
for await (const chunk of process.stdin) key += chunk;
if (!/^\[(?:\d{1,3},){63}\d{1,3}\]$/.test(key)) throw new Error('Invalid disposable key encoding');
for (;;) {
  const fd = openSync(path, 'w');
  try { writeSync(fd, key); } finally { closeSync(fd); }
  // Let the current reader observe EOF before serving the next open.
  await new Promise(resolve => setTimeout(resolve, 200));
}
