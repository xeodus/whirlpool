import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { poseidon2, poseidon3, poseidon4 } = require('poseidon-lite');
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'generated', 'inputs');
mkdirSync(out, { recursive: true });
const fixtureAsset = process.env.CANDIDATE_ASSET === '1' ? 1n : 0n;
if (process.env.CANDIDATE_ASSET && !['0', '1'].includes(process.env.CANDIDATE_ASSET)) {
  throw new Error('CANDIDATE_ASSET must be 0 or 1');
}

const h2 = (a, b) => poseidon2([BigInt(a), BigInt(b)]);
const h3 = (a, b, c) => poseidon3([BigInt(a), BigInt(b), BigInt(c)]);
const h4 = (a, b, c, d) => poseidon4([BigInt(a), BigInt(b), BigInt(c), BigInt(d)]);
const note = ({ asset, amount, owner, origin, rho }) =>
  h3(h4(101n, asset, amount, owner), origin, rho);
const owner = secret => h2(102n, secret);
const nf = ({ secret, rho, origin }) => h4(103n, secret, rho, origin);
function payloadDigest(length) {
  const tail = Buffer.concat([Buffer.from([length & 255, length >> 8]), Buffer.alloc(length, 0xA5)]);
  return BigInt(`0x${createHash('sha256').update(tail).digest().subarray(0, 31).toString('hex')}`);
}
const shortDigest = payloadDigest(32);
function shapedPayload(name, commitments) {
  // These generic custody fixtures test on-chain structure and proof binding;
  // only the restored-journey fixtures contain decryptable HPKE ciphertext.
  const parts = [Buffer.from([commitments.length])];
  for (const [index, value] of commitments.entries()) {
    parts.push(Buffer.from(value.toString(16).padStart(64, '0'), 'hex'));
    for (const role of [0, 1]) {
      parts.push(Buffer.alloc(32, 0xA0 + index * 2 + role));
      parts.push(Buffer.from([97, 0]));
      parts.push(Buffer.alloc(97, 0xB0 + index * 2 + role));
    }
  }
  const payload = Buffer.concat(parts);
  const suffix = fixtureAsset === 1n ? '_asset1' : '';
  writeFileSync(join(root, 'generated', `${name}${suffix}_payload.bin`), payload);
  const wire = Buffer.concat([Buffer.from([payload.length & 255, payload.length >> 8]), payload]);
  return BigInt(`0x${createHash('sha256').update(wire).digest().subarray(0, 31).toString('hex')}`);
}

function sparsePath(leaves, index, depth = 20) {
  const zeros = [0n];
  for (let i = 1; i <= depth; i++) zeros.push(h2(zeros[i - 1], zeros[i - 1]));
  let nodes = new Map(leaves.map((leaf, position) => [position, leaf]));
  let position = index;
  const siblings = [];
  const bits = [];
  for (let level = 0; level < depth; level++) {
    siblings.push(nodes.get(position ^ 1) ?? zeros[level]);
    bits.push(BigInt(position & 1));
    const parents = new Map();
    for (const childIndex of nodes.keys()) {
      const parentIndex = Math.floor(childIndex / 2);
      if (parents.has(parentIndex)) continue;
      const left = nodes.get(parentIndex * 2) ?? zeros[level];
      const right = nodes.get(parentIndex * 2 + 1) ?? zeros[level];
      parents.set(parentIndex, h2(left, right));
    }
    nodes = parents;
    position = Math.floor(position / 2);
  }
  return { root: nodes.get(0) ?? zeros[depth], siblings, bits };
}
function save(name, input) {
  const suffix = fixtureAsset === 1n ? '_asset1' : '';
  writeFileSync(join(out, `${name}${suffix}.json`), JSON.stringify(input, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2));
}

