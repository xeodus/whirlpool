import assert from 'node:assert/strict';
import test from 'node:test';
import { getTransactionDecoder } from '@solana/kit';
import { buildUnsignedMemoTransaction } from './transaction.mjs';

test('builds a v1 transaction above the legacy packet limit without signing', () => {
  const { bytes, size, transaction } = buildUnsignedMemoTransaction(
    '11111111111111111111111111111111',
    { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 123n },
  );
  assert.equal(size, bytes.length);
  assert.equal(bytes[0], 0x81);
  assert.equal(Object.values(transaction.signatures).length, 1);
  assert.equal(Object.values(transaction.signatures)[0], null);
  assert.equal(getTransactionDecoder().decode(bytes).messageBytes[0], 0x81);
});
