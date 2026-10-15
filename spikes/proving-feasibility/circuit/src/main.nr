// Spike 2 — a withdrawal-shaped circuit to measure proving feasibility.
//
// Approximates `docs/architecture/03-circuits.md`: a leaf hash, a depth-20 Merkle
// membership path, and a nullifier hash. Public inputs are bound with dummy
// constraints so they participate in the R1CS (the legacy replay bug fix).

use poseidon::poseidon::bn254::{hash_2, hash_3};

global DEPTH: u32 = 20;

fn main(
    deposit_root: pub Field,
    nullifier_hash: pub Field,
    recipient: pub Field,
    fee: pub Field,
    nullifier: Field,
    secret: Field,
    path: [Field; DEPTH],
    dir: [bool; DEPTH],
) {
    // commitment = H(nullifier, secret, recipient)  (arity-3 approximation)
    let commitment = hash_3([nullifier, secret, recipient]);

    // Merkle membership
    let mut cur = commitment;
    for i in 0..DEPTH {
        cur = if dir[i] { hash_2([path[i], cur]) } else { hash_2([cur, path[i]]) };
    }
    assert(cur == deposit_root, "bad Merkle path");

    // nullifier_hash = H(nullifier, recipient)       (arity-2 approximation)
    assert(hash_2([nullifier, recipient]) == nullifier_hash, "bad nullifier");

    // Bind public inputs so they are part of the statement (malleability fix).
    let _fee_sq = fee * fee;
    let _recip_sq = recipient * recipient;
}
