import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApprovalTree } from '@whirlpool/approval-tree/src/index.js';
import { account, commitment, encryptOutput, nullifier, packOutputs } from '../src/recovery.mjs';
import { createPrivacyPhrase, seedFromPrivacyPhrase } from '../src/phrase.mjs';
import { encodePrivacyAddress, decodePrivacyAddress } from '../src/address.mjs';
import { approvalWitness, notePath, replayPoolInstructions, restoreFromHistory } from '../src/history.mjs';
import { prepareTransfer, prepareWithdrawal, preparePublicExit, RELAYER_FEE } from '../src/prepare.mjs';

const be32 = value => Uint8Array.from(BigInt(value).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
function instruction(tag, signals, records) {
  const payload = records?.length ? packOutputs(records) : new Uint8Array();
  return Uint8Array.from([tag, ...new Uint8Array(256), ...signals.flatMap(value => Array.from(be32(value))),
    ...(payload.length ? [payload.length & 255, payload.length >> 8, ...payload] : [])]);
}
function update(tree, origin, approved) {
  const { siblings } = tree.set(origin, approved);
  const bytes = new Uint8Array(650);
  bytes[0] = 1;
  new DataView(bytes.buffer).setBigUint64(1, origin, true);
  bytes[9] = Number(approved);
  siblings.forEach((sibling, level) => bytes.set(be32(sibling), 10 + level * 32));
  return bytes;
}

test('Devnet address roundtrips and a changed character fails', async () => {
  const owner = await account(seedFromPrivacyPhrase(createPrivacyPhrase()));
  const value = await encodePrivacyAddress(owner);
  assert.deepEqual(await decodePrivacyAddress(value), { owner: owner.owner, viewPublic: owner.viewPublic });
  await assert.rejects(decodePrivacyAddress(value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A')),
    /checksum|Noncanonical/);
  await assert.rejects(decodePrivacyAddress('solana-wallet-phrase'), /Invalid/);
});

test('two origins, live revocation, and recipient recovery replay independently', async () => {
  const sender = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
  const second = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 33));
  const recipient = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 65));
  const original = { asset: 0n, amount: 10_000_000n, owner: sender.owner, origin: 55n, rho: 11n };
  const other = { asset: 0n, amount: 8_000_000n, owner: second.owner, origin: 56n, rho: 12n };
  const payment = { asset: 0n, amount: 6_000_000n, owner: recipient.owner, origin: 55n, rho: 50n };
  const change = { asset: 0n, amount: 3_000_000n, owner: sender.owner, origin: 55n, rho: 51n };
  const approvals = new ApprovalTree();
  const history = [Uint8Array.of(0),
    instruction(3, [0n, original.amount, original.origin, commitment(original), 0n, 0n],
      [await encryptOutput(original, sender.viewPublic, sender.viewPublic)]),
    instruction(3, [0n, other.amount, other.origin, commitment(other), 0n, 0n],
      [await encryptOutput(other, second.viewPublic, second.viewPublic)]),
    update(approvals, 55n, true), update(approvals, 56n, true)];
  const before = replayPoolInstructions(history);
  assert.equal(approvalWitness(before, 55n).root, before.approvedRoot);
  assert.equal(approvalWitness(before, 56n).root, before.approvedRoot);
  const senderBefore = (await restoreFromHistory(before, sender))[0];
  const recipientAddress = await encodePrivacyAddress(recipient);
  let next = 50n;
  const preparedTransfer = await prepareTransfer(before, sender, [senderBefore], 6_000_000n,
    recipientAddress, () => next++);
  assert.equal(preparedTransfer.circuit, 'transfer_one');
  assert.equal(preparedTransfer.input.paymentAmount + preparedTransfer.input.changeAmount + RELAYER_FEE,
    original.amount);
  assert.equal(preparedTransfer.input.approvedRoot, before.approvedRoot);
  assert.equal(preparedTransfer.payload.length, 589);
  const preparedWithdrawal = await prepareWithdrawal(before, sender, [senderBefore], 5_000_000n,
    '11111111111111111111111111111111', () => 99n);
  assert.equal(preparedWithdrawal.circuit, 'withdraw_one');
  assert.equal(preparedWithdrawal.input.payoutAmount + preparedWithdrawal.input.changeAmount + RELAYER_FEE,
    original.amount);
  assert.equal(preparedWithdrawal.payload.length, 295);
  await assert.rejects(prepareTransfer(before, sender, [senderBefore, senderBefore], 3_000_000n,
    recipientAddress), /same note twice/);
  const paymentRecord = await encryptOutput(payment, recipient.viewPublic, sender.viewPublic);
  const changeRecord = await encryptOutput(change, sender.viewPublic, sender.viewPublic);
  history.push(instruction(4, [0n, notePath([commitment(original), commitment(other)], 0).root,
    before.approvedRoot, nullifier(original, sender.spendSecret), commitment(payment), commitment(change),
    0n, 0n, 0n, 1_000_000n, 0n, 0n], [paymentRecord, changeRecord]));
  history.push(update(approvals, 55n, false), Uint8Array.of(2, 1));
  const revoked = replayPoolInstructions(history);
  assert.throws(() => approvalWitness(revoked, 55n), /not currently approved/);
  assert.equal(approvalWitness(revoked, 56n).root, revoked.approvedRoot);
  const recovered = await restoreFromHistory(revoked, recipient);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].note.amount, 6_000_000n);
  assert.equal(recovered[0].note.origin, 55n);
  assert.equal(recovered[0].spent, false);
  const preparedExit = preparePublicExit(revoked, recipient, recovered[0],
    '11111111111111111111111111111111');
  assert.equal(preparedExit.input.exitAmount, 6_000_000n);
  assert.equal(preparedExit.input.origin, 55n);
  history.push(instruction(8, [0n, revoked.noteRoot, recovered[0].nullifier, 55n, 6_000_000n, 0n, 0n]));
  const exited = replayPoolInstructions(history);
  assert.equal((await restoreFromHistory(exited, recipient))[0].spent, true);
  assert.throws(() => replayPoolInstructions([...history, history.at(-1)]), /replay/);
  const tampered = history.slice();
  tampered[3] = tampered[3].slice(); tampered[3][10] ^= 1;
  assert.throws(() => replayPoolInstructions(tampered), /witness mismatch/);
});

test('recovery binds each ciphertext record to its own leaf position', async () => {
  const owner = await account(Uint8Array.from({ length: 32 }, (_, i) => i + 97));
  const note = { asset: 0n, amount: 2_000_000n, owner: owner.owner, origin: 55n, rho: 123n };
  const record = await encryptOutput(note, owner.viewPublic, owner.viewPublic);
  const leaves = [commitment(note), commitment(note)];
  const history = { records: [record, record], leaves, spent: new Set(),
    noteRoot: notePath(leaves, 0).root };
  const recovered = await restoreFromHistory(history, owner);
  assert.deepEqual(recovered.map(item => item.index), [0, 1]);
  assert.deepEqual(recovered.map(item => item.spendable), [true, false]);
  await assert.rejects(restoreFromHistory({ ...history, leaves: [leaves[0]] }, owner), /do not match/);
});
