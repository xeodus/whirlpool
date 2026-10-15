// Disposable in-memory Devnet admin. No keypair file, automatic funding, or automatic send.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline';

const require = createRequire(new URL('../wallet-v1/package.json', import.meta.url));
const { generateKeyPairSigner } = require('@solana/kit');
const tree = resolve(process.argv[2] ?? '');
if (!tree.startsWith('/private/tmp/whirlpool-devnet-'))
  throw new Error('Pass an isolated /private/tmp/whirlpool-devnet-* tree');
if (!process.argv.includes('--check-transport'))
  throw new Error('Retired: an in-memory admin signer stranded funded Devnet SOL after process loss. Design a recoverable Devnet-only admin before another funded run.');
const artifact = `${tree}/pool/target/deploy/whirlpool_feasibility_pool.so`;
const bytes = readFileSync(artifact);
const digest = createHash('sha256').update(bytes).digest('hex');
const signer = await generateKeyPairSigner(true);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', signer.keyPair.privateKey));
const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', signer.keyPair.publicKey));
const keyBytes = Uint8Array.from([...pkcs8.slice(-32), ...publicKey]);
pkcs8.fill(0);
const keyJson = JSON.stringify(Array.from(keyBytes));
keyBytes.fill(0);

function cli(args, withSigner = false, timeout = 30_000) {
  const result = spawnSync('solana', args, {
    input: withSigner ? keyJson : undefined,
    encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NO_DNA: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Solana CLI status ${result.status}`);
  return result.stdout.trim();
}
async function cliViaFifo(args, timeout = 30_000) {
  const directory = mkdtempSync('/private/tmp/whirlpool-signer-');
  const fifo = `${directory}/key`;
  const made = spawnSync('mkfifo', ['-m', '600', fifo]);
  if (made.status !== 0) throw new Error('Could not create private key pipe');
  const writer = spawn(process.execPath, [new URL('./fifo-writer.mjs', import.meta.url).pathname, fifo],
    { stdio: ['pipe', 'ignore', 'ignore'] });
  writer.stdin.end(keyJson);
  try {
    const child = spawn('solana', args.map(arg => arg === '@IN_MEMORY_KEY@' ? fifo : arg),
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_DNA: '1' } });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; if (stdout.length > 4_000_000) child.kill(); });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; if (stderr.length > 4_000_000) child.kill(); });
    const timer = setTimeout(() => child.kill(), timeout);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearTimeout(timer);
    if (code !== 0) throw new Error(stderr.trim() || `Solana CLI status ${code}`);
    return stdout.trim();
  } finally {
    writer.kill();
    rmSync(directory, { recursive: true, force: true });
  }
}
if (cli(['address', '--keypair', '-'], true) !== signer.address)
  throw new Error('CLI rejected the in-memory admin signer');
if (process.argv.includes('--check-transport')) {
  try {
    await cliViaFifo(['program', 'deploy', '--use-rpc', '-u', 'http://127.0.0.1:59999',
      '--keypair', '@IN_MEMORY_KEY@', '--output', 'json', artifact], 15_000);
    throw new Error('Unexpected local endpoint response');
  } catch (error) {
    if (/Input must be a JSON array|keypair|signer/i.test(error.message)) throw error;
    if (!/error sending request|Connection refused|connect error/i.test(error.message)) throw error;
    console.log('Repeated CLI key reads succeeded; unreachable local RPC stopped before any send.');
  }
  process.exit(0);
}
console.log(`Cluster: Solana Devnet only`);
console.log(`Disposable admin public address: ${signer.address}`);
console.log(`Program artifact SHA-256: ${digest}`);
console.log('Commands: balance, deploy APPROVED:<artifact-sha256>, action APPROVED:<name>:<script-sha256>, quit');
console.log('Deploy uses CLI preflight, public Devnet RPC, and this in-memory fee payer. Do not invoke without a separate concrete transaction review.');

const input = readline.createInterface({ input: process.stdin, terminal: false });
for await (const raw of input) {
  const command = raw.trim();
  try {
    if (command === 'balance') {
      console.log(`Admin balance: ${cli(['balance', signer.address, '-u', 'devnet'])}`);
    } else if (command === `deploy APPROVED:${digest}`) {
      if (createHash('sha256').update(readFileSync(artifact)).digest('hex') !== digest)
        throw new Error('Artifact changed after review');
      console.log('Starting approved Devnet-only CLI deployment with preflight; no real assets.');
      console.log(await cliViaFifo(['program', 'deploy', '--use-rpc', '-u', 'devnet',
        '--keypair', '@IN_MEMORY_KEY@', '--output', 'json', artifact], 900_000));
    } else if (/^action APPROVED:[a-z][a-z0-9-]*:[0-9a-f]{64}$/.test(command)) {
      const [, name, expected] = /^action APPROVED:([a-z][a-z0-9-]*):([0-9a-f]{64})$/.exec(command);
      const path = resolve(import.meta.dirname, 'actions', `${name}.mjs`);
      if (!path.startsWith(resolve(import.meta.dirname, 'actions') + '/')) throw new Error('Bad action path');
      const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
      if (actual !== expected) throw new Error('Admin action changed after review');
      const module = await import(`${pathToFileURL(path).href}?sha256=${actual}`);
      if (typeof module.run !== 'function') throw new Error('Admin action has no run function');
      await module.run({ signer, tree, artifact });
    } else if (command === 'quit') {
      input.close();
      break;
    } else {
      console.log('Unknown command; no transaction sent.');
    }
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
  }
}
