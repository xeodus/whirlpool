import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApprovalTree, FIRST_ORIGIN, rootFromWitness } from '@whirlpool/approval-tree/src/index.js';
import { prepareApprovalUpdate, prepareGuardianPause } from '../src/operator.mjs';

test('operator approval instruction authenticates one issued origin transition', () => {
  const tree = new ApprovalTree();
  const state = { origin: FIRST_ORIGIN + 2n, approvedRoot: tree.root, approvalTree: tree };
  const prepared = prepareApprovalUpdate(state, FIRST_ORIGIN, true);
  assert.equal(prepared.data.length, 650);
  assert.equal(prepared.data[0], 1);
  assert.equal(new DataView(prepared.data.buffer).getBigUint64(1, true), FIRST_ORIGIN);
  assert.equal(prepared.data[9], 1);
  const siblings = Array.from({ length: 20 }, (_, level) => BigInt(`0x${Buffer.from(
    prepared.data.subarray(10 + level * 32, 42 + level * 32)).toString('hex')}`));
  assert.equal(rootFromWitness(FIRST_ORIGIN, false, siblings), state.approvedRoot);
  const next = tree.set(FIRST_ORIGIN, true);
  assert.equal(rootFromWitness(FIRST_ORIGIN, true, siblings), next.newRoot);
  state.approvedRoot = next.newRoot;
  assert.throws(() => prepareApprovalUpdate(state, FIRST_ORIGIN, true), /unchanged/);
  assert.throws(() => prepareApprovalUpdate(state, FIRST_ORIGIN + 2n, true), /issued origin/);
  assert.throws(() => prepareApprovalUpdate({ ...state, approvedRoot: 0n }, FIRST_ORIGIN, false), /replay/);
});

test('guardian action has explicit pause and resume data', () => {
  assert.deepEqual(Array.from(prepareGuardianPause({ paused: false }, true).data), [2, 1]);
  assert.deepEqual(Array.from(prepareGuardianPause({ paused: true }, false).data), [2, 0]);
  assert.throws(() => prepareGuardianPause({ paused: true }, true), /unchanged/);
});
