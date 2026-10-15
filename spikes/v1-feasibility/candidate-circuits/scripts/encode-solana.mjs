import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as snarkjs from 'snarkjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const browser = process.argv[2] === '--browser';
const asset1 = process.argv[2] === '--asset1';
const names = process.argv.slice(browser || asset1 ? 3 : 2);
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'transfer_two_payload821', 'transfer_two_hpke', 'withdraw_one', 'withdraw_two', 'withdraw_two_payload256', 'public_exit', 'public_exit_original']);
if (names.length === 0 || names.some(name => !allowed.has(name))) {
  throw new Error(`Choose one or more of: ${Array.from(allowed).join(', ')}`);
}
const FQ = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function be32(value, bound) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Noncanonical field element');
  const number = BigInt(value);
  if (number >= bound) throw new Error('Field element out of range');
  return Buffer.from(number.toString(16).padStart(64, '0'), 'hex');
}
function g1(point) {
  if (!Array.isArray(point) || point.length !== 3 || point[2] !== '1') throw new Error('Malformed G1');
  return Buffer.concat([be32(point[0], FQ), be32(point[1], FQ)]);
}
function g2(point) {
  if (!Array.isArray(point) || point.length !== 3 || !Array.isArray(point[2]) ||
    point[2][0] !== '1' || point[2][1] !== '0' ||
    !point.slice(0, 2).every(pair => Array.isArray(pair) && pair.length === 2)) {
    throw new Error('Malformed G2');
  }
  return Buffer.concat(point.slice(0, 2).flatMap(pair => [be32(pair[1], FQ), be32(pair[0], FQ)]));
}
const rustArray = bytes => `[${Array.from(bytes).join(',')}]`;

for (const name of names) {
  const circuit = name === 'public_exit_original' ? 'public_exit'
    : name === 'withdraw_two_payload256' ? 'withdraw_two'
      : name === 'transfer_two_payload821' || name === 'transfer_two_hpke' ? 'transfer_two' : name;
  const { proof, publicSignals } = JSON.parse(readFileSync(join(out,
    `${name}${asset1 ? '_asset1' : ''}_${browser ? 'browser' : 'node'}_result.json`), 'utf8'));
  const vk = JSON.parse(readFileSync(join(out, `${circuit}_vk.json`), 'utf8'));
  if (vk.protocol !== 'groth16' || vk.curve !== 'bn128' ||
    proof.protocol !== 'groth16' || proof.curve !== 'bn128' ||
    vk.nPublic !== publicSignals.length || vk.IC.length !== publicSignals.length + 1) {
    throw new Error(`${name}: unexpected proof or verification key shape`);
  }
  if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) throw new Error(`${name}: proof does not verify`);
  const source = `// Generated from insecure test-only ${name} verification key. Never deploy.\n\
use groth16_solana::groth16::Groth16Verifyingkey;\n\
pub const VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {\n\
    nr_pubinputs: ${publicSignals.length},\n\
    vk_alpha_g1: ${rustArray(g1(vk.vk_alpha_1))},\n\
    vk_beta_g2: ${rustArray(g2(vk.vk_beta_2))},\n\
    vk_gamme_g2: ${rustArray(g2(vk.vk_gamma_2))},\n\
    vk_delta_g2: ${rustArray(g2(vk.vk_delta_2))},\n\
    vk_ic: &[${vk.IC.map(point => rustArray(g1(point))).join(',')}],\n\
};\n`;
  writeFileSync(join(out, `${name}_verifying_key.rs`), source);
  be32(proof.pi_a[1], FQ);
  const negY = (FQ - BigInt(proof.pi_a[1])) % FQ;
  const instruction = Buffer.concat([
    be32(proof.pi_a[0], FQ), be32(negY.toString(), FQ),
    g2(proof.pi_b), g1(proof.pi_c),
    ...publicSignals.map(signal => be32(signal, FR)),
  ]);
  if (instruction.length !== 256 + 32 * publicSignals.length) throw new Error('Bad instruction length');
  writeFileSync(join(out, `${name}${asset1 ? '_asset1' : ''}${browser ? '_browser' : ''}_instruction.bin`), instruction);
  console.log(`${name} ${asset1 ? 'asset1' : 'asset0'} ${browser ? 'browser' : 'Node'}: ${instruction.length} verifier instruction bytes, ${publicSignals.length} public signals`);
}
process.exit(0);
