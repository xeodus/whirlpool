import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as snarkjs from 'snarkjs';
import { account, commitment, encryptOutput, nullifier, packOutputs } from '../../recovery/src/recovery.mjs';
import { replayPoolInstructions, restoreFromHistory, singletonApprovalRoot, singletonApprovalWitness } from '../../recovery/src/history.mjs';
import { phraseFromResearchSeed, seedFromPrivacyPhrase } from '../../recovery/src/phrase.mjs';
import { poseidon4 } from 'poseidon-lite';

// Deterministic public research seeds only. Never use these keys for funds.
const root = resolve(import.meta.dirname, '..');
const generated = process.env.WHIRLPOOL_RESEARCH_OUTPUT
  ? resolve(process.env.WHIRLPOOL_RESEARCH_OUTPUT)
  : join(root, 'generated');
const emit = process.argv.includes('--emit');
const asset = process.argv.includes('--asset1') ? 1n : 0n;
const realisticSol = process.argv.includes('--realistic-sol');
if (realisticSol && asset !== 0n) throw new Error('Realistic fixture is SOL only');
const suffix = asset === 1n ? '_asset1' : '';
const FQ = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const seed = offset => Uint8Array.from({ length: 32 }, (_, i) => i + offset);
const sender = await account(seedFromPrivacyPhrase(phraseFromResearchSeed(seed(1))));
const recipient = await account(seedFromPrivacyPhrase(phraseFromResearchSeed(seed(33))));
const origin = 55n;
const first = { asset, amount: realisticSol ? 10_000_000n : 100n, owner: sender.owner, origin, rho: 11n };
const payment = { asset, amount: realisticSol ? 6_000_000n : 60n, owner: recipient.owner, origin, rho: 50n };
const change = { asset, amount: realisticSol ? 3_000_000n : 38n, owner: sender.owner, origin, rho: 51n };
const fee = realisticSol ? 1_000_000n : 2n;
const stringify = input => JSON.parse(JSON.stringify(input, (_, v) => typeof v === 'bigint' ? v.toString() : v));
const be32 = n => Uint8Array.from(BigInt(n).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
function encodedProof(proof, signals) {
  const g1 = p => [...be32(p[0]), ...be32(p[1])];
  const g2 = p => [...be32(p[0][1]), ...be32(p[0][0]), ...be32(p[1][1]), ...be32(p[1][0])];
  return Uint8Array.from([...be32(proof.pi_a[0]), ...be32((FQ - BigInt(proof.pi_a[1])) % FQ),
    ...g2(proof.pi_b), ...g1(proof.pi_c), ...signals.flatMap(x => Array.from(be32(x)))]);
}
function digest(payload) {
  const wire = Buffer.concat([Buffer.from([payload.length & 255, payload.length >> 8]), payload]);
  return BigInt(`0x${createHash('sha256').update(wire).digest().subarray(0, 31).toString('hex')}`);
}
function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid base58 address');
    number = number * 58n + BigInt(digit);
  }
  const bytes = be32(number);
  if (bytes.length !== 32) throw new Error('Invalid address length');
  return bytes;
}
const exitAddress = realisticSol ? decodeBase58('G7CNKbhchpaLaoqPa6tQKqSY7UZkrxFXb2yB6cXmq3v1') : null;
const exitLo = realisticSol ? BigInt(`0x${Buffer.from(exitAddress.subarray(0, 16)).toString('hex')}`) : 12n;
const exitHi = realisticSol ? BigInt(`0x${Buffer.from(exitAddress.subarray(16)).toString('hex')}`) : 34n;
function instruction(tag, signals, payload) {
  return Uint8Array.from([tag, ...new Uint8Array(256), ...signals.flatMap(x => Array.from(be32(x))),
    ...(payload ? [payload.length & 255, payload.length >> 8, ...payload] : [])]);
}
async function prove(name, input) {
  const wasm = new Uint8Array(readFileSync(join(generated, `${name}_js`, `${name}.wasm`)));
  const zkey = new Uint8Array(readFileSync(join(generated, `${name}_final.zkey`)));
  const vk = JSON.parse(readFileSync(join(generated, `${name}_vk.json`)));
  const started = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    stringify(input), wasm, zkey, undefined, { memorySize: 0 }, { singleThread: true });
  if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) throw new Error(`${name} proof failed`);
  console.log(`${name}: restored-state witness proved and verified in ${Math.round(performance.now() - started)} ms`);
  if (emit) writeFileSync(join(generated, `${name}_restored${suffix}_instruction.bin`), encodedProof(proof, publicSignals));
  return publicSignals.map(BigInt);
}
const shieldPayload = packOutputs([await encryptOutput(first, sender.viewPublic, sender.viewPublic)]);
const shieldDigest = digest(shieldPayload);
const shieldSignals = await prove('shield', {
  asset, amount: first.amount, origin, commitment: commitment(first), payloadDigest: shieldDigest,
  payloadTag: poseidon4([105n, first.rho, shieldDigest, commitment(first)]),
  owner: first.owner, rho: first.rho,
});
let chain = [asset === 1n ? Uint8Array.from([0, 1, ...new Uint8Array(64)]) : Uint8Array.of(0),
  instruction(3, shieldSignals, shieldPayload)];
