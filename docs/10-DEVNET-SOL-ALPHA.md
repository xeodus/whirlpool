# 10 — Invited Devnet SOL alpha

**Status: implementation target, not release clearance.** This milestone exercises the complete customer journey with test SOL. The [feasibility slice](../spikes/v1-feasibility/RESULTS.md) supports a single fixed journey only; its closed program, public setup entropy, fixed origin and amounts, and research phrases are not an alpha deployment.

## Journey and boundaries

An invited tester creates a separate privacy phrase, connects a v1-capable Devnet wallet, shields a chosen test-SOL amount, sees the note pending, and can publicly exit if the ASP never approves it. After a manual ASP approval, the tester can privately transfer to another test privacy address or privately withdraw to a chosen public Solana address. The recipient can restore from the phrase and finalized public history on a fresh device. A current holder can publicly exit an approved, pending, or revoked note during a private-activity pause; the exit reveals its deposit origin.

The first signer path is Jupiter in Brave. Firefox and Safari must prove and recover; broader wallet/browser signing remains a V1 gate. Public pages may deploy before transactions are enabled, but transaction access is limited to invited testers. An invite limits the operated relayer and application; it is **not** an on-chain access control. No real assets or production privacy assurances are permitted.

## Implementation contracts

- Use a new test-only SOL pool and fresh test proving keys. Do not deploy or link the closed research program or fixed-key artifacts. Review Circom/snarkjs dependency licences before distributing proving code and artifacts.
- [`snarkjs@0.7.6`](https://github.com/iden3/snarkjs/blob/master/package.json) declares GPL-3.0 and [`circomlib@2.0.5`](https://github.com/iden3/circomlib/blob/master/package.json) declares LGPL-3.0 in their published package metadata. **User decision, 2026-10-15:** keep signing gated pending licence review. No public browser prover bundle or inferred distribution clearance is approved.
- Each deposit gets a unique program-assigned origin. The initial commitment binds the deposited amount and origin. A private action consumes only notes from one hidden origin, preserves it in payment and change, and checks the *current* approval state at execution.
- ASP approval and revocation must publish authenticated, ordered leaf changes sufficient to reconstruct witnesses from finalized public history. Arbitrary opaque root replacement is insufficient. The operator indexer may accelerate reading but is never the sole source of recovery data.
- Encrypt every output for recipient discovery and sender recovery. A client must decrypt and verify a recovered note against its public commitment before showing it as spendable. The current candidate circuit does not prove ciphertext/plaintext consistency; record and test this as an alpha limitation, and resolve it before Mainnet.
- Private transfer and withdrawal use a reference relayer as fee payer, with a visible 0.001 test-SOL note fee. Measure nullifier rent and network fees; cap sponsorship where the fee does not cover them. The user can submit a public exit without that relayer, paying its own test-SOL network fee and marker rent.
- A submitted transaction has a persistent intent ID and signature readback. An ambiguous send is reconciled against finalized history before any retry. Rebuild expired note-root witnesses and proofs; never submit a stale proof silently.
- Keep proof generation and spending secrets on the device. RPC credentials, ASP keys, and relayer keys stay server-side or with operators. No phrase, witness, decrypted note, or signing key enters app telemetry.

## Release gates

1. A local validator proves multi-user, multi-origin shielding, approval, transfer, withdrawal, recovery, revocation, pause, nullifier replay resistance, exact payout/fee binding, and current-holder exit. Compare one- and two-input full flows under decision P12 before fixing V1 input count.
2. Independent finalized-history backfill reconstructs notes and approval witnesses with the reference ASP, indexer, and relayer offline. Confirm the chosen RPC provider's archival retention and fail closed on gaps or state mismatch.
3. Resolve Jupiter's misleading “Simulation failed” shield warning or verify another signer that presents the exact transaction accurately. Invited tester signing remains disabled until then.
4. Verify transaction simulations, signature/readback, relayer idempotency, low-balance and outage behavior, pool accounting, browser proof downloads and latency, CSP, dependency/licence position, and a secret-free deployment.

Passing these gates permits **invited Devnet test-SOL use only**. Testnet is a later compatibility and operations rehearsal; Mainnet Beta needs the separate assurance, governance, USDC, and legal gates in [the roadmap](06-ROADMAP.md).

## Implementation checkpoint — 2026-10-15

**Verified locally:** a two-origin one-input SOL journey proves against the candidate verifier and passes a LiteSVM pool accounting run; package tests cover independent history replay, two-input transaction encoding, ordered ASP leaf transitions, recovery, and relayer duplicate-intent behavior. The root Vite preview builds with transaction access disabled. These are local tests, not a deployed alpha.

**Still open:** licence review and a distributable browser prover; fresh non-public test setup; transaction UX and honest wallet prompts; live Redis and Vercel route checks; a new Devnet deployment; hosted ASP operations and archival backfill; two-input full-journey comparison and supported-browser acceptance. Do not turn on `WHIRLPOOL_RELAYER_ENABLED` or invite signing until these checks pass.