const asset = fixtureAsset; // research selector, not a canonical SOL/USDC ABI
const origin = 55n;
const first = { asset, amount: 100n, secret: 7n, origin, rho: 11n };
const firstLeaf = note({ ...first, owner: owner(first.secret) });
const approvedLeaf = h2(104n, origin);
const approval = sparsePath([approvedLeaf], 0);
const recipientSecret = 9n;
const paymentOwner = owner(recipientSecret);
const changeOwner = owner(first.secret);
const fee = 2n;
const firstPayment = { asset, amount: 60n, secret: recipientSecret, origin, rho: 50n };
const firstChange = { asset, amount: 38n, secret: first.secret, origin, rho: 51n };
const firstPaymentLeaf = note({ ...firstPayment, owner: paymentOwner });
const firstChangeLeaf = note({ ...firstChange, owner: changeOwner });

const shieldDigest = shapedPayload('shield', [firstLeaf]);
save('shield', { asset, amount: first.amount, origin, commitment: firstLeaf,
  payloadDigest: shieldDigest, payloadTag: h4(105n, first.rho, shieldDigest, firstLeaf),
  owner: owner(first.secret), rho: first.rho });

for (const n of [1, 2]) {
  // Two-input actions consume the two outputs of a real prior one-input
  // transfer, rather than two unbacked fixture notes from the same origin.
  const inputs = n === 1 ? [first] : [firstPayment, firstChange];
  const leaves = n === 1 ? [firstLeaf] : [firstLeaf, firstPaymentLeaf, firstChangeLeaf];
  const paths = inputs.map((_, i) => sparsePath(leaves, n === 1 ? 0 : i + 1));
  const paymentRho = n === 1 ? 50n : 52n;
  const changeRho = n === 1 ? 51n : 53n;
  const common = {
    asset,
    noteRoot: paths[0].root,
    approvedRoot: approval.root,
    nullifier: inputs.map(nf),
    payloadDigest: shortDigest,
    payloadTag: h4(105n, inputs[0].secret, shortDigest, nf(inputs[0])),
    fee,
    origin,
    amount: inputs.map(input => input.amount),
    ownerSecret: inputs.map(input => input.secret),
    rho: inputs.map(input => input.rho),
    noteSiblings: paths.map(path => path.siblings),
    noteBits: paths.map(path => path.bits),
    approvalSiblings: approval.siblings,
    approvalBits: approval.bits,
    paymentOwner,
    paymentRho,
    changeOwner,
    changeRho,
    recipientLo: 0n,
    recipientHi: 0n,
  };
  const total = inputs.reduce((sum, input) => sum + input.amount, 0n);
  const transferPayment = total - fee - 38n;
  const transferName = n === 1 ? 'transfer_one' : 'transfer_two';
  const paymentCommitment = note({ asset, amount: transferPayment, owner: paymentOwner, origin, rho: paymentRho });
  const changeCommitment = note({ asset, amount: 38n, owner: changeOwner, origin, rho: changeRho });
  const transferDigest = shapedPayload(transferName, [paymentCommitment, changeCommitment]);
  save(transferName, {
    ...common,
    payloadDigest: transferDigest,
    payloadTag: h4(105n, inputs[0].secret, transferDigest, nf(inputs[0])),
    paymentAmount: transferPayment,
    paymentCommitment,
    changeAmount: 38n,
    changeCommitment,
    payoutAmount: 0n,
  });
  if (n === 2) {
    const largeDigest = payloadDigest(821); // conservative size above the recovery spike's 589-byte binary fixture
    save('transfer_two_payload821', {
      ...common,
      payloadDigest: largeDigest,
      payloadTag: h4(105n, inputs[0].secret, largeDigest, nf(inputs[0])),
      paymentAmount: transferPayment,
      paymentCommitment: note({ asset, amount: transferPayment, owner: paymentOwner, origin, rho: paymentRho }),
      changeAmount: 38n,
      changeCommitment: note({ asset, amount: 38n, owner: changeOwner, origin, rho: changeRho }),
      payoutAmount: 0n,
    });
  }
  const withdrawName = n === 1 ? 'withdraw_one' : 'withdraw_two';
  const withdrawDigest = shapedPayload(withdrawName, [changeCommitment]);
  save(withdrawName, {
    ...common,
    payloadDigest: withdrawDigest,
    payloadTag: h4(105n, inputs[0].secret, withdrawDigest, nf(inputs[0])),
    paymentAmount: 0n,
    paymentCommitment: 0n,
    changeAmount: 38n,
    changeCommitment,
    payoutAmount: transferPayment,
    recipientLo: 12n,
    recipientHi: 34n,
  });
  if (n === 2) {
    const longDigest = payloadDigest(256);
    save('withdraw_two_payload256', {
      ...common,
      payloadDigest: longDigest,
      payloadTag: h4(105n, inputs[0].secret, longDigest, nf(inputs[0])),
      paymentAmount: 0n,
      paymentCommitment: 0n,
      changeAmount: 38n,
      changeCommitment: note({ asset, amount: 38n, owner: changeOwner, origin, rho: changeRho }),
      payoutAmount: transferPayment,
      recipientLo: 12n,
      recipientHi: 34n,
    });
  }
}

