import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as snarkjs from 'snarkjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const name = process.argv[2] || 'transfer_one';
const input = JSON.parse(readFileSync(join(out, 'inputs', `${name}.json`), 'utf8'));
const wasm = new Uint8Array(readFileSync(join(out, `${name}_js`, `${name}.wasm`)));
const zkey = new Uint8Array(readFileSync(join(out, `${name}_final.zkey`)));
console.log(`${name}: witness and proof from in-memory artifacts`);
const started = performance.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input, wasm, zkey, undefined, { memorySize: 0 }, { singleThread: true });
console.log(`fullProve took ${(performance.now() - started).toFixed(0)} ms`);
const vk = JSON.parse(readFileSync(join(out, `${name}_vk.json`), 'utf8'));
if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) throw new Error('Verification failed');
console.log('Verified');
process.exit(0);
