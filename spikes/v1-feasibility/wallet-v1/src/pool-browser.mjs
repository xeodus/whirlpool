import { getWallets } from '@wallet-standard/app';
import { getBase58Decoder, getBase58Encoder, getBase64Decoder, getTransactionDecoder } from '@solana/kit';
import { poseidon4 } from '../../recovery/node_modules/poseidon-lite/index.js';
import { account, commitment, encryptOutput, nullifier, packOutputs } from '../../recovery/src/recovery.mjs';
import { readPoolHistory, restoreFromHistory, singletonApprovalWitness } from '../../recovery/src/history.mjs';
import { phraseFromResearchSeed, seedFromPrivacyPhrase } from '../../recovery/src/phrase.mjs';
import { buildPoolTransaction, TEST_POOL, TEST_PROGRAM, validatePoolInstruction } from './pool-transaction.mjs';
import { FUNDING_SOURCE as TEST_WALLET } from './funding-transaction.mjs';

const status = document.getElementById('status');
const proofText = document.getElementById('proof');
const sendButton = document.getElementById('send');
const FQ = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const origin = 55n;
const asset = 0n;
const seed = offset => Uint8Array.from({ length: 32 }, (_, i) => i + offset);
const first = async sender => ({ asset, amount: 10_000_000n, owner: sender.owner, origin, rho: 11n });
const payment = async recipient => ({ asset, amount: 6_000_000n, owner: recipient.owner, origin, rho: 50n });
const change = async sender => ({ asset, amount: 3_000_000n, owner: sender.owner, origin, rho: 51n });
const stringify = input => JSON.parse(JSON.stringify(input, (_, v) => typeof v === 'bigint' ? v.toString() : v));
const be32 = n => Uint8Array.from(BigInt(n).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const say = value => { status.textContent = value; };
const toBase64 = bytes => btoa(Array.from(bytes, x => String.fromCharCode(x)).join(''));
const fromBase64 = value => Uint8Array.from(atob(value.trim()), x => x.charCodeAt(0));
let wallet, walletAccount, prepared, signedActions = new Set();

async function rpc(method, params = []) {
  const response = await fetch('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || body.error || `RPC HTTP ${response.status}`);
  return body.result;
}
async function history() { return readPoolHistory(`${location.origin}/rpc`, TEST_POOL, TEST_PROGRAM); }
async function digest(payload) {
  const wire = Uint8Array.from([payload.length & 255, payload.length >> 8, ...payload]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', wire));
  return BigInt(`0x${hex(hash.subarray(0, 31))}`);
}
function encodeProof(proof, signals) {
  const g1 = p => [...be32(p[0]), ...be32(p[1])];
  const g2 = p => [...be32(p[0][1]), ...be32(p[0][0]), ...be32(p[1][1]), ...be32(p[1][0])];
  return Uint8Array.from([...be32(proof.pi_a[0]), ...be32((FQ - BigInt(proof.pi_a[1])) % FQ),
    ...g2(proof.pi_b), ...g1(proof.pi_c), ...signals.flatMap(x => Array.from(be32(x)))]);
}
async function prove(name, input) {
  say(`Loading ${name} artifact and proving locally…`);
  const [vkResponse, wasmResponse, zkeyResponse] = await Promise.all([
    fetch(`/vk/${name}`), fetch(`/wasm/${name}`), fetch(`/zkey/${name}`),
  ]);
  if (![vkResponse, wasmResponse, zkeyResponse].every(r => r.ok)) throw new Error('Artifact download failed');
  const vk = await vkResponse.json();
  const wasm = new Uint8Array(await wasmResponse.arrayBuffer());
  const zkey = new Uint8Array(await zkeyResponse.arrayBuffer());
  const started = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(stringify(input), wasm, zkey);
  const elapsed = performance.now() - started;
  if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) throw new Error('Browser proof verification failed');
  return { bytes: encodeProof(proof, publicSignals), elapsed: Math.round(elapsed) };
}
function instruction(action, proofBytes, payload) {
  const tag = { shield: 3, transfer: 4, exit: 8, exit_change: 8 }[action];
  return Uint8Array.from([tag, ...proofBytes,
    ...(payload ? [payload.length & 255, payload.length >> 8, ...payload] : [])]);
}
async function prepare(action) {
  prepared = undefined; sendButton.disabled = true; proofText.value = '';
  const sender = await account(seedFromPrivacyPhrase(phraseFromResearchSeed(seed(1))));
  const recipient = await account(seedFromPrivacyPhrase(phraseFromResearchSeed(seed(33))));
  let result, payload;
  if (action === 'shield') {
    const state = await history();
    if (state.leaves.length !== 0 || state.origin !== origin) throw new Error('Pool is no longer empty');
    const note = await first(sender);
    payload = packOutputs([await encryptOutput(note, sender.viewPublic, sender.viewPublic)]);
    const payloadDigest = await digest(payload);
    result = await prove('shield', { asset, amount: note.amount, origin, commitment: commitment(note),
      payloadDigest, payloadTag: poseidon4([105n, note.rho, payloadDigest, commitment(note)]),
      owner: note.owner, rho: note.rho });
  } else if (action === 'transfer') {
    const state = await history();
    const restored = (await restoreFromHistory(state, sender)).find(x => x.spendable && !x.spent &&
      x.note.origin === origin && x.note.amount === 10_000_000n);
    if (!restored) throw new Error('Sender note unavailable in finalized history');
    const approval = singletonApprovalWitness(state, origin);
    const pay = await payment(recipient), back = await change(sender);
    payload = packOutputs([await encryptOutput(pay, recipient.viewPublic, sender.viewPublic),
      await encryptOutput(back, sender.viewPublic, sender.viewPublic)]);
    const payloadDigest = await digest(payload);
    result = await prove('transfer_one', { asset, noteRoot: state.noteRoot,
      approvedRoot: state.approvedRoot, nullifier: [restored.nullifier],
      paymentCommitment: commitment(pay), changeCommitment: commitment(back), payoutAmount: 0n,
      recipientLo: 0n, recipientHi: 0n, fee: 1_000_000n, payloadDigest,
      payloadTag: poseidon4([105n, sender.spendSecret, payloadDigest, restored.nullifier]),
      origin, amount: [restored.note.amount], ownerSecret: [sender.spendSecret], rho: [restored.note.rho],
      noteSiblings: [restored.witness.siblings], noteBits: [restored.witness.bits],
      approvalSiblings: approval.siblings, approvalBits: approval.bits,
      paymentAmount: pay.amount, paymentOwner: pay.owner, paymentRho: pay.rho,
      changeAmount: back.amount, changeOwner: back.owner, changeRho: back.rho });
  } else {
    const state = await history();
    const exitAccount = action === 'exit_change' ? sender : recipient;
    const exitAmount = action === 'exit_change' ? 3_000_000n : 6_000_000n;
    const restored = (await restoreFromHistory(state, exitAccount)).find(x => x.spendable && !x.spent &&
      x.note.origin === origin && x.note.amount === exitAmount);
    if (!restored) throw new Error('Exit note unavailable in finalized history');
    const addressBytes = getBase58Encoder().encode(TEST_WALLET);
    const recipientLo = BigInt(`0x${hex(addressBytes.subarray(0, 16))}`);
    const recipientHi = BigInt(`0x${hex(addressBytes.subarray(16))}`);
    result = await prove('public_exit', { asset, noteRoot: state.noteRoot,
      nullifier: restored.nullifier, origin, exitAmount: restored.note.amount,
      recipientLo, recipientHi, ownerSecret: exitAccount.spendSecret, rho: restored.note.rho,
      siblings: restored.witness.siblings, bits: restored.witness.bits });
  }
  const data = instruction(action, result.bytes, payload);
  validatePoolInstruction(action, data);
  prepared = { action, data };
  proofText.value = toBase64(data);
  say(`${action} proof generated and verified locally in ${result.elapsed} ms. Public instruction: ${data.length} bytes. No phrase, witness or decrypted note was sent to the server. ${action === 'exit' ? 'Copy the base64 instruction to Brave for Jupiter signing.' : 'Review and sign only after separate approval.'}`);
  sendButton.disabled = !walletAccount;
}
for (const action of ['shield','transfer','exit','exit_change']) {
  document.getElementById(action).onclick = async () => {
    try { await prepare(action); } catch (error) { say(`${action} preparation failed: ${error.message}`); }
  };
}
document.getElementById('import').onclick = () => {
  try {
    const data = fromBase64(proofText.value);
    let action = { 3: 'shield', 4: 'transfer', 8: 'exit' }[data[0]];
    if (action === 'exit') {
      const amount = BigInt(`0x${hex(data.subarray(257 + 4 * 32, 289 + 4 * 32))}`);
      if (amount === 3_000_000n) action = 'exit_change';
    }
    validatePoolInstruction(action, data);
    prepared = { action, data }; sendButton.disabled = !walletAccount;
    say(`Imported ${action} proof instruction (${data.length} bytes). It will be verified by Devnet simulation before wallet signing.`);
  } catch (error) { say(`Import failed: ${error.message}`); }
};
document.getElementById('connect').onclick = async () => {
  try {
    wallet = getWallets().get().find(w => w.name === 'Jupiter');
    if (!Array.from(wallet?.features['solana:signTransaction']?.supportedTransactionVersions ?? []).map(String).includes('1'))
      throw new Error('Jupiter v1 signer unavailable');
    const connected = await wallet.features['standard:connect'].connect();
    walletAccount = connected.accounts.find(a => a.address === TEST_WALLET && a.chains.includes('solana:devnet'));
    if (!walletAccount) throw new Error('Connect the approved Devnet Jupiter test account');
    say(`Connected ${walletAccount.address}. No transaction signed or sent.`);
    sendButton.disabled = !prepared;
  } catch (error) { say(`Connect failed: ${error.message}`); }
};
sendButton.onclick = async () => {
  sendButton.disabled = true;
  try {
    if (!prepared || !walletAccount || !wallet) throw new Error('Prepare proof and connect Jupiter first');
    const { action, data } = prepared;
    if (signedActions.has(action)) throw new Error('This page already attempted that action; inspect history');
    const latest = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const built = await buildPoolTransaction(action, data, latest.value);
    const [simulation, fee] = await Promise.all([
      rpc('simulateTransaction', [getBase64Decoder().decode(built.bytes),
        { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed' }]),
      rpc('getFeeForMessage', [getBase64Decoder().decode(built.transaction.messageBytes),
        { commitment: 'confirmed' }]),
    ]);
    if (simulation.value.err !== null || !Number.isSafeInteger(fee.value) || fee.value > 20_000)
      throw new Error(`Devnet simulation or fee failed: ${JSON.stringify(simulation.value.err)}; fee ${fee.value}`);
    const effect = { shield: '0.01 SOL deposited into the pool',
      transfer: '0.006 SOL private payment, 0.003 SOL private change, 0.001 SOL fee from pool',
      exit: '0.006 SOL public payout to Jupiter',
      exit_change: '0.003 SOL public payout to Jupiter' }[action];
    say(`Devnet ${action} simulated successfully. v1 ${built.bytes.length} bytes; ${simulation.value.unitsConsumed} CU; network fee ${fee.value} lamports; ${effect}. Review Jupiter's prompt carefully.`);
    const [result] = await wallet.features['solana:signTransaction'].signTransaction({
      account: walletAccount, chain: 'solana:devnet', transaction: built.bytes,
    });
    const signed = result?.signedTransaction;
    if (!(signed instanceof Uint8Array)) throw new Error('No signed transaction returned');
    const decoded = getTransactionDecoder().decode(signed);
    if (decoded.messageBytes.length !== built.transaction.messageBytes.length ||
        !decoded.messageBytes.every((byte, i) => byte === built.transaction.messageBytes[i]))
      throw new Error('Wallet changed simulated message; nothing broadcast');
    const signature = decoded.signatures[TEST_WALLET];
    const key = await crypto.subtle.importKey('raw', walletAccount.publicKey, 'Ed25519', false, ['verify']);
    if (!(signature instanceof Uint8Array) || !await crypto.subtle.verify('Ed25519', key, signature, decoded.messageBytes))
      throw new Error('Wallet signature invalid; nothing broadcast');
    signedActions.add(action); // Ambiguous sends require independent readback before retry.
    const response = await fetch('/broadcast', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transaction: getBase64Decoder().decode(signed) }) });
    const body = await response.json();
    if (!response.ok) throw new Error(`${body.error}; inspect Devnet history before retry`);
    if (body.signature !== getBase58Decoder().decode(signature)) throw new Error('RPC signature mismatch');
    say(`Devnet RPC accepted ${action}: ${body.signature}. Finalization and independent history readback remain required. Do not retry.`);
  } catch (error) { say(`Stopped: ${error.message}\nDo not retry after a wallet or RPC ambiguity until history is checked.`); }
};
