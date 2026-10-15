const FQ = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const be32 = value => {
  const number = BigInt(value);
  if (number < 0n || number >= 1n << 256n) throw new RangeError('Proof field outside 256-bit encoding');
  return Uint8Array.from(number.toString(16).padStart(64, '0').match(/../g), pair => parseInt(pair, 16));
};
const tags = { shield: 3, transfer_one: 4, transfer_two: 5,
  withdraw_one: 6, withdraw_two: 7, public_exit: 8 };

export function intendedPublicSignals(prepared) {
  const input = prepared?.input;
  if (!input || !Object.hasOwn(tags, prepared.circuit)) throw new Error('Unknown candidate proof action');
  if (prepared.circuit === 'shield') return [input.asset, input.amount, input.origin,
    input.commitment, input.payloadDigest, input.payloadTag];
  if (prepared.circuit === 'public_exit') return [input.asset, input.noteRoot, input.nullifier,
    input.origin, input.exitAmount, input.recipientLo, input.recipientHi];
  return [input.asset, input.noteRoot, input.approvedRoot, ...input.nullifier,
    input.paymentCommitment, input.changeCommitment, input.payoutAmount,
    input.recipientLo, input.recipientHi, input.fee, input.payloadDigest, input.payloadTag];
}

export function encodeVerifiedInstruction(prepared, publicSignals, proof) {
  const expected = intendedPublicSignals(prepared);
  if (!Array.isArray(publicSignals) || publicSignals.length !== expected.length ||
    publicSignals.some((signal, index) => BigInt(signal) !== BigInt(expected[index])))
    throw new Error('Proof public signals differ from reviewed action');
  if (!proof?.pi_a || !proof?.pi_b || !proof?.pi_c) throw new Error('Incomplete Groth16 proof');
  const fieldBytes = [
    be32(proof.pi_a[0]), be32((FQ - BigInt(proof.pi_a[1])) % FQ),
    be32(proof.pi_b[0][1]), be32(proof.pi_b[0][0]),
    be32(proof.pi_b[1][1]), be32(proof.pi_b[1][0]),
    be32(proof.pi_c[0]), be32(proof.pi_c[1]),
    ...publicSignals.map(be32),
  ];
  const payload = prepared.payload;
  if (prepared.circuit === 'public_exit' ? payload !== undefined :
      !(payload instanceof Uint8Array) || payload.length < 32 || payload.length > 1024)
    throw new Error('Invalid action payload');
  const total = 1 + fieldBytes.reduce((sum, bytes) => sum + bytes.length, 0) +
    (payload ? 2 + payload.length : 0);
  const data = new Uint8Array(total);
  data[0] = tags[prepared.circuit];
  let at = 1;
  for (const bytes of fieldBytes) { data.set(bytes, at); at += bytes.length; }
  if (payload) {
    data[at++] = payload.length & 255;
    data[at++] = payload.length >> 8;
    data.set(payload, at);
  }
  return data;
}

export async function proveAndEncode(prepared, groth16, { wasm, zkey, verifyingKey }) {
  if (!groth16?.fullProve || !groth16?.verify) throw new Error('Missing local Groth16 prover');
  const input = JSON.parse(JSON.stringify(prepared.input, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value));
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
  if (!await groth16.verify(verifyingKey, publicSignals, proof))
    throw new Error('Local proof verification failed');
  return encodeVerifiedInstruction(prepared, publicSignals, proof);
}
