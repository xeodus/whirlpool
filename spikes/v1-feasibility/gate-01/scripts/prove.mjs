import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as snarkjs from 'snarkjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const wasm = join(out, 'square_js', 'square.wasm');
const zkey = join(out, 'square_final.zkey');
const vk = JSON.parse(readFileSync(join(out, 'verification_key.json'), 'utf8'));
const { proof, publicSignals } = await snarkjs.groth16.fullProve({ secret: '7' }, wasm, zkey);
if (publicSignals.length !== 1 || publicSignals[0] !== '49') {
  throw new Error(`Unexpected public signals: ${JSON.stringify(publicSignals)}`);
}
if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) {
  throw new Error('The Node-generated proof did not verify');
}
writeFileSync(join(out, 'node-proof.json'), JSON.stringify({ proof, publicSignals }, null, 2));
console.log('Verified Node fixture: secret=7, public square=49');
// snarkjs worker threads can keep this one-shot CLI process alive.
process.exit(0);
