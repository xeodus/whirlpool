# 06 — V1 roadmap and release gates

**Status: sequencing proposal, not a schedule.** The first few thousand users are the scale target. Time estimates, geography, budget, and launch date are not established. Do not treat the previous “design frozen before code” rule as a bar to small feasibility prototypes; evidence is needed to finish the design.

## 0. Resolve feasibility before locking the protocol

- Specify a pending-approval shield → one-origin transfer → private withdraw path and a current-holder public exit that reveals origin, including live revocation, value conservation, and the deposit's initial origin binding. Compare one-input and same-origin two-input actions before fixing the V1 input limit.
- Prototype complete circuit candidates and browser proving. Benchmark **warm** transfer, withdrawal, and public-exit proofs on mainstream 8 GB desktops in Chrome, Firefox, and Safari. Gate: at least 95% of each proof type under 30 seconds; report first-use download/setup separately. If a secure route misses this gate, delay production.
- Prototype note address construction, encrypted-output discovery, spent-status recovery, and independent history backfill. Reject the old 2^20-address × outputs scan assumption unless measured and redesigned.
- Measure full Solana transaction bytes, compute, and wallet/RPC support; do not extrapolate from the 172,370-CU sample verifier.

**Gate:** a reviewed protocol direction and realistic client/chain measurements, with unresolved cryptographic choices recorded rather than declared frozen.

## 1. Build and operate the invited Devnet SOL alpha

The first deployed application must complete the live test-SOL journey, not only display a polished shell. [The Devnet alpha contract](10-DEVNET-SOL-ALPHA.md) records the implementation order, test-only boundaries, and invitation gates. Deploy read-only pages early for design feedback; enable signing only after the wallet, recovery, and operational gates pass.

- Implement the per-asset pool, authenticated roots, nullifiers, ASP state, private-activity pause, public exit, and chosen verifier. Defer swaps, cross-origin merges, multi-ASP governance, extra registry programs, and compression.
- Build local proof generation and phrase-backed wallet UX for shield, approval wait, transfer with change, withdrawal, public exit, and recovery.
- Test onboarding, fee comprehension, privacy disclosures, and fresh-device recovery with representative individual users; revise confusing flows before production.
- Operate a reference ASP, relayer, and checkpointed indexer; ensure ciphertext/history availability and self-submitted public exit without those services.
- Add cross-language vectors and property, adversarial, local validator, and end-to-end tests for conservation, replay, revocation, public-input binding, and failed service paths.

**Gate:** invited testers can complete SOL shielding, approval, private transfer, private withdrawal, fresh-device recovery, and current-holder public exit on Devnet. A misleading wallet signing prompt or unrecoverable history keeps signing disabled.

## 2. Testnet rehearsal, independent assurance, and production preparation

After the Devnet alpha stabilizes, rehearse cluster compatibility and operations on Testnet. Solana uses Testnet primarily to stress network upgrades, so Devnet remains the main product-feedback environment. Testnet success is not a substitute for Mainnet asset, security, or legal review.

- Freeze the reviewed circuit ABI and run a safe public setup if required by the chosen proof system. Audit circuits, verifier, program, and client; resolve findings and verify deployed builds.
- Test 48-hour on-chain timelock, guardian pause of new deposits and private spends, public exit during pause, malicious governance proposals, backup signer processes, indexer loss, relayer outage, and USDC freeze behavior.
- Select independent upgrade signers and quorum, initial TVL cap, monitoring thresholds, incident owner, and customer support process. Measure effective anonymity; do not claim privacy from raw user counts.
- Obtain written legal advice for actual users, operators, locations, origin-only policy, and public exits. **No country or entity assumption is carried forward.**

**Gate:** security, recovery, performance, governance, and legal criteria all pass. If any fails, remain on test networks.

## 3. Capped production release

Launch to a small cohort under the approved cap, with clear risk and privacy disclosures, staged access, observable service health, independent exit path, and incident drills. Expand capacity only after actual use, loss-free reconciliation, restore exercises, and user feedback justify it. Private swaps and mobile proving get separate later decisions and assurance work.