let history = replayPoolInstructions(chain);
let restored = (await restoreFromHistory(history, sender)).find(x => x.spendable && !x.spent);
assert(restored && restored.witness.root === history.noteRoot);

const approvedRoot = singletonApprovalRoot(origin);
chain.push(Uint8Array.from([1, ...be32(approvedRoot)]));
history = replayPoolInstructions(chain);
const approval = singletonApprovalWitness(history, origin);

const transferPayload = packOutputs([
  await encryptOutput(payment, recipient.viewPublic, sender.viewPublic),
  await encryptOutput(change, sender.viewPublic, sender.viewPublic),
]);
if (emit) {
  writeFileSync(join(generated, `shield_restored${suffix}_payload.bin`), shieldPayload);
  writeFileSync(join(generated, `transfer_one_restored${suffix}_payload.bin`), transferPayload);
}
const transferDigest = digest(transferPayload);
const transferNullifier = nullifier(first, sender.spendSecret);
const transferSignals = await prove('transfer_one', {
  asset, noteRoot: history.noteRoot, approvedRoot, nullifier: [transferNullifier],
  paymentCommitment: commitment(payment), changeCommitment: commitment(change), payoutAmount: 0n,
  recipientLo: 0n, recipientHi: 0n, fee, payloadDigest: transferDigest,
  payloadTag: poseidon4([105n, sender.spendSecret, transferDigest, transferNullifier]),
  origin, amount: [first.amount], ownerSecret: [sender.spendSecret], rho: [first.rho],
  noteSiblings: [restored.witness.siblings], noteBits: [restored.witness.bits],
  approvalSiblings: approval.siblings, approvalBits: approval.bits,
  paymentAmount: payment.amount, paymentOwner: payment.owner, paymentRho: payment.rho,
  changeAmount: change.amount, changeOwner: change.owner, changeRho: change.rho,
});
chain.push(instruction(4, transferSignals, transferPayload));
history = replayPoolInstructions(chain);
restored = (await restoreFromHistory(history, recipient)).find(x => x.spendable && !x.spent);
assert(restored && restored.note.amount === payment.amount);

// Model a revoked origin: the current holder can still exit, with no ASP proof.
chain.push(Uint8Array.of(1, ...be32(0n)), Uint8Array.of(2, 1));
history = replayPoolInstructions(chain);
const exitSignals = await prove('public_exit', {
  asset, noteRoot: history.noteRoot, nullifier: restored.nullifier,
  origin, exitAmount: restored.note.amount, recipientLo: exitLo, recipientHi: exitHi,
  ownerSecret: recipient.spendSecret, rho: restored.note.rho,
  siblings: restored.witness.siblings, bits: restored.witness.bits,
});
chain.push(instruction(8, exitSignals));
history = replayPoolInstructions(chain);
assert.equal((await restoreFromHistory(history, recipient))[0].spent, true);
console.log(`Research asset ${asset}: phrase -> encrypted shield -> independent replay -> transfer -> revoked current-holder exit passed`);
process.exit(0);
