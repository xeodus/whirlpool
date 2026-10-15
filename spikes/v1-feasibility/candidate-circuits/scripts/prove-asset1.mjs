import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as snarkjs from 'snarkjs';

const out = join(resolve(import.meta.dirname, '..'), 'generated');
const asset1 = process.argv[2] !== '--asset0';
const suffix = asset1 ? '_asset1' : '';
const defaults = asset1
  ? ['shield', 'transfer_one', 'transfer_two', 'transfer_two_payload821', 'transfer_two_hpke', 'withdraw_one', 'withdraw_two', 'withdraw_two_payload256', 'public_exit', 'public_exit_original']
  : ['transfer_two_payload821', 'withdraw_two_payload256', 'public_exit_original'];
const selected = process.argv.slice(asset1 ? 2 : 3);
const names = selected.length === 0 ? defaults : selected;
if (names.some(name => !defaults.includes(name))) throw new Error(`Choose one or more of: ${defaults.join(', ')}`);
for (const name of names) {
  const circuit = name === 'public_exit_original' ? 'public_exit'
    : name === 'withdraw_two_payload256' ? 'withdraw_two'
      : name === 'transfer_two_payload821' || name === 'transfer_two_hpke' ? 'transfer_two' : name;
  const input = JSON.parse(readFileSync(join(out, 'inputs', `${name}${suffix}.json`), 'utf8'));
  const started = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input,
    join(out, `${circuit}_js`, `${circuit}.wasm`), join(out, `${circuit}_final.zkey`));
  const vk = JSON.parse(readFileSync(join(out, `${circuit}_vk.json`), 'utf8'));
  if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) throw new Error(`${name}: verification failed`);
  if (publicSignals[0] !== (asset1 ? '1' : '0')) throw new Error(`${name}: asset selector mismatch`);
  writeFileSync(join(out, `${name}${suffix}_node_result.json`), JSON.stringify({ proof, publicSignals }));
  console.log(`${name} asset${asset1 ? 1 : 0}: fullProve ${(performance.now() - started).toFixed(0)} ms`);
}
process.exit(0);
