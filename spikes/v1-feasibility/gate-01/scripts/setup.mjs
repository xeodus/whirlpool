import { mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
mkdirSync(out, { recursive: true });

function run(bin, args) {
  console.log(`$ ${bin} ${args.join(' ')}`);
  execFileSync(join(root, 'node_modules', '.bin', bin), args, {
    cwd: root,
    stdio: 'inherit',
  });
}

run('circom2', ['circuit/square.circom', '--r1cs', '--wasm', '-o', out]);
const ptau0 = join(out, 'pot8_0000.ptau');
const ptau1 = join(out, 'pot8_0001.ptau');
const ptauFinal = join(out, 'pot8_final.ptau');
if (!existsSync(ptauFinal)) {
  run('snarkjs', ['powersoftau', 'new', 'bn128', '8', ptau0]);
  run('snarkjs', ['powersoftau', 'contribute', ptau0, ptau1,
    '--name=Whirlpool test-only setup', '-e=whirlpool-v1-feasibility-test-only-entropy']);
  run('snarkjs', ['powersoftau', 'prepare', 'phase2', ptau1, ptauFinal]);
}
const zkey0 = join(out, 'square_0000.zkey');
const zkey = join(out, 'square_final.zkey');
run('snarkjs', ['groth16', 'setup', join(out, 'square.r1cs'), ptauFinal, zkey0]);
run('snarkjs', ['zkey', 'contribute', zkey0, zkey,
  '--name=Whirlpool test-only phase2', '-e=whirlpool-v1-feasibility-test-only-phase2']);
run('snarkjs', ['zkey', 'export', 'verificationkey', zkey, join(out, 'verification_key.json')]);
console.log('Test-only proving artifacts generated. Do not deploy these keys.');
