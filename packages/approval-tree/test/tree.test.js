import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApprovalTree, DEPTH, EMPTY, FIRST_ORIGIN, MAX_ORIGIN, rootFromWitness } from '../src/index.js';

test('multiple approvals and revocation have independently verifiable witnesses', () => {
  const tree = new ApprovalTree();
  assert.equal(tree.root, EMPTY[DEPTH]);
  for (const origin of [55n, 72n, 1097n]) {
    const before = tree.witness(origin);
    const update = tree.set(origin, true);
    assert.equal(rootFromWitness(origin, false, before.siblings), update.oldRoot);
    assert.equal(rootFromWitness(origin, true, before.siblings), update.newRoot);
  }
  for (const origin of [55n, 72n, 1097n])
    assert.equal(rootFromWitness(origin, true, tree.witness(origin).siblings), tree.root);
  const revoked = tree.set(72n, false);
  assert.equal(rootFromWitness(72n, false, revoked.siblings), revoked.newRoot);
  assert.equal(tree.isApproved(55n), true);
  assert.equal(tree.isApproved(72n), false);
  assert.equal(tree.isApproved(1097n), true);
  assert.throws(() => tree.set(72n, false), /unchanged/);
});

test('origin bounds and path malleability fail closed', () => {
  const tree = new ApprovalTree();
  assert.throws(() => tree.witness(FIRST_ORIGIN - 1n), /outside/);
  assert.throws(() => tree.set(FIRST_ORIGIN + BigInt(MAX_ORIGIN), true), /outside/);
  assert.throws(() => rootFromWitness(55n, false, []), /path/);
  const bad = tree.witness(55n).siblings;
  bad[0] = -1n;
  assert.throws(() => rootFromWitness(55n, false, bad), /Noncanonical/);
});
