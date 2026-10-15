import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const bin = join(root, 'node_modules', '.bin', 'snarkjs');
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const names = process.argv.slice(2);
if (names.length === 0 || names.some(name => !allowed.has(name))) {
  throw new Error(`Select one or more of: ${Array.from(allowed).join(', ')}`);
}
function run(args) {
  const started = performance.now();
  console.log(`$ snarkjs ${args[0]} ${args[1]}`);
  execFileSync(bin, args, { cwd: root, stdio: 'inherit' });
  console.log(`Completed in ${((performance.now() - started) / 1000).toFixed(2)} s`);
}

const ptau0 = join(out, 'pot16_0000.ptau');
const ptau1 = join(out, 'pot16_0001.ptau');
const ptau = join(out, 'pot16_final.ptau');
if (!existsSync(ptau)) {
  run(['powersoftau', 'new', 'bn128', '16', ptau0]);
  run(['powersoftau', 'contribute', ptau0, ptau1,
    '--name=Whirlpool research only', '-e=publicly-known-whirlpool-research-entropy']);
  run(['powersoftau', 'prepare', 'phase2', ptau1, ptau]);
}
run(['powersoftau', 'verify', ptau]);
for (const name of names) {
  const r1cs = join(out, `${name}.r1cs`);
  const zkey0 = join(out, `${name}_0000.zkey`);
  const zkey = join(out, `${name}_final.zkey`);
  if (!existsSync(r1cs)) throw new Error(`Compile ${name} first`);
  run(['groth16', 'setup', r1cs, ptau, zkey0]);
  run(['zkey', 'contribute', zkey0, zkey,
    '--name=Whirlpool research only', '-e=publicly-known-whirlpool-research-phase2']);
  run(['zkey', 'verify', r1cs, ptau, zkey]);
  run(['zkey', 'export', 'verificationkey', zkey, join(out, `${name}_vk.json`)]);
}
console.log('Generated insecure test-only keys. Never use them for funds.');
