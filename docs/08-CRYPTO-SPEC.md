# 08 — Cryptographic design gates

**Status: research draft, not a cryptographic specification or frozen circuit ABI.** No production ceremony, proving key, verifier, address format, or recovery algorithm is approved. Independent review and complete cross-language vectors precede any freeze.

## What the spikes establish

`spikes/hash-conformance/` found matching Poseidon outputs for its tested arities and empty-tree vectors across Noir, Rust, Solana's host path, and TypeScript. It did **not** test the full domain-separated note, origin, or public-input scheme. `spikes/proving-feasibility/` produced a Sunspot proof for a depth-20, four-public-input sample. `spikes/groth16-verify-cu/` measured **172,370 CU** for that sample verifier in LiteSVM. Neither result predicts full V1 browser proving or transaction cost. [Sunspot warns that it is unaudited and that its ordinary setup is unsafe](https://github.com/reilabs/sunspot).

## Required relationships

A reviewed V1 scheme must prove all of these together:

1. A private spend authorizes its input note(s) from one origin without revealing their owners or originating deposit; the V1 input-count limit remains open.
2. A unique nullifier corresponds to each input note and is atomically recorded once.
3. Total input value equals output value plus explicit public payout and fee for the same asset, with bounded integer arithmetic and no field-wrap inflation.
4. Every payment and change note inherits the same hidden deposit origin. A proof of membership in the **live approved-origin set** fails after that origin is revoked.
5. Public exit proves ownership and value, exposes the origin and recipient, and does **not** expose a reusable spending or nullifier key.
6. Every public input and output commitment is bound to the exact on-chain action, asset, root, destination, and fee. The receiver can verify decrypted note data against its commitment.

## Keys, addresses, and recovery

The separate privacy phrase is the recovery root. The design must specify deterministic spending, viewing, encryption, and outgoing-disclosure capabilities with domain separation and versioned derivation. Restore must recover owned outputs and spent status from durable public data. A claimed “full viewing key” must state whether it can detect spends; excluding the nullifier key prevents that in the old draft.

The old address `(diversifier, encryption_public_key)` is incomplete: the sender also needs the public owner commitment component to construct a recipient note. The revised address must supply sufficient information, and receivers must reject notes whose commitment is inconsistent with their keys. The old tag proposal requires one X25519 operation per owned address **per output**; a 2^20-address scan window is not an acceptable unmeasured recovery plan. Select a bounded, measured discovery method before promising browser recovery.

## Candidate primitives, not selections

BN254 Groth16, circom-compatible Poseidon, X25519, XChaCha20-Poly1305, and bech32m remain candidates because they have relevant prior art or narrow spike evidence. The browser prover may require a different circuit language or setup pipeline. Browser [snarkjs](https://github.com/iden3/snarkjs) supports Groth16 with Circom artifacts; that does not establish compatibility with Sunspot/Noir proofs. Compare realistic full-circuit proving time, memory, artifact download, proof bytes, on-chain verification, setup and audit history, and licence obligations before choosing.

## Required vectors and review

Freeze domain tags and byte order once, then test byte-identical note commitments, origin inheritance, nullifiers, Merkle roots, public-input encoding, address derivation, ECDH, ciphertexts, and recovery across the actual client/circuit/program languages. Include adversarial vectors for wrong origin, revoked origin, malformed address, changed recipient/fee, value overflow, reused nullifier, and public-exit key leakage. Audit the final circuit and verifier; run a public multi-party setup if the chosen proof system requires it.