// A duplicated note at two valid tree positions would pass membership and
// arithmetic if the nullifier distinctness condition were accidentally lost.
const duplicatePaths = [0, 1].map(i => sparsePath([firstLeaf, firstLeaf], i));
const duplicatePayment = 160n;
save('duplicate_two', {
  asset,
  noteRoot: duplicatePaths[0].root,
  approvedRoot: approval.root,
  nullifier: [nf(first), nf(first)],
  paymentCommitment: note({ asset, amount: duplicatePayment, owner: paymentOwner, origin, rho: 50n }),
  changeCommitment: note({ asset, amount: 38n, owner: changeOwner, origin, rho: 51n }),
  payoutAmount: 0n,
  recipientLo: 0n,
  recipientHi: 0n,
  fee,
  payloadDigest: shortDigest,
  payloadTag: h4(105n, first.secret, shortDigest, nf(first)),
  origin,
  amount: [first.amount, first.amount],
  ownerSecret: [first.secret, first.secret],
  rho: [first.rho, first.rho],
  noteSiblings: duplicatePaths.map(path => path.siblings),
  noteBits: duplicatePaths.map(path => path.bits),
  approvalSiblings: approval.siblings,
  approvalBits: approval.bits,
  paymentAmount: duplicatePayment,
  paymentOwner,
  paymentRho: 50n,
  changeAmount: 38n,
  changeOwner,
  changeRho: 51n,
});

// Exit a transferred payment note owned by secret 9, after the transfer has
// appended both the payment and change commitments to the historical tree.
const paymentAfterTransfer = firstPayment;
const paymentLeaf = firstPaymentLeaf;
const changeLeaf = firstChangeLeaf;
const exitPath = sparsePath([firstLeaf, paymentLeaf, changeLeaf], 1);
save('public_exit', {
  asset,
  noteRoot: exitPath.root,
  nullifier: nf(paymentAfterTransfer),
  origin,
  exitAmount: paymentAfterTransfer.amount,
  recipientLo: 12n,
  recipientHi: 34n,
  ownerSecret: recipientSecret,
  rho: paymentAfterTransfer.rho,
  siblings: exitPath.siblings,
  bits: exitPath.bits,
});
const originalExitPath = sparsePath([firstLeaf], 0);
save('public_exit_original', {
  asset,
  noteRoot: originalExitPath.root,
  nullifier: nf(first),
  origin,
  exitAmount: first.amount,
  recipientLo: 12n,
  recipientHi: 34n,
  ownerSecret: first.secret,
  rho: first.rho,
  siblings: originalExitPath.siblings,
  bits: originalExitPath.bits,
});

console.log('Generated candidate witnesses from independent Poseidon implementation.');
