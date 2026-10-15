import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated');
const bin = join(root, 'node_modules', '.bin', 'snarkjs');
const read = name => JSON.parse(readFileSync(join(out, 'inputs', `${name}.json`), 'utf8'));
const scenarios = [
  ['shield', 'wrong initial commitment', x => { x.commitment = String(BigInt(x.commitment) + 1n); }],
  ['shield', 'unbounded deposit amount', x => { x.amount = (1n << 64n).toString(); }],
  ['shield', 'changed encrypted payload digest', x => { x.payloadDigest = String(BigInt(x.payloadDigest) + 1n); }],
  ['transfer_one', 'changed note root', x => { x.noteRoot = String(BigInt(x.noteRoot) + 1n); }],
  ['transfer_one', 'changed approval root', x => { x.approvedRoot = String(BigInt(x.approvedRoot) + 1n); }],
  ['transfer_one', 'changed nullifier', x => { x.nullifier[0] = String(BigInt(x.nullifier[0]) + 1n); }],
  ['transfer_one', 'changed payment commitment', x => { x.paymentCommitment = String(BigInt(x.paymentCommitment) + 1n); }],
  ['transfer_one', 'changed fee', x => { x.fee = '3'; }],
  ['transfer_one', 'changed encrypted payload digest', x => { x.payloadDigest = String(BigInt(x.payloadDigest) + 1n); }],
  ['transfer_one', 'changed encrypted payload tag', x => { x.payloadTag = String(BigInt(x.payloadTag) + 1n); }],
  ['transfer_one', 'zero payment', x => { x.paymentAmount = '0'; }],
  ['transfer_one', 'wrong input owner', x => { x.ownerSecret[0] = '99'; }],
  ['transfer_two', 'second input no longer matches its lineage-bound leaf', x => { x.rho[1] = '99'; }],
  ['withdraw_one', 'changed payout', x => { x.payoutAmount = '61'; }],
  ['withdraw_one', 'changed change commitment', x => { x.changeCommitment = String(BigInt(x.changeCommitment) + 1n); }],
  ['public_exit', 'changed origin', x => { x.origin = '56'; }],
  ['public_exit', 'changed exit amount', x => { x.exitAmount = '99'; }],
  ['public_exit', 'wrong current holder', x => { x.ownerSecret = '99'; }],
];

scenarios.push(['transfer_two', 'two valid positions with one duplicate nullifier', x => {
  Object.assign(x, read('duplicate_two'));
}]);

for (const [name, label, mutate] of scenarios) {
  const input = read(name);
  mutate(input);
  const inputPath = join(out, 'negative-input.json');
  const witnessPath = join(out, 'negative.wtns');
  writeFileSync(inputPath, JSON.stringify(input));
  const calc = spawnSync(bin, ['wtns', 'calculate', join(out, `${name}_js`, `${name}.wasm`),
    inputPath, witnessPath], { cwd: root, encoding: 'utf8' });
  const check = calc.status === 0 ? spawnSync(bin, ['wtns', 'check', join(out, `${name}.r1cs`),
    witnessPath], { cwd: root, encoding: 'utf8' }) : null;
  if (calc.status === 0 && check?.status === 0) {
    throw new Error(`${name}: invalid witness accepted: ${label}`);
  }
  console.log(`Rejected ${name}: ${label}`);
}
