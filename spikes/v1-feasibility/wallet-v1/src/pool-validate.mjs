import { webcrypto } from 'node:crypto';
import { decompileTransactionMessage, getBase58Decoder, getBase58Encoder,
  getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { buildPoolTransaction, TEST_PROGRAM } from './pool-transaction.mjs';
import { FUNDING_SOURCE as TEST_WALLET } from './funding-transaction.mjs';

export async function validateSignedPool(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error('Invalid transaction encoding');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 4096 || bytes.toString('base64') !== encoded) throw new Error('Invalid transaction size');
  const signed = getTransactionDecoder().decode(bytes);
  const compiled = getCompiledTransactionMessageDecoder().decode(signed.messageBytes);
  const message = decompileTransactionMessage(compiled);
  if (message.version !== 1 || message.feePayer.address !== TEST_WALLET ||
      compiled.staticAccounts[0] !== TEST_WALLET) throw new Error('Wrong version or fee payer');
  const poolInstructions = message.instructions.filter(ix => ix.programAddress === TEST_PROGRAM);
  if (poolInstructions.length !== 1) throw new Error('Expected exactly one pool instruction');
  const data = poolInstructions[0].data;
  let action = { 3: 'shield', 4: 'transfer', 8: 'exit' }[data?.[0]];
  if (action === 'exit') {
    const amount = BigInt(`0x${Buffer.from(data.subarray(257 + 4 * 32, 289 + 4 * 32)).toString('hex')}`);
    if (amount === 3_000_000n) action = 'exit_change';
  }
  if (!action) throw new Error('Unsupported pool action');
  const expected = await buildPoolTransaction(action, data, message.lifetimeConstraint);
  if (signed.messageBytes.length !== expected.transaction.messageBytes.length ||
      !signed.messageBytes.every((byte, i) => byte === expected.transaction.messageBytes[i]))
    throw new Error('Signed message differs from fixed pool action template');
  const signature = signed.signatures[TEST_WALLET];
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw new Error('Missing signature');
  const publicKey = await webcrypto.subtle.importKey('raw', getBase58Encoder().encode(TEST_WALLET),
    'Ed25519', false, ['verify']);
  if (!await webcrypto.subtle.verify('Ed25519', publicKey, signature, signed.messageBytes))
    throw new Error('Invalid wallet signature');
  return { action, signature: getBase58Decoder().decode(signature) };
}
