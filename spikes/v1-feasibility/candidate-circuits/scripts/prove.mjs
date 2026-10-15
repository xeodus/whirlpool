import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as snarkjs from 'snarkjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const names = process.argv.slice(2);
if (names.length === 0 || names.some(name => !allowed.has(name))) {
  throw new Error(`Select one or more of: ${Array.from(allowed).join(', ')}`);
}
for (const name of names) {
  const zkey = join(out, `${name}_final.zkey`);
  const wtns = join(out, `${name}.wtns`);
  if (!existsSync(zkey) || !existsSync(wtns)) throw new Error(`Run setup and witness for ${name}`);
  const vk = JSON.parse(readFileSync(join(out, `${name}_vk.json`), 'utf8'));
  const started = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns);
  const proofMs = performance.now() - started;
  if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) {
    throw new Error(`${name} proof failed verification`);
  }
  const changed = publicSignals.slice();
  changed[0] = String(BigInt(changed[0]) + 1n);
  if (await snarkjs.groth16.verify(vk, changed, proof)) {
    throw new Error(`${name} tampered public signal accepted`);
  }
  writeFileSync(join(out, `${name}_node_result.json`), JSON.stringify({
    name, proofMs, zkeyBytes: statSync(zkey).size, publicSignals, proof,
  }, null, 2));
  console.log(`${name}: proof ${proofMs.toFixed(0)} ms, ${publicSignals.length} public signals; tampering rejected`);
}
process.exit(0);
