# Spike 2 — Results (proving feasibility)

**Status: decisive. Groth16-on-Solana works; client-side Groth16 does not exist today.**
Ran 2026-10-04. Sunspot v1.0.0 · nargo 1.0.0-beta.22 · barretenberg 5.0.0-nightly.20260522.

## Circuit

A withdraw-shaped circuit: `hash_3` leaf + depth-20 Merkle membership + `hash_2`
nullifier + public-input binding (`src/main.nr`). **23,604 constraints.**

## Sunspot (Groth16 → Solana)

| Step | Time | Artifact | Size |
| --- | --- | --- | --- |
| `sunspot compile` | 0.19 s | CCS | 1.6 MB |
| `sunspot setup` (unsafe single-party) | 2.26 s | proving key | 11.1 MB |
| | | verifying key | 908 B |
| `sunspot prove` | 0.72 s wall (gnark 165 ms) | **Groth16 proof** | **324 B** |
| | | public witness | 140 B |
| `sunspot verify` (native) | 0.96 ms | — | **✅ successful** |

Tiny proof, fast proving, cheap verification — the ADR-003 profile.

## barretenberg (the only mature client-side/WASM prover)

- Scheme: **`ultra_honk`**. Proof size: **14,656 B** (~45× Groth16).
- Verifier targets: `evm`, `noir-recursive`, `noir-rollup`, `starknet`.
  **No Solana target; no Groth16 option.**

## Key finding

Groth16 for Solana (Sunspot) uses a **Go/gnark prover** — a CLI/server library, not
a browser/WASM module. barretenberg, which *is* client-side-capable, cannot produce
a Solana-verifiable proof. Therefore today you **cannot have both** cheap Groth16
on Solana and client-side proving.

## Implication for ADR-016

Adopt option **(a): a blind delegated prover** for v1, with strict isolation
(ephemeral witness, no logging, no linkage, per-request isolation, open source).
Track these as pre-mainnet work, in priority order:

- **(b) Custom WASM gnark prover** — keeps Groth16 + client-side; build effort.
- **(c) Client-side bb + a custom Solana UltraHonk verifier** — proof 45× larger;
  CU cost unknown and likely high; needs research.
- **(d) Recursion** — client-side bb → wrap into Groth16 for on-chain verify.

## Not yet measured (follow-ups)

- On-chain verification CU. Requires the Solana toolchain + `sunspot deploy` +
  Mollusk. Record as the next measurement before committing to ADR-003.
- Sunspot is **unaudited** (upstream warning) and `setup` here was an unsafe
  single-party setup; production needs the gnark trusted-setup tool + ceremony.
