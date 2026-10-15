# Spike — On-chain Groth16 verification CU (O7)

Measures the compute units a Sunspot-generated Groth16 verifier program consumes
when verifying a withdrawal-shaped circuit's proof on Solana. Resolves **O7** in
`docs/03-DECISIONS.md` and validates **ADR-003** (Groth16 via Sunspot).

**Result: 172,370 CU** for a 23,604-constraint circuit with a 324-byte proof.
See [`RESULTS.md`](RESULTS.md).

## Method

1. Compile the withdraw-shaped circuit and generate a Groth16 proof + verification
   key with Sunspot (`spikes/proving-feasibility/`).
2. Build the Sunspot verifier program with our VK baked in:
   `VK_PATH=<vk> cargo build-sbf` → `target/deploy/verifier_bin.so`.
3. Load the `.so` in **LiteSVM 0.17** and submit `proof || public_witness`; read
   `compute_units_consumed`.

## Toolchain (as measured)

| Tool | Version |
| --- | --- |
| nargo | 1.0.0-beta.22 |
| Sunspot | v1.0.0 |
| Solana CLI / `cargo-build-sbf` | 4.3.0 / 4.4.0 (platform-tools v1.57) |
| LiteSVM | 0.17.0 |

> **Pinning note:** the verifier crate's default dev-dependency (LiteSVM 0.6.1,
> Solana 2.2 runtime) **cannot load** a v1.57-built `.so`. Use LiteSVM 0.17 (Solana
> 4.x) and pin the exact `solana-*` crate versions from LiteSVM's tree.

## Reproduce

```bash
# 1. Proof + VK (from the proving-feasibility spike)
cd spikes/proving-feasibility/circuit && nargo execute
sunspot compile target/withdraw_feasibility.json
sunspot setup target/withdraw_feasibility.ccs
sunspot prove target/withdraw_feasibility.json target/withdraw_feasibility.gz \
  target/withdraw_feasibility.ccs target/withdraw_feasibility.pk

# 2. Build the verifier with our VK (clone reilabs/sunspot for verifier-bin)
cd <sunspot>/gnark-solana/crates/verifier-bin
cp <vk> withdraw_feasibility.vk
VK_PATH=withdraw_feasibility.vk cargo build-sbf

# 3. Measure
cp <sunspot>/target/deploy/verifier_bin.so .
cp <vk-dir>/withdraw_feasibility.{proof,pw} .
cargo run --quiet   # prints O7_CU_CONSUMED=…
```

The `Cargo.toml` / `src/main.rs` here are the harness used for the measurement.
