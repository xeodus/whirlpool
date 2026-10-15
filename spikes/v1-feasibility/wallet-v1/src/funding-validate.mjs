import { webcrypto } from 'node:crypto';
import { decompileTransactionMessage, getBase58Decoder, getBase58Encoder,
  getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { buildFundingTransaction, FUNDING_SOURCE } from './funding-transaction.mjs';

export async function validateSignedFunding(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error('Invalid transaction encoding');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length > 4096) throw new Error('Invalid transaction size');
  const signed = getTransactionDecoder().decode(bytes);
  const compiled = getCompiledTransactionMessageDecoder().decode(signed.messageBytes);
  const message = decompileTransactionMessage(compiled);
  if (message.version !== 1 || message.feePayer.address !== FUNDING_SOURCE ||
      compiled.staticAccounts[0] !== FUNDING_SOURCE)
    throw new Error('Wrong version or fee payer');
  const expected = buildFundingTransaction(message.lifetimeConstraint);
  if (signed.messageBytes.length !== expected.transaction.messageBytes.length ||
      !signed.messageBytes.every((byte, i) => byte === expected.transaction.messageBytes[i]))
    throw new Error('Signed message differs from fixed funding template');
  const signature = signed.signatures[FUNDING_SOURCE];
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw new Error('Missing signature');
  const publicKey = await webcrypto.subtle.importKey('raw', getBase58Encoder().encode(FUNDING_SOURCE),
    'Ed25519', false, ['verify']);
  if (!await webcrypto.subtle.verify('Ed25519', publicKey, signature, signed.messageBytes))
    throw new Error('Invalid wallet signature');
  return { signature: getBase58Decoder().decode(signature) };
}
