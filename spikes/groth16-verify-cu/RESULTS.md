# O7 — On-chain Groth16 verification cost — Results

**Status: RESOLVED. ADR-003 (Groth16 via Sunspot) is validated.**
Measured 2026-10-06.

## Result

| Metric | Value |
| --- | --- |
| Circuit | withdraw-shaped (depth-20 Merkle + 2 hashes + bindings) |
| Constraints | 23,604 |
| Public inputs | 4 |
| Proof size | **324 bytes** |
| Public witness | 140 bytes |
| Verifier program | Sunspot v1.0.0 gnark Groth16 verifier, `.so` 81,872 bytes |
| Runtime | LiteSVM 0.17 (Solana 4.x SVM) |
| Compute budget | 1,400,000 CU |
| **Compute units consumed** | **172,370 CU** |
| Program log | `Proof verified successfully!` |

## Cost model (why it is ~172k)

The verifier's dominant costs are BN254 syscalls (per Solana `compute_budget.rs`):

| Step | Count | Unit CU | Subtotal |
| --- | --- | --- | --- |
| `prepare_inputs`: G1 mul | 4 | 3,840 | 15,360 |
| `prepare_inputs`: G1 add | 4 | 334 | 1,336 |
| `negate_g1`: G1 mul | 1 | 3,840 | 3,840 |
| Pairing (first pair) | 1 | 36,364 | 36,364 |
| Pairing (additional pairs) | 3 | 12,121 | 36,363 |
| **Syscall subtotal** | | | **~93,263** |
| Program / deserialization / ELF overhead | | | **~79,000** |

## Implications

- **Headroom is large.** One verification is 172k CU against a 1.4M ceiling. A full
  transfer (verify + ~25k CU of tree hashing + nullifier + overhead) lands around
  **~200–220k CU** — comfortably inside budget, with room for multi-action bundles.
- **`sol_poseidon` is not the bottleneck** (`61n² + 542` CU per hash); verification
  dominates, exactly as predicted.
- **Sunspot's own 170k–500k claim is confirmed** at the low end for a lean circuit.

## Caveats

- Measured in **LiteSVM**, not a live validator; the pool program adds CPI invoke
  overhead (~1k CU).
- A circuit with more public inputs or Pedersen commitments costs more (each input
  adds a G1 mul + add; commitments add a batch Pedersen check).
- **Sunspot is unaudited**; the trusted setup used here was a single-party local
  setup. Production requires the gnark trusted-setup tool + a public ceremony.

## Toolchain finding (worth recording)

Building a verifier with `cargo-build-sbf` 4.4 / platform-tools **v1.57** (SBPFv3)
produces a `.so` that the **older LiteSVM 0.6.1 (Solana 2.2 runtime) rejects**
(`InvalidAccountData`). Platform-tools v1.43 supports the old runtime but ships
rustc 1.79, too old for `solana-program` 3.0. **Resolution:** measure with the
current **LiteSVM 0.17** against the v1.57 build. Pin the toolchain/runtime pairing
in CI.

## Reproduce

See `README.md`. Core steps: build the verifier with our VK
(`VK_PATH=… cargo build-sbf`), then run the LiteSVM harness against
`proof || public_witness`.
