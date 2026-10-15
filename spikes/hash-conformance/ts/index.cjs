// Spike 1 / TypeScript side — Poseidon over BN254 (x^5), Circom-compatible.
//
// Uses `poseidon-lite` (circomlib-compatible), NOT a Poseidon2 library.
// Run: node index.cjs

const { poseidon1, poseidon2, poseidon3, poseidon4 } = require("poseidon-lite");

const hex = (x) => "0x" + BigInt(x).toString(16).padStart(64, "0");

console.log("# Spike 1 — Poseidon(BN254, x^5) vectors — TS (poseidon-lite circom)");
console.log("small.1", hex(poseidon1([1n])));
console.log("small.2", hex(poseidon2([1n, 2n])));
console.log("small.3", hex(poseidon3([1n, 2n, 3n])));
console.log("small.4", hex(poseidon4([1n, 2n, 3n, 4n])));
console.log("large.2", hex(poseidon2([0xdeadbeefn, 0x123456789abcdef0n])));

let z = 0n;
console.log("zeros.0", hex(z));
for (let i = 1; i <= 5; i++) {
  z = poseidon2([z, z]);
  console.log(`zeros.${i}`, hex(z));
}
