import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const source = process.argv[2] === 'browser' ? 'browser' : 'node';
const { proof, publicSignals } = JSON.parse(readFileSync(join(out, `${source}-proof.json`), 'utf8'));
const vk = JSON.parse(readFileSync(join(out, 'verification_key.json'), 'utf8'));
// BN254 base field for G1 negation. Distinct from the scalar field Fr.
const FQ = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function be32(value, bound) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('Noncanonical decimal field element');
  }
  const n = BigInt(value);
  if (n >= bound) throw new Error('Field element out of range');
  return Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
}
function g1(point) {
  if (!Array.isArray(point) || point.length !== 3 || point[2] !== '1') {
    throw new Error('Malformed G1 point');
  }
  return Buffer.concat([be32(point[0], FQ), be32(point[1], FQ)]);
}
function g2(point) {
  if (!Array.isArray(point) || point.length !== 3 ||
    !Array.isArray(point[2]) || point[2].length !== 2 ||
    point[2][0] !== '1' || point[2][1] !== '0' ||
    !point.slice(0, 2).every(pair => Array.isArray(pair) && pair.length === 2)) {
    throw new Error('Malformed G2 point');
  }
  // snarkjs Fp2 limbs are [c0,c1]; Solana's alt_bn128 syscall expects [c1,c0].
  return Buffer.concat(point.slice(0, 2).flatMap(pair => [
    be32(pair[1], FQ), be32(pair[0], FQ),
  ]));
}
function rustArray(bytes) {
  return `[${Array.from(bytes).join(',')}]`;
}

if (vk.protocol !== 'groth16' || vk.curve !== 'bn128' || vk.nPublic !== 1 ||
  vk.IC.length !== 2 || publicSignals.length !== 1 || publicSignals[0] !== '49' ||
  proof.protocol !== 'groth16' || proof.curve !== 'bn128') {
  throw new Error('Unexpected verification key, proof, or public input');
}

const vkSource = `// Generated from test-only snarkjs verification_key.json. Do not deploy.\n\
use groth16_solana::groth16::Groth16Verifyingkey;\n\
pub const VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {\n\
    nr_pubinputs: 1,\n\
    vk_alpha_g1: ${rustArray(g1(vk.vk_alpha_1))},\n\
    vk_beta_g2: ${rustArray(g2(vk.vk_beta_2))},\n\
    vk_gamme_g2: ${rustArray(g2(vk.vk_gamma_2))},\n\
    vk_delta_g2: ${rustArray(g2(vk.vk_delta_2))},\n\
    vk_ic: &[${vk.IC.map(p => rustArray(g1(p))).join(',')}],\n\
};\n`;
writeFileSync(join(out, 'verifying_key.rs'), vkSource);

be32(proof.pi_a[1], FQ);
const negY = (FQ - BigInt(proof.pi_a[1])) % FQ;
const proofA = Buffer.concat([be32(proof.pi_a[0], FQ), be32(negY.toString(), FQ)]);
const input = be32(publicSignals[0], FR);
const instruction = Buffer.concat([proofA, g2(proof.pi_b), g1(proof.pi_c), input]);
if (instruction.length !== 288) throw new Error('Unexpected instruction size');
writeFileSync(join(out, `${source}-instruction.bin`), instruction);
console.log(`Encoded ${source} proof: 256-byte proof, 32-byte public input`);
