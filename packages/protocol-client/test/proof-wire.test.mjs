import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeVerifiedInstruction, proveAndEncode } from '../src/proof-wire.mjs';

const proof = { pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] };
const prepared = { circuit: 'shield', payload: new Uint8Array(295), input: {
  asset: 0n, amount: 10n, origin: 55n, commitment: 1n, payloadDigest: 2n, payloadTag: 3n,
} };
const signals = ['0', '10', '55', '1', '2', '3'];

test('wire encoder binds reviewed public signals and rejects verification failure', async () => {
  const data = encodeVerifiedInstruction(prepared, signals, proof);
  assert.equal(data[0], 3);
  assert.equal(data.length, 1 + 256 + 6 * 32 + 2 + 295);
  assert.throws(() => encodeVerifiedInstruction(prepared, [...signals.slice(0, 1), '11', ...signals.slice(2)], proof),
    /differ from reviewed action/);
  await assert.rejects(proveAndEncode(prepared, { fullProve: async () => ({ proof, publicSignals: signals }),
    verify: async () => false }, { wasm: new Uint8Array(), zkey: new Uint8Array(), verifyingKey: {} }),
  /verification failed/);
});

const generated = resolve(import.meta.dirname, '../../../spikes/v1-feasibility/candidate-circuits/generated');
test('wire encoding agrees with bounded shield research fixture when available', { skip: !existsSync(`${generated}/shield_node_result.json`) }, () => {
  const result = JSON.parse(readFileSync(`${generated}/shield_node_result.json`, 'utf8'));
  const fixture = new Uint8Array(readFileSync(`${generated}/shield_instruction.bin`));
  const payload = new Uint8Array(readFileSync(`${generated}/shield_payload.bin`));
  const input = { asset: BigInt(result.publicSignals[0]), amount: BigInt(result.publicSignals[1]),
    origin: BigInt(result.publicSignals[2]), commitment: BigInt(result.publicSignals[3]),
    payloadDigest: BigInt(result.publicSignals[4]), payloadTag: BigInt(result.publicSignals[5]) };
  const encoded = encodeVerifiedInstruction({ circuit: 'shield', input, payload }, result.publicSignals, result.proof);
  assert.deepEqual(encoded.subarray(1, 1 + fixture.length), fixture);
});

for (const name of ['transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']) {
  test(`${name} wire agrees with bounded research fixture when available`,
    { skip: !existsSync(`${generated}/${name}_node_result.json`) }, () => {
      const result = JSON.parse(readFileSync(`${generated}/${name}_node_result.json`, 'utf8'));
      const signals = result.publicSignals.map(BigInt);
      const fixture = new Uint8Array(readFileSync(`${generated}/${name}_instruction.bin`));
      let input, payload;
      if (name === 'public_exit') {
        const [asset, noteRoot, nullifier, origin, exitAmount, recipientLo, recipientHi] = signals;
        input = { asset, noteRoot, nullifier, origin, exitAmount, recipientLo, recipientHi };
      } else {
        const count = name.endsWith('two') ? 2 : 1;
        const [asset, noteRoot, approvedRoot] = signals;
        const [paymentCommitment, changeCommitment, payoutAmount, recipientLo, recipientHi,
          fee, payloadDigest, payloadTag] = signals.slice(3 + count);
        input = { asset, noteRoot, approvedRoot, nullifier: signals.slice(3, 3 + count),
          paymentCommitment, changeCommitment, payoutAmount, recipientLo, recipientHi,
          fee, payloadDigest, payloadTag };
        payload = new Uint8Array(readFileSync(`${generated}/${name}_payload.bin`));
      }
      const encoded = encodeVerifiedInstruction({ circuit: name, input, payload }, result.publicSignals, result.proof);
      assert.deepEqual(encoded.subarray(1, 1 + fixture.length), fixture);
    });
}
