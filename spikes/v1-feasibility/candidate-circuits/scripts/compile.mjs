import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
mkdirSync(out, { recursive: true });
const names = ['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit'];
for (const name of names) {
  console.log(`Compiling ${name}`);
  execFileSync(join(root, 'node_modules', '.bin', 'circom2'), [
    `circuits/${name}.circom`, '--r1cs', '--wasm', '-o', out,
  ], { cwd: root, stdio: 'inherit' });
}
