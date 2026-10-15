# Spike 1 — Results (hash conformance)

**Status: PASS — ADR-004 confirmed.**
Ran 2026-10-04. Reproduce with `./verify.sh` (needs Rust, nargo, node).

## What was tested

Poseidon over BN254 (`x⁵`), circom-compatible, arities 1–4 plus the empty-subtree
zeros `z[i] = H(z[i-1], z[i-1])`, across:

| Implementation | Version |
| --- | --- |
| **Noir** `noir-lang/poseidon` (`poseidon::poseidon::bn254::hash_N`, "consistent with Circom") | crate `v0.1.1` |
| **Rust** `light-poseidon` (`new_circom`) | 0.4.0 |
| **Solana** `solana-poseidon` (`sol_poseidon` path, `Bn254X5`, BigEndian) | 5.0.0 |
| **TypeScript** `poseidon-lite` | latest |

## Result

```
rust    PASS
solana  PASS
noir    PASS
ts      PASS
RESULT: ALL PASS
```

All four produce byte-identical outputs for every vector in `vectors.json`.

## Key finding

`solana-poseidon` 5.0.0 **delegates to `light-poseidon`** on non-BPF targets, and
`light-poseidon::new_circom` matches the Noir crate's circom-compatible Poseidon
exactly. So the on-chain `sol_poseidon` syscall, the circuit, and the client all
agree.

## Implication

- **ADR-004 is confirmed:** standardize on **Poseidon (not Poseidon2)**; this enables
  the trustless on-chain incremental tree (ADR-005) via the `sol_poseidon` syscall.
- Freeze `vectors.json` as a CI conformance gate (`docs/architecture/07-testing-ci.md`).
- Do **not** use Poseidon2 for leaves/nodes unless a matching syscall is adopted.
