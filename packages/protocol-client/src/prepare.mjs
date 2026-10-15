import { poseidon4 } from 'poseidon-lite';
import { decode58, approvalWitness } from './history.mjs';
import { commitment, encryptOutput, nullifier, packOutputs } from './recovery.mjs';
import { decodePrivacyAddress } from './address.mjs';

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const U64 = (1n << 64n) - 1n;
export const RELAYER_FEE = 1_000_000n;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export function randomRho() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return BigInt(`0x${hex(bytes)}`) % (FIELD - 1n) + 1n;
}
function amount(value) {
  const number = BigInt(value);
  if (number < 1n || number > U64) throw new RangeError('Amount must be positive u64 lamports');
  return number;
}
function rho(next) {
  const value = BigInt(next());
  if (value < 1n || value >= FIELD) throw new RangeError('Invalid note randomness');
  return value;
}
function solState(state) {
  if (state?.asset !== 0n || typeof state.origin !== 'bigint') throw new Error('Expected authenticated SOL pool state');
}
function source(state, account, item) {
  if (!item?.spendable || item.spent || item.note?.owner !== account.owner)
    throw new Error('Note is not an unspent note owned by this phrase');
  if (!Number.isInteger(item.index) || state.leaves[item.index] !== commitment(item.note))
    throw new Error('Note is absent from authenticated history');
  const witness = state.tree.path(item.index);
  if (witness.root !== state.noteRoot) throw new Error('Note witness is stale');
  return { ...item, witness, nullifier: nullifier(item.note, account.spendSecret) };
}
async function digest(payload) {
  const wire = new Uint8Array(payload.length + 2);
  wire[0] = payload.length & 255; wire[1] = payload.length >> 8;
  wire.set(payload, 2);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', wire));
  return BigInt(`0x${hex(hash.subarray(0, 31))}`);
}
function publicRecipient(address) {
  const bytes = decode58(address);
  if (bytes.length !== 32) throw new Error('Expected a 32-byte Solana recipient');
  return [BigInt(`0x${hex(bytes.subarray(0, 16))}`), BigInt(`0x${hex(bytes.subarray(16))}`)];
}

export async function prepareShield(state, account, depositLamports, nextRho = randomRho) {
  solState(state);
  if (state.paused) throw new Error('Deposits are paused');
  const note = { asset: 0n, amount: amount(depositLamports), owner: account.owner,
    origin: state.origin, rho: rho(nextRho) };
  const payload = packOutputs([await encryptOutput(note, account.viewPublic, account.viewPublic)]);
  const payloadDigest = await digest(payload);
  return { circuit: 'shield', note, payload, input: { asset: 0n, amount: note.amount,
    origin: note.origin, commitment: commitment(note), payloadDigest,
    payloadTag: poseidon4([105n, note.rho, payloadDigest, commitment(note)]),
    owner: note.owner, rho: note.rho } };
}

async function preparePrivate(state, account, selected, mode, valueLamports, destination, nextRho) {
  solState(state);
  if (state.paused) throw new Error('Private actions are paused');
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 2)
    throw new Error('Select one or two input notes');
  const notes = selected.map(item => source(state, account, item));
  if (notes.length === 2 && notes[0].nullifier === notes[1].nullifier)
    throw new Error('Cannot consume the same note twice');
  const origin = notes[0].note.origin;
  if (notes.some(item => item.note.origin !== origin)) throw new Error('Inputs have different deposit origins');
  const approval = approvalWitness(state, origin);
  const value = amount(valueLamports);
  const total = notes.reduce((sum, item) => sum + item.note.amount, 0n);
  if (total > U64 || value + RELAYER_FEE >= total) throw new Error('Amount leaves no positive change after the relayer fee');
  const change = { asset: 0n, amount: total - value - RELAYER_FEE,
    owner: account.owner, origin, rho: rho(nextRho) };
  let payment, destinationAddress, recipientLo = 0n, recipientHi = 0n;
  if (mode === 'transfer') {
    destinationAddress = await decodePrivacyAddress(destination);
    payment = { asset: 0n, amount: value, owner: destinationAddress.owner, origin, rho: rho(nextRho) };
    if (payment.rho === change.rho) throw new Error('Output randomness must be distinct');
  } else if (mode === 'withdraw') {
    [recipientLo, recipientHi] = publicRecipient(destination);
  } else throw new Error('Unknown private action');
  const records = mode === 'transfer' ? [
    await encryptOutput(payment, destinationAddress.viewPublic, account.viewPublic),
    await encryptOutput(change, account.viewPublic, account.viewPublic),
  ] : [await encryptOutput(change, account.viewPublic, account.viewPublic)];
  const payload = packOutputs(records);
  const payloadDigest = await digest(payload);
  const firstNullifier = notes[0].nullifier;
  const input = { asset: 0n, noteRoot: state.noteRoot, approvedRoot: state.approvedRoot,
    nullifier: notes.map(item => item.nullifier), paymentCommitment: payment ? commitment(payment) : 0n,
    changeCommitment: commitment(change), payoutAmount: mode === 'withdraw' ? value : 0n,
    recipientLo, recipientHi, fee: RELAYER_FEE, payloadDigest,
    payloadTag: poseidon4([105n, account.spendSecret, payloadDigest, firstNullifier]),
    origin, amount: notes.map(item => item.note.amount),
    ownerSecret: notes.map(() => account.spendSecret), rho: notes.map(item => item.note.rho),
    noteSiblings: notes.map(item => item.witness.siblings), noteBits: notes.map(item => item.witness.bits),
    approvalSiblings: approval.siblings, approvalBits: approval.bits,
    paymentAmount: payment?.amount ?? 0n, paymentOwner: payment?.owner ?? 0n, paymentRho: payment?.rho ?? 0n,
    changeAmount: change.amount, changeOwner: change.owner, changeRho: change.rho };
  return { circuit: `${mode}_${notes.length === 1 ? 'one' : 'two'}`, input, payload,
    payment, change, value, fee: RELAYER_FEE };
}

export function prepareTransfer(state, account, notes, amountLamports, privacyAddress, nextRho = randomRho) {
  return preparePrivate(state, account, notes, 'transfer', amountLamports, privacyAddress, nextRho);
}
export function prepareWithdrawal(state, account, notes, amountLamports, solanaAddress, nextRho = randomRho) {
  return preparePrivate(state, account, notes, 'withdraw', amountLamports, solanaAddress, nextRho);
}
export function preparePublicExit(state, account, item, solanaAddress) {
  solState(state);
  const note = source(state, account, item);
  const [recipientLo, recipientHi] = publicRecipient(solanaAddress);
  return { circuit: 'public_exit', input: { asset: 0n, noteRoot: state.noteRoot,
    nullifier: note.nullifier, origin: note.note.origin, exitAmount: note.note.amount,
    recipientLo, recipientHi, ownerSecret: account.spendSecret,
    rho: note.note.rho, siblings: note.witness.siblings, bits: note.witness.bits },
    value: note.note.amount, publicOrigin: note.note.origin };
}
