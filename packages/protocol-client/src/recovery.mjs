import { Aes256Gcm, CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/core';
import { poseidon2, poseidon3, poseidon4 } from 'poseidon-lite';

const encoder = new TextEncoder();
const suite = new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes256Gcm() });
const h2 = (a, b) => poseidon2([BigInt(a), BigInt(b)]);
const h3 = (a, b, c) => poseidon3([BigInt(a), BigInt(b), BigInt(c)]);
const h4 = (a, b, c, d) => poseidon4([BigInt(a), BigInt(b), BigInt(c), BigInt(d)]);
const FR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = value => {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-f]*$/.test(value)) throw new Error('Invalid hex');
  return Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16));
};
const bytes32 = value => unhex(BigInt(value).toString(16).padStart(64, '0'));
export class InvalidCommitmentError extends Error {}
const U64 = (1n << 64n) - 1n;
function encodeNote(note) {
  if (![0n, 1n].includes(note.asset) || note.amount < 1n || note.amount > U64 ||
    note.origin < 0n || note.origin > U64 || note.owner < 0n || note.owner >= FR ||
    note.rho < 0n || note.rho >= FR) throw new Error('Invalid note fields');
  const out = new Uint8Array(81);
  const view = new DataView(out.buffer);
  out[0] = Number(note.asset);
  view.setBigUint64(1, note.amount, true);
  out.set(bytes32(note.owner), 9);
  view.setBigUint64(41, note.origin, true);
  out.set(bytes32(note.rho), 49);
  return out;
}
function decodeNote(bytes) {
  if (bytes.length !== 81) throw new Error('Invalid note length');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const note = { asset: BigInt(bytes[0]), amount: view.getBigUint64(1, true),
    owner: BigInt(`0x${hex(bytes.subarray(9, 41))}`), origin: view.getBigUint64(41, true),
    rho: BigInt(`0x${hex(bytes.subarray(49, 81))}`) };
  encodeNote(note);
  return note;
}

async function derive(seed, label, index = 0) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('Privacy entropy must be 32 bytes');
  const key = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256',
    salt: encoder.encode('whirlpool-devnet-alpha-v1'), info: encoder.encode(`${label}:${index}`) }, key, 256));
}

export async function account(seed, index = 0) {
  const spendBytes = await derive(seed, 'spend', index);
  const viewBytes = await derive(seed, 'view', index);
  const spendSecret = BigInt(`0x${hex(spendBytes)}`) % FR;
  const viewPair = await suite.kem.deriveKeyPair(viewBytes);
  return { spendSecret, owner: h2(102n, spendSecret), viewPair,
    viewPublic: hex(new Uint8Array(await suite.kem.serializePublicKey(viewPair.publicKey))) };
}

export function commitment(note) {
  return h3(h4(101n, note.asset, note.amount, note.owner), note.origin, note.rho);
}

export function nullifier(note, spendSecret) {
  return h4(103n, spendSecret, note.rho, note.origin);
}

export async function encryptOutput(note, recipientViewPublic, senderViewPublic) {
  const aad = bytes32(commitment(note));
  const plain = encodeNote(note);
  const recipientKey = await suite.kem.deserializePublicKey(unhex(recipientViewPublic));
  const senderKey = await suite.kem.deserializePublicKey(unhex(senderViewPublic));
  const recipient = await suite.createSenderContext({ recipientPublicKey: recipientKey });
  const sender = await suite.createSenderContext({ recipientPublicKey: senderKey });
  return { commitment: hex(aad), recipient: { enc: hex(new Uint8Array(recipient.enc)),
    ciphertext: hex(new Uint8Array(await recipient.seal(plain, aad))) },
  sender: { enc: hex(new Uint8Array(sender.enc)), ciphertext: hex(new Uint8Array(await sender.seal(plain, aad))) } };
}

export async function openOutput(record, account, role) {
  const envelope = record[role];
  const context = await suite.createRecipientContext({ recipientKey: account.viewPair.privateKey, enc: unhex(envelope.enc) });
  const note = decodeNote(new Uint8Array(await context.open(unhex(envelope.ciphertext), unhex(record.commitment))));
  if (commitment(note).toString(16).padStart(64, '0') !== record.commitment) throw new InvalidCommitmentError('Commitment mismatch');
  return note;
}

export async function recover(records, account, spentNullifiers) {
  const found = [];
  for (const [recordIndex, record] of records.entries()) {
    for (const role of ['recipient', 'sender']) {
      try {
        const note = await openOutput(record, account, role);
        found.push({ role, note, recordIndex, spendable: note.owner === account.owner,
          spent: note.owner === account.owner ? spentNullifiers.has(nullifier(note, account.spendSecret).toString()) : undefined });
        break;
      } catch (error) {
        if (error instanceof InvalidCommitmentError) throw error;
        // Other wallets cannot decrypt this envelope.
      }
    }
  }
  return found;
}

// Compact research encoding for the circuit's 1024-byte payload cap. It is not a V1 wire format.
export function packOutputs(records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 2) throw new Error('Expected one or two outputs');
  const parts = [Uint8Array.of(records.length)];
  for (const record of records) {
    parts.push(unhex(record.commitment));
    for (const role of ['recipient', 'sender']) {
      const enc = unhex(record[role].enc);
      const ciphertext = unhex(record[role].ciphertext);
      if (enc.length !== 32 || ciphertext.length !== 97) throw new Error('Bad envelope length');
      parts.push(enc, Uint8Array.of(ciphertext.length & 255, ciphertext.length >> 8), ciphertext);
    }
  }
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  if (output.length > 1024) throw new Error('Output payload exceeds circuit cap');
  return output;
}

export function unpackOutputs(payload) {
  if (!(payload instanceof Uint8Array) || ![1, 2].includes(payload[0])) throw new Error('Bad output count');
  let offset = 1;
  const take = count => {
    if (offset + count > payload.length) throw new Error('Truncated output payload');
    const value = payload.subarray(offset, offset + count);
    offset += count;
    return value;
  };
  const records = [];
  for (let i = 0; i < payload[0]; i++) {
    const record = { commitment: hex(take(32)) };
    for (const role of ['recipient', 'sender']) {
      const enc = hex(take(32));
      const length = take(2);
      const ciphertextLength = length[0] + (length[1] << 8);
      if (ciphertextLength !== 97) throw new Error('Bad envelope length');
      record[role] = { enc, ciphertext: hex(take(ciphertextLength)) };
    }
    records.push(record);
  }
  if (offset !== payload.length) throw new Error('Trailing output bytes');
  return records;
}
