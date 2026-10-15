# Spike 1 — Hash conformance (ADR-004)

**Question.** Do the four implementations produce identical Poseidon over BN254
(`x⁵`) outputs, for arities 1–4?

| Implementation | Role |
| --- | --- |
| **Noir** (`noir-lang/poseidon`) | the circuit's view |
| **Solana `sol_poseidon`** (`Bn254X5`) | the on-chain syscall |
| **Rust `light-poseidon`** | reference used by the syscall |
| **TypeScript** (a standard Poseidon lib) | the client's view |

The Noir harness pins `noir-lang/poseidon` at `v0.4.0` in `noir/Nargo.toml`.
Nargo fetches that dependency on a fresh clone; a local `noir-poseidon/`
checkout is ignored and is not part of this repository.

If they agree, ADR-004 stands and the on-chain tree (ADR-005) is viable. If not, we
fall back to the off-chain tree + root oracle.

## Method

1. Fix a deterministic input set: for arity `n ∈ {1,2,3,4}`, inputs
   `x_i = i + 1` (small integers) and a second set of large field elements.
2. Produce a vector from each implementation.
3. Assert exact equality across all four.
4. Also assert `H(0,0) == zeros[1]`, `H(zeros[1],zeros[1]) == zeros[2]`, etc., so
   the empty-subtree zeros in `spec/` are proven correct.

## Harnesses

```
hash-conformance/
├── rust/          light-poseidon vectors + (optional) LiteSVM sol_poseidon call
├── noir/          nargo test producing the same vectors
├── ts/            TypeScript vectors
├── vectors.json   canonical inputs + expected outputs (generated, then frozen)
└── run.sh         runs all three and diffs
```

`vectors.json` is the contract: once generated from one implementation, every other
must reproduce it exactly.

## Status

- [ ] Rust vectors
- [ ] Noir vectors
- [ ] TypeScript vectors
- [ ] Solana syscall vectors (LiteSVM)
- [ ] All agree
