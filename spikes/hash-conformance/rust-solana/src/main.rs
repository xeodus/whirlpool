// Spike 1 / Solana side — the `sol_poseidon` code path (`solana-poseidon` crate).
//
// On non-BPF targets this crate delegates to `light-poseidon`, which is exactly
// what the on-chain syscall uses. We recompute our vectors through this API to
// close the loop.
//
// Run: cargo run --quiet

use solana_poseidon::{hashv, Endianness, Parameters};

fn be32(x: u64) -> [u8; 32] {
    let mut a = [0u8; 32];
    a[24..].copy_from_slice(&x.to_be_bytes());
    a
}

fn hex(bytes: &[u8; 32]) -> String {
    format!(
        "0x{}",
        bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
    )
}

fn hash2(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    hashv(
        Parameters::Bn254X5,
        Endianness::BigEndian,
        &[a.as_slice(), b.as_slice()],
    )
    .unwrap()
    .to_bytes()
}

fn h(inputs: &[&[u8; 32]]) -> String {
    let refs: Vec<&[u8]> = inputs.iter().map(|x| x.as_slice()).collect();
    hex(&hashv(Parameters::Bn254X5, Endianness::BigEndian, &refs).unwrap().to_bytes())
}

fn main() {
    println!("# Spike 1 — Poseidon(BN254, x^5) vectors — SOLANA sol_poseidon path");

    for n in 1..=4u64 {
        let inputs: Vec<[u8; 32]> = (1..=n).map(be32).collect();
        let refs: Vec<&[u8; 32]> = inputs.iter().collect();
        println!("small.{n} {}", h(&refs));
    }

    let a = be32(0xdeadbeef);
    let b = be32(0x123456789abcdef0);
    println!("large.2 {}", h(&[&a, &b]));

    let mut z = [0u8; 32];
    println!("zeros.0 {}", hex(&z));
    for i in 1..=5 {
        z = hash2(&z, &z);
        println!("zeros.{i} {}", hex(&z));
    }
}
