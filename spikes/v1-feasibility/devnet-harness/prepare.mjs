// Prepare an isolated, unsafe Devnet-only verifier build. Does not deploy or sign.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const candidates = join(root, 'candidate-circuits');
const source = join(candidates, 'generated');
const destination = mkdtempSync('/private/tmp/whirlpool-devnet-');
const out = join(destination, 'candidate-circuits', 'generated');
const pool = join(destination, 'pool');
const snarkjs = join(candidates, 'node_modules', '.bin', 'snarkjs');
const names = ['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit'];
const fq = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
console.log(`Isolated test setup directory: ${destination}`);

function run(args) {
  // Entropy is test-only; never echo the command or its arguments.
  execFileSync(snarkjs, args, { stdio: 'inherit' });
}
function be32(value) {
  const n = BigInt(value);
  if (n < 0n || n >= fq) throw new Error('Invalid curve coordinate');
  return Array.from(Buffer.from(n.toString(16).padStart(64, '0'), 'hex'));
}
function g1(point) {
  if (!Array.isArray(point) || point.length !== 3 || point[2] !== '1') throw new Error('Bad G1');
  return [...be32(point[0]), ...be32(point[1])];
}
function g2(point) {
  if (!Array.isArray(point) || point.length !== 3 || !Array.isArray(point[0]) ||
      !Array.isArray(point[1]) || point[0].length !== 2 || point[1].length !== 2) throw new Error('Bad G2');
  return [...be32(point[0][1]), ...be32(point[0][0]),
    ...be32(point[1][1]), ...be32(point[1][0])];
}

mkdirSync(out, { recursive: true });
mkdirSync(pool, { recursive: true });
for (const name of ['Cargo.toml', 'Cargo.lock']) cpSync(join(root, 'pool', name), join(pool, name));
cpSync(join(root, 'pool', 'src'), join(pool, 'src'), { recursive: true });
cpSync(join(root, 'pool', 'tests'), join(pool, 'tests'), { recursive: true });
for (const name of ['withdraw_one_instruction.bin', 'withdraw_one_asset1_instruction.bin']) {
  cpSync(join(source, name), join(out, name));
}

// The phase-1 transcript is public and fixed. Fresh phase-2 contributions only
// make these keys distinct from the local fixture; they do NOT make them safe.
const ptau = join(source, 'pot16_final.ptau');
for (const name of names) {
  cpSync(join(source, `${name}.r1cs`), join(out, `${name}.r1cs`));
  mkdirSync(join(out, `${name}_js`));
  cpSync(join(source, `${name}_js`, `${name}.wasm`), join(out, `${name}_js`, `${name}.wasm`));
  const initial = join(out, `${name}_0000.zkey`);
  const final = join(out, `${name}_final.zkey`);
  const vkPath = join(out, `${name}_vk.json`);
  console.log(`Preparing fresh test key: ${name}`);
  run(['groth16', 'setup', join(out, `${name}.r1cs`), ptau, initial]);
  run(['zkey', 'contribute', initial, final, '--name=Whirlpool throwaway Devnet only',
    `-e=${randomBytes(64).toString('hex')}`]);
  run(['zkey', 'verify', join(out, `${name}.r1cs`), ptau, final]);
  run(['zkey', 'export', 'verificationkey', final, vkPath]);
  const vk = JSON.parse(readFileSync(vkPath, 'utf8'));
  if (vk.protocol !== 'groth16' || vk.curve !== 'bn128' ||
      !Number.isSafeInteger(vk.nPublic) || vk.IC.length !== vk.nPublic + 1) {
    throw new Error(`${name}: unexpected verification key`);
  }
  const sourceText = `// Single-party, public-phase-1 test key. Never secure real assets.\n\
use groth16_solana::groth16::Groth16Verifyingkey;\n\
pub const VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {\n\
    nr_pubinputs: ${vk.nPublic},\n\
    vk_alpha_g1: ${JSON.stringify(g1(vk.vk_alpha_1))},\n\
    vk_beta_g2: ${JSON.stringify(g2(vk.vk_beta_2))},\n\
    vk_gamme_g2: ${JSON.stringify(g2(vk.vk_gamma_2))},\n\
    vk_delta_g2: ${JSON.stringify(g2(vk.vk_delta_2))},\n\
    vk_ic: &[${vk.IC.map(point => JSON.stringify(g1(point))).join(',')}],\n\
};\n`;
  writeFileSync(join(out, `${name}_verifying_key.rs`), sourceText);
}
console.log(`Isolated test setup prepared at ${destination}`);
console.log(`Build only from ${pool} with: NO_DNA=1 cargo build-sbf --offline`);
console.log('No keypair, transaction, or deployment was created. Never use these keys for real assets.');
