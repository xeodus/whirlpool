// Spike 1 / Rust side — Poseidon over BN254 (x^5), Circom-compatible.
//
// `light-poseidon`'s `new_circom` is the reference used by Solana's
// `sol_poseidon` syscall (Bn254X5). We emit vectors that the Noir and TypeScript
// harnesses must reproduce exactly.
//
// Run: cargo run --quiet

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonHasher};

fn hex(f: &Fr) -> String {
    let bytes = f.into_bigint().to_bytes_be();
    format!("0x{}", bytes.iter().map(|b| format!("{b:02x}")).collect::<String>())
}

fn hash(inputs: &[Fr]) -> Fr {
    let mut p = Poseidon::<Fr>::new_circom(inputs.len()).expect("new_circom");
    p.hash(inputs).expect("hash")
}

fn main() {
    println!("# Spike 1 — Poseidon(BN254, x^5) vectors — RUST (light-poseidon circom)");

    // Arity 1..=4 over small inputs 1..n
    for n in 1..=4usize {
        let inputs: Vec<Fr> = (1..=n).map(|i| Fr::from(i as u64)).collect();
        println!("small.{n} {}", hex(&hash(&inputs)));
    }

    // Arity 2 over a fixed "large" pair (still < field modulus)
    let big_a = Fr::from(0xdead_beefu64);
    let big_b = Fr::from(0x1234_5678_9abc_def0u64);
    println!("large.2 {}", hex(&hash(&[big_a, big_b])));

    // Empty-subtree zeros: z0 = 0, z[i] = H(z[i-1], z[i-1])
    let mut z = Fr::from(0u64);
    println!("zeros.0 {}", hex(&z));
    for i in 1..=5u32 {
        z = hash(&[z, z]);
        println!("zeros.{i} {}", hex(&z));
    }
}
