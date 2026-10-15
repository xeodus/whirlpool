import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBase58Decoder, getTransactionDecoder } from '@solana/kit';
import { buildPoolTransaction, inspectPoolAction } from '../src/transaction.mjs';

const be32 = value => Uint8Array.from(BigInt(value).toString(16).padStart(64, '0').match(/../g), x => parseInt(x, 16));
const account = seed => getBase58Decoder().decode(Uint8Array.from({ length: 32 }, (_, i) => i + seed));
const programId = account(1), poolId = account(33), submitter = account(65), recipient = account(97);
function instruction(tag, signals, payloadSize = 0) {
  const data = Uint8Array.from([tag, ...new Uint8Array(256), ...signals.flatMap(value => Array.from(be32(value))),
    ...(payloadSize ? [payloadSize & 255, payloadSize >> 8, ...new Uint8Array(payloadSize)] : [])]);
  return data;
}
const recipientBytes = Uint8Array.from({ length: 32 }, (_, i) => i + 97);
const lo = BigInt(`0x${Buffer.from(recipientBytes.subarray(0, 16)).toString('hex')}`);
const hi = BigInt(`0x${Buffer.from(recipientBytes.subarray(16)).toString('hex')}`);
const lifetime = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 123 };

test('general shield, transfer, withdrawal, and exit build valid-sized v1 messages', async () => {
  const cases = [
    [instruction(3, [0n, 10_000_000n, 55n, 5n, 6n, 7n], 295), 'shield'],
    [instruction(4, [0n, 2n, 3n, 4n, 5n, 6n, 0n, 0n, 0n, 1_000_000n, 7n, 8n], 589), 'transfer'],
    [instruction(6, [0n, 2n, 3n, 4n, 0n, 6n, 3_000_000n, lo, hi, 1_000_000n, 7n, 8n], 295), 'withdraw'],
    [instruction(8, [0n, 2n, 4n, 55n, 2_000_000n, lo, hi]), 'exit'],
  ];
  for (const [data, kind] of cases) {
    const built = await buildPoolTransaction({ programId, poolId, submitter, data, latestBlockhash: lifetime });
    assert.equal(built.action.kind, kind);
    assert.equal(built.wire[0], 0x81);
    assert.ok(built.wire.length <= 4096);
    assert.deepEqual(getTransactionDecoder().decode(built.wire).messageBytes,
      built.transaction.messageBytes);
    if (kind === 'withdraw' || kind === 'exit') assert.equal(built.action.recipient, recipient);
  }
});

test('rejects hidden fee changes, malformed output, and unsupported asset', () => {
  const transfer = instruction(4, [0n, 2n, 3n, 4n, 5n, 6n, 0n, 0n, 0n, 1_000_000n, 7n, 8n], 589);
  const alteredFee = transfer.slice(); alteredFee.set(be32(2_000_000n), 257 + 9 * 32);
  assert.throws(() => inspectPoolAction(alteredFee), /fee/);
  const alteredLength = transfer.slice(); alteredLength[1 + 256 + 12 * 32] ^= 1;
  assert.throws(() => inspectPoolAction(alteredLength), /length/);
  const alteredAsset = transfer.slice(); alteredAsset.set(be32(1n), 257);
  assert.throws(() => inspectPoolAction(alteredAsset), /SOL/);
});
