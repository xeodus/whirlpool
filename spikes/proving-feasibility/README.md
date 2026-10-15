# Spike 2 — Proving feasibility (ADR-016)

**Question.** Can we have *both* cheap on-chain verification (Groth16) *and*
client-side proving (no server sees secrets)?

ADR-003 wants Groth16/BN254 (cheapest Solana verify). ADR-010 wants client-side
proving. Sunspot's prover is a gnark (Go) CLI; there is no obvious browser/WASM
Groth16 prover for its verifying key. This spike determines the honest answer.

## What to test

1. **Baseline compile + prove with Noir tooling.** Build the smallest useful circuit
   (one Poseidon hash), compile with `nargo`, prove with the default backend
   (barretenberg), record proof size + time.
2. **Sunspot path.** `sunspot compile` / `setup` / `prove` the same circuit; record
   proof size, verifier program size, and estimated CU.
3. **Client-side attempt.** Try proving in JS/WASM (`bb.js`) and compare the artifact
   to what a Solana verifier can consume. If `bb.js` Groth16 ≡ Sunspot Groth16 under
   the same keys, we win; if not, quantify the gap.
4. **Fallback (§4 of ADR-016).** If client-side is not viable now, specify the blind
   delegated prover: ephemeral witness, no logging, no linkage, per-request isolation,
   open source — and mark it as a temporary trust assumption in the threat model.

## Deliverable

A one-page result memo appended here: which combination is feasible, at what cost,
and the resulting decision update to ADR-016.

## Status

- [ ] Circuit compiles
- [ ] Default backend prove (size/time)
- [ ] Sunspot prove + verifier size
- [ ] Client-side WASM attempt
- [ ] Decision memo
