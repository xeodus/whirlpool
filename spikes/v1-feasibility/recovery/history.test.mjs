import assert from 'node:assert/strict';
import { account, commitment, encryptOutput, nullifier, packOutputs } from './src/recovery.mjs';
import { notePath, readPoolHistory, replayPoolInstructions, restoreFromHistory,
  singletonApprovalRoot, singletonApprovalWitness } from './src/history.mjs';
import { createPrivacyPhrase, phraseFromResearchSeed, seedFromPrivacyPhrase } from './src/phrase.mjs';

const seedA = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const seedB = Uint8Array.from({ length: 32 }, (_, i) => i + 33);
const phrase = phraseFromResearchSeed(seedA);
assert.equal(phrase.split(' ').length, 24);
assert.deepEqual(seedFromPrivacyPhrase(phrase), seedA);
assert.equal(seedFromPrivacyPhrase(createPrivacyPhrase()).length, 32);
assert.throws(() => seedFromPrivacyPhrase(phrase.replace(/\w+$/, 'invalidword')));
const sender = await account(seedFromPrivacyPhrase(phrase));
const recipient = await account(seedB);
const first = { asset: 0n, amount: 100n, owner: sender.owner, origin: 55n, rho: 11n };
const payment = { asset: 0n, amount: 60n, owner: recipient.owner, origin: 55n, rho: 50n };
const change = { asset: 0n, amount: 38n, owner: sender.owner, origin: 55n, rho: 51n };
const f = n => Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
function instruction(tag, signals, records) {
  const payload = packOutputs(records);
  return Uint8Array.from([tag, ...new Uint8Array(256), ...signals.flatMap(x => Array.from(f(x))),
    payload.length & 255, payload.length >> 8, ...payload]);
}
const shieldRecord = await encryptOutput(first, sender.viewPublic, sender.viewPublic);
const paymentRecord = await encryptOutput(payment, recipient.viewPublic, sender.viewPublic);
const changeRecord = await encryptOutput(change, sender.viewPublic, sender.viewPublic);
const shield = instruction(3, [0n, 100n, 55n, commitment(first), 0n, 0n], [shieldRecord]);
const before = notePath([commitment(first)], 0).root;
const transfer = instruction(4, [0n, before, 0n, nullifier(first, sender.spendSecret),
  commitment(payment), commitment(change), 0n, 0n, 0n, 2n, 0n, 0n], [paymentRecord, changeRecord]);
const after = notePath([commitment(first), commitment(payment), commitment(change)], 2).root;
const exit = Uint8Array.from([8, ...new Uint8Array(256), ...[
  0n, after, nullifier(payment, recipient.spendSecret), 55n, 60n, 0n, 0n,
].flatMap(x => Array.from(f(x)))]);
const instructions = [Uint8Array.of(0), shield, transfer, exit];
const replay = replayPoolInstructions(instructions);
assert.equal(replay.noteRoot, after);
assert.equal(replay.origin, 56n);
const senderNotes = await restoreFromHistory(replay, sender);
assert.equal(senderNotes.length, 3);
assert.equal(senderNotes[0].spent, true);
assert.equal(senderNotes[2].spent, false);
assert.equal(senderNotes[2].witness.root, after);
const recipientNotes = await restoreFromHistory(replay, recipient);
assert.equal(recipientNotes.length, 1);
assert.equal(recipientNotes[0].spent, true);
assert.equal(recipientNotes[0].index, 1);
const approved = replayPoolInstructions([Uint8Array.of(0), Uint8Array.from([1, ...f(singletonApprovalRoot(55n))])]);
assert.equal(singletonApprovalWitness(approved, 55n).root, approved.approvedRoot);
assert.throws(() => singletonApprovalWitness(approved, 56n));
assert.throws(() => replayPoolInstructions([Uint8Array.of(0), shield.subarray(0, -1)]));
assert.throws(() => replayPoolInstructions([Uint8Array.of(0), shield, transfer, exit, exit]));
assert.throws(() => replayPoolInstructions([Uint8Array.of(0), instruction(3,
  [0n, 100n, 55n, commitment(first), 0n, 0n], [paymentRecord])]));
