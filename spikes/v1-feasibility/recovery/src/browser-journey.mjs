import { poseidon4 } from 'poseidon-lite';
import { account, commitment, encryptOutput, nullifier, packOutputs } from './recovery.mjs';
import { replayPoolInstructions, restoreFromHistory, singletonApprovalRoot, singletonApprovalWitness } from './history.mjs';
import { phraseFromResearchSeed, seedFromPrivacyPhrase } from './phrase.mjs';

const status = document.getElementById('status');
const button = document.getElementById('start');
const params = new URLSearchParams(location.search);
const runs = Number(params.get('runs') || '3');
const asset = params.get('asset') === '1' ? 1n : 0n;
const be32 = n => Uint8Array.from(BigInt(n).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
const stringify = input => JSON.parse(JSON.stringify(input, (_, v) => typeof v === 'bigint' ? v.toString() : v));
const seed = offset => Uint8Array.from({ length: 32 }, (_, i) => i + offset);
const instruction = (tag, signals, payload) => Uint8Array.from([tag, ...new Uint8Array(256),
  ...signals.flatMap(x => Array.from(be32(x))),
  ...(payload ? [payload.length & 255, payload.length >> 8, ...payload] : [])]);
async function digest(payload) {
  const wire = Uint8Array.from([payload.length & 255, payload.length >> 8, ...payload]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', wire));
  return BigInt(`0x${Array.from(hash.subarray(0, 31), x => x.toString(16).padStart(2, '0')).join('')}`);
}
async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot fetch ${path}`);
  return response.json();
}
async function bytes(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot fetch ${path}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function prove(name, input, count, timings, artifacts) {
  const vk = artifacts[name].vk;
  let signals;
  for (let i = 0; i < count; i++) {
    status.textContent = `${name}: proof ${i + 1}/${count}`;
    const started = performance.now();
    const result = await snarkjs.groth16.fullProve(
      stringify(input), `/wasm/${name}`, `/zkey/${name}`);
    const elapsed = performance.now() - started;
    if (!await snarkjs.groth16.verify(vk, result.publicSignals, result.proof))
      throw new Error(`${name} proof failed verification`);
    timings[name].push(elapsed);
    signals = result.publicSignals.map(BigInt);
  }
  return signals;
}
button.addEventListener('click', async () => {
  if (!Number.isInteger(runs) || runs < 1 || runs > 100) {
    status.textContent = 'Choose 1 to 100 runs.';
    return;
  }
  button.disabled = true;
  try {
    status.textContent = 'Loading proof artifacts…';
    const started = performance.now();
    const artifacts = {};
    for (const name of ['shield', 'transfer_one', 'public_exit']) {
      const [wasm, zkey, vk] = await Promise.all([
        bytes(`/wasm/${name}`), bytes(`/zkey/${name}`), json(`/vk/${name}`),
      ]);
      artifacts[name] = { wasmBytes: wasm.length, zkeyBytes: zkey.length, vk };
    }
    const artifactLoadMs = performance.now() - started;
    const timings = { shield: [], transfer_one: [], public_exit: [] };
    const origin = 55n;
    const sender = await account(seedFromPrivacyPhrase(phraseFromResearchSeed(seed(1))));
    const recipient = await account(seedFromPrivacyPhrase(phraseFromResearchSeed(seed(33))));
    const first = { asset, amount: 100n, owner: sender.owner, origin, rho: 11n };
    const payment = { asset, amount: 60n, owner: recipient.owner, origin, rho: 50n };
    const change = { asset, amount: 38n, owner: sender.owner, origin, rho: 51n };
    const shieldPayload = packOutputs([await encryptOutput(first, sender.viewPublic, sender.viewPublic)]);
    const shieldDigest = await digest(shieldPayload);
    const shieldSignals = await prove('shield', {
      asset, amount: first.amount, origin, commitment: commitment(first), payloadDigest: shieldDigest,
      payloadTag: poseidon4([105n, first.rho, shieldDigest, commitment(first)]),
      owner: first.owner, rho: first.rho,
    }, 1, timings, artifacts);
    const chain = [asset === 1n ? Uint8Array.from([0, 1, ...new Uint8Array(64)]) : Uint8Array.of(0),
      instruction(3, shieldSignals, shieldPayload)];
    let history = replayPoolInstructions(chain);
    const restored = (await restoreFromHistory(history, sender)).find(x => x.spendable && !x.spent);
    if (!restored) throw new Error('Shield note did not restore');

    const approvedRoot = singletonApprovalRoot(origin);
    chain.push(Uint8Array.from([1, ...be32(approvedRoot)]));
    history = replayPoolInstructions(chain);
    const approval = singletonApprovalWitness(history, origin);
    const transferPayload = packOutputs([
      await encryptOutput(payment, recipient.viewPublic, sender.viewPublic),
      await encryptOutput(change, sender.viewPublic, sender.viewPublic),
    ]);
    const transferDigest = await digest(transferPayload);
    const transferNullifier = nullifier(first, sender.spendSecret);
    const transferSignals = await prove('transfer_one', {
      asset, noteRoot: history.noteRoot, approvedRoot, nullifier: [transferNullifier],
      paymentCommitment: commitment(payment), changeCommitment: commitment(change), payoutAmount: 0n,
      recipientLo: 0n, recipientHi: 0n, fee: 2n, payloadDigest: transferDigest,
      payloadTag: poseidon4([105n, sender.spendSecret, transferDigest, transferNullifier]),
      origin, amount: [first.amount], ownerSecret: [sender.spendSecret], rho: [first.rho],
      noteSiblings: [restored.witness.siblings], noteBits: [restored.witness.bits],
      approvalSiblings: approval.siblings, approvalBits: approval.bits,
      paymentAmount: payment.amount, paymentOwner: payment.owner, paymentRho: payment.rho,
      changeAmount: change.amount, changeOwner: change.owner, changeRho: change.rho,
    }, runs, timings, artifacts);
    chain.push(instruction(4, transferSignals, transferPayload));
    history = replayPoolInstructions(chain);
    const transferred = (await restoreFromHistory(history, recipient)).find(x => x.spendable && !x.spent);
    if (!transferred) throw new Error('Recipient note did not restore');
    chain.push(Uint8Array.of(1, ...be32(0n)), Uint8Array.of(2, 1));
    history = replayPoolInstructions(chain);
    const exitSignals = await prove('public_exit', {
      asset, noteRoot: history.noteRoot, nullifier: transferred.nullifier,
      origin, exitAmount: transferred.note.amount, recipientLo: 12n, recipientHi: 34n,
      ownerSecret: recipient.spendSecret, rho: transferred.note.rho,
      siblings: transferred.witness.siblings, bits: transferred.witness.bits,
    }, runs, timings, artifacts);
    chain.push(instruction(8, exitSignals));
    if (!(await restoreFromHistory(replayPoolInstructions(chain), recipient))[0].spent)
      throw new Error('Exit spent status did not restore');
    const result = { userAgent: navigator.userAgent, asset: Number(asset), artifactLoadMs, timings,
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([k, v]) => [k,
        { wasmBytes: v.wasmBytes, zkeyBytes: v.zkeyBytes }])),
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      // Never send phrase, seed, witnesses or decrypted notes to the server.
      restoredSpendAndExit: true };
    const response = await fetch('/journey-results', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result) });
    if (!response.ok) throw new Error('Could not save local timing result');
    status.textContent = `Restored journey passed. Transfer ${runs} runs; exit ${runs} runs. Artifact load ${Math.round(artifactLoadMs)} ms.`;
  } catch (error) {
    status.textContent = `Failed: ${error.message}`;
  } finally { button.disabled = false; }
});
if (params.has('autorun')) button.click();
