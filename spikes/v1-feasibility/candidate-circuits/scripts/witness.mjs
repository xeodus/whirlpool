import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const bin = join(root, 'node_modules', '.bin', 'snarkjs');
const names = ['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit'];
for (const name of names) {
  console.log(`Checking ${name} witness`);
  const wtns = join(out, `${name}.wtns`);
  execFileSync(bin, ['wtns', 'calculate', join(out, `${name}_js`, `${name}.wasm`),
    join(out, 'inputs', `${name}.json`), wtns], { cwd: root, stdio: 'inherit' });
  execFileSync(bin, ['wtns', 'check', join(out, `${name}.r1cs`), wtns],
    { cwd: root, stdio: 'inherit' });
}
