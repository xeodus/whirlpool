// Spike 1 / Noir side — Poseidon over BN254 (x^5), "consistent with Circom".
//
// Emits the same vectors as spikes/hash-conformance/rust.
// Run: nargo execute

use poseidon::poseidon::bn254::{hash_1, hash_2, hash_3, hash_4};

fn main() {
    // Arity 1..=4 over small inputs 1..n
    println(hash_1([1]));
    println(hash_2([1, 2]));
    println(hash_3([1, 2, 3]));
    println(hash_4([1, 2, 3, 4]));

    // Arity 2 over the same "large" pair
    println(hash_2([0xdeadbeef, 0x123456789abcdef0]));

    // Empty-subtree zeros: z0 = 0, z[i] = H(z[i-1], z[i-1])
    let mut z: Field = 0;
    println(z);
    for _ in 0..5 {
        z = hash_2([z, z]);
        println(z);
    }
}