assert.throws(() => replayPoolInstructions([Uint8Array.from([0, 2, ...new Uint8Array(64)])]));

// Mock standard JSON RPC transport, including pagination and final account
// comparison. The synthetic instructions are not valid Groth16 proofs.
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n;
  for (const byte of bytes) n = n * 256n + BigInt(byte);
  let out = '';
  while (n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  return '1'.repeat(bytes.findIndex(x => x !== 0) < 0 ? bytes.length : bytes.findIndex(x => x !== 0)) + out;
}
const pool = 'pool-address', program = 'program-address';
const state = new Uint8Array(2513);
state[0] = 0x57;
new DataView(state.buffer).setBigUint64(2, replay.origin, true);
new DataView(state.buffer).setUint32(10, replay.leaves.length, true);
state.set(f(replay.noteRoot), 110);
const signatureList = instructions.map((_, i) => `signature-${i}`);
let useInnerV0 = false;
const mock = async (_url, options) => {
  const { method, params } = JSON.parse(options.body);
  let result;
  if (method === 'getSignaturesForAddress') {
    const newest = [...signatureList, 'failed-signature'].reverse();
    const start = params[1].before ? newest.indexOf(params[1].before) + 1 : 0;
    result = newest.slice(start, start + params[1].limit).map(signature =>
      ({ signature, err: signature === 'failed-signature' ? 'InstructionError' : null,
        confirmationStatus: 'finalized' }));
  } else if (method === 'getTransaction') {
    const index = signatureList.indexOf(params[0]);
    if (useInnerV0 && index === 1) {
      result = { meta: { err: null, loadedAddresses: { writable: [], readonly: [program] },
        innerInstructions: [{ index: 0, instructions: [
          { programIdIndex: 1, accounts: [0], data: b58(instructions[index]) },
        ] }] }, transaction: { message: { accountKeys: [pool],
        instructions: [{ programIdIndex: 0, accounts: [0], data: '1' }] } } };
    } else result = { meta: { err: null }, transaction: { message: { accountKeys: [pool, program],
      instructions: [{ programIdIndex: 1, accounts: [0], data: b58(instructions[index]) }] } } };
  } else if (method === 'getAccountInfo') {
    result = { value: { owner: program, data: [Buffer.from(state).toString('base64'), 'base64'] } };
  } else throw new Error('Unexpected RPC method');
  return { ok: true, json: async () => ({ result }) };
};
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = mock;
  const fromRpc = await readPoolHistory('https://mock.invalid', pool, program, { pageSize: 2 });
  assert.equal(fromRpc.signatures, 4);
  assert.equal((await restoreFromHistory(fromRpc, sender))[2].spent, false);
  useInnerV0 = true;
  const fromInnerV0 = await readPoolHistory('https://mock.invalid', pool, program, { pageSize: 2 });
  assert.equal(fromInnerV0.noteRoot, replay.noteRoot);
  useInnerV0 = false;
  state[110] ^= 1;
  await assert.rejects(readPoolHistory('https://mock.invalid', pool, program, { pageSize: 2 }),
    /does not reconstruct/);
  state[110] ^= 1;
  state[2449] ^= 1;
  await assert.rejects(readPoolHistory('https://mock.invalid', pool, program, { pageSize: 2 }),
    /does not reconstruct/);
  state[2449] ^= 1;
  globalThis.fetch = async (...args) => {
    const response = await mock(...args);
    if (JSON.parse(args[1].body).method === 'getTransaction' && JSON.parse(args[1].body).params[0] === signatureList[1])
      response.json = async () => ({ result: null });
    return response;
  };
  await assert.rejects(readPoolHistory('https://mock.invalid', pool, program, { pageSize: 2 }), /Missing transaction/);
} finally { globalThis.fetch = realFetch; }
console.log('Phrase, independent history replay, restored notes and witnesses, gap rejection passed');
