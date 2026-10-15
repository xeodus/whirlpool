import { webcrypto } from 'node:crypto';
import { decompileTransactionMessage, getBase58Decoder, getBase58Encoder,
  getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { buildUnsignedMemoTransaction } from './transaction.mjs';

export async function validateSignedMemo(address, encoded) {
  if (typeof address !== 'string' || typeof encoded !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid transaction request');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== 1510 || bytes.toString('base64') !== encoded)
    throw new Error('Unexpected transaction encoding or size');
  const signed = getTransactionDecoder().decode(bytes);
  const compiled = getCompiledTransactionMessageDecoder().decode(signed.messageBytes);
  const message = decompileTransactionMessage(compiled);
  if (message.version !== 1 || message.feePayer.address !== address || compiled.staticAccounts[0] !== address)
    throw new Error('Wrong version or fee payer');
  const expected = buildUnsignedMemoTransaction(address, message.lifetimeConstraint);
  if (signed.messageBytes.length !== expected.transaction.messageBytes.length ||
      !signed.messageBytes.every((byte, i) => byte === expected.transaction.messageBytes[i]))
    throw new Error('Signed message differs from approved Memo template');
  const signature = signed.signatures[address];
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw new Error('Missing signature');
  const publicKey = await webcrypto.subtle.importKey('raw', getBase58Encoder().encode(address), 'Ed25519', false, ['verify']);
  if (!await webcrypto.subtle.verify('Ed25519', publicKey, signature, signed.messageBytes))
    throw new Error('Invalid wallet signature');
  return { signature: getBase58Decoder().decode(signature), bytes };
}
