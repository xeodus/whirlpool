import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { poseidon4 } from 'poseidon-lite';
import { account, commitment, encryptOutput, packOutputs, recover, unpackOutputs } from '../src/recovery.mjs';

const candidate = resolve(import.meta.dirname, '../../candidate-circuits');
const generated = join(candidate, 'generated');
const input = JSON.parse(readFileSync(join(generated, 'inputs', 'transfer_two_asset1.json'), 'utf8'));
const sender = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const recipient = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 33));
const note = (amount, owner, rho) => ({ asset: 1n, amount: BigInt(amount), owner: BigInt(owner),
  origin: BigInt(input.origin), rho: BigInt(rho) });
const payment = note(input.paymentAmount, input.paymentOwner, input.paymentRho);
const change = note(input.changeAmount, input.changeOwner, input.changeRho);
assert.equal(commitment(payment).toString(), input.paymentCommitment);
assert.equal(commitment(change).toString(), input.changeCommitment);

const records = [
  await encryptOutput(payment, recipient.viewPublic, sender.viewPublic),
  await encryptOutput(change, sender.viewPublic, sender.viewPublic),
];
const recipientFixture = { ...recipient, owner: payment.owner, spendSecret: BigInt(input.ownerSecret[0]) };
const senderFixture = { ...sender, owner: change.owner, spendSecret: BigInt(input.ownerSecret[1]) };
assert.equal((await recover(records, recipientFixture, new Set()))[0].spendable, true);
const senderHistory = await recover(records, senderFixture, new Set());
assert.equal(senderHistory.length, 2);
assert.equal(senderHistory[1].spendable, true);

const payload = packOutputs(records);
assert.deepEqual(unpackOutputs(payload), records);
assert.equal((await recover(unpackOutputs(payload), recipientFixture, new Set()))[0].spendable, true);
const wire = Buffer.concat([Buffer.from([payload.length & 255, payload.length >> 8]), payload]);
const digest = BigInt(`0x${createHash('sha256').update(wire).digest().subarray(0, 31).toString('hex')}`);
const tag = poseidon4([105n, BigInt(input.ownerSecret[0]), digest, BigInt(input.nullifier[0])]);
const integrated = { ...input, payloadDigest: digest.toString(), payloadTag: tag.toString() };
mkdirSync(join(generated, 'inputs'), { recursive: true });
writeFileSync(join(generated, 'inputs', 'transfer_two_hpke_asset1.json'), JSON.stringify(integrated, null, 2));
writeFileSync(join(generated, 'transfer_two_hpke_asset1_payload.bin'), payload);
console.log(`Integrated two-output HPKE payload: ${payload.length} bytes; circuit digest ${digest}`);
