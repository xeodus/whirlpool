import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ApprovalTree } from '@whirlpool/approval-tree/src/index.js';
import { account } from '../src/recovery.mjs';
import { encodePrivacyAddress } from '../src/address.mjs';
import { replayPoolInstructions, restoreFromHistory } from '../src/history.mjs';
import { prepareShield, prepareTransfer, prepareWithdrawal, preparePublicExit } from '../src/prepare.mjs';
import { proveAndEncode } from '../src/proof-wire.mjs';

const candidates = resolve(import.meta.dirname, '../../../spikes/v1-feasibility/candidate-circuits');
const require = createRequire(resolve(candidates, 'package.json'));
const { groth16 } = require('snarkjs');
const artifacts = name => ({ wasm: resolve(candidates, `generated/${name}_js/${name}.wasm`),
  zkey: resolve(candidates, `generated/${name}_final.zkey`),
  verifyingKey: JSON.parse(readFileSync(resolve(candidates, `generated/${name}_vk.json`), 'utf8')) });
const be32 = value => Uint8Array.from(BigInt(value).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
function encode58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`), out = '';
  while (value) { out = alphabet[Number(value % 58n)] + out; value /= 58n; }
  return '1'.repeat(bytes.findIndex(x => x !== 0) < 0 ? bytes.length : bytes.findIndex(x => x !== 0)) + out;
}
const payoutAddress = encode58(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
function update(tree, origin, approved) {
  const { siblings } = tree.set(origin, approved);
  const data = new Uint8Array(650);
  data[0] = 1;
  new DataView(data.buffer).setBigUint64(1, origin, true);
  data[9] = Number(approved);
  siblings.forEach((value, level) => data.set(be32(value), 10 + level * 32));
  return data;
}
async function action(prepared, history) {
  const start = performance.now();
  const data = await proveAndEncode(prepared, groth16, artifacts(prepared.circuit));
  history.push(data);
  const state = replayPoolInstructions(history);
  console.log(`${prepared.circuit}: ${data.length} bytes, ${Math.round(performance.now() - start)} ms, ${state.leaves.length} leaves`);
  return state;
}

const alice = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const bob = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 33));
const history = [Uint8Array.of(0)];
let state = replayPoolInstructions(history);
state = await action(await prepareShield(state, alice, 10_000_000n, () => 11n), history);
state = await action(await prepareShield(state, bob, 9_000_000n, () => 12n), history);
const approvals = new ApprovalTree();
history.push(update(approvals, 55n, true), update(approvals, 56n, true));
state = replayPoolInstructions(history);
const aliceNote = (await restoreFromHistory(state, alice)).find(item => item.spendable && !item.spent);
let nextRho = 50n;
state = await action(await prepareTransfer(state, alice, [aliceNote], 6_000_000n,
  await encodePrivacyAddress(bob), () => nextRho++), history);
const bobPayment = (await restoreFromHistory(state, bob)).find(item => item.spendable &&
  !item.spent && item.note.origin === 55n);
assert.ok(bobPayment);
state = await action(await prepareWithdrawal(state, bob, [bobPayment], 3_000_000n,
  payoutAddress, () => 70n), history);
history.push(update(approvals, 55n, false), Uint8Array.of(2, 1));
state = replayPoolInstructions(history);
const bobChange = (await restoreFromHistory(state, bob)).find(item => item.spendable &&
  !item.spent && item.note.origin === 55n && item.note.amount === 2_000_000n);
assert.ok(bobChange);
state = await action(preparePublicExit(state, bob, bobChange,
  payoutAddress), history);
assert.equal((await restoreFromHistory(state, bob)).find(item => item.note.rho === 70n).spent, true);
const output = process.env.WHIRLPOOL_LOCAL_JOURNEY_OUTPUT;
if (output) {
  mkdirSync(output, { recursive: true });
  for (const [index, data] of history.entries())
    writeFileSync(resolve(output, `${String(index).padStart(2, '0')}.bin`), data);
  console.log(`Wrote ${history.length} public instructions for a local validator test.`);
}
console.log('Local two-origin proof journey passed; no transaction was signed or sent.');
process.exit(0); // snarkjs keeps workers alive after all assertions complete
