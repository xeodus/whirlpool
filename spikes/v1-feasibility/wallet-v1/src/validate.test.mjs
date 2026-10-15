import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { getBase58Decoder, getTransactionEncoder } from '@solana/kit';
import { buildUnsignedMemoTransaction } from './transaction.mjs';
import { validateSignedMemo } from './validate.mjs';

test('accepts only a valid signature over the exact approved v1 Memo', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublic = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const address = getBase58Decoder().decode(rawPublic);
  const built = buildUnsignedMemoTransaction(address,
    { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 123n });
  const signature = sign(null, built.transaction.messageBytes, privateKey);
  const signed = getTransactionEncoder().encode({
    ...built.transaction, signatures: { [address]: new Uint8Array(signature) },
  });
  const encoded = Buffer.from(signed).toString('base64');
  assert.equal((await validateSignedMemo(address, encoded)).signature, getBase58Decoder().decode(signature));
  await assert.rejects(() => validateSignedMemo('11111111111111111111111111111111', encoded));
  const changed = Uint8Array.from(signed);
  changed[changed.length - 1] ^= 1;
  await assert.rejects(() => validateSignedMemo(address, Buffer.from(changed).toString('base64')));
  const changedMemo = Uint8Array.from(signed);
  changedMemo[500] ^= 1;
  await assert.rejects(() => validateSignedMemo(address, Buffer.from(changedMemo).toString('base64')));
});
