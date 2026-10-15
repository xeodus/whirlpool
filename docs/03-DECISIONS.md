# 03 — Decision register

**Status:** replaces the previous “frozen” register. **Settled** records user decisions. **Direction** is an engineering recommendation subject to feasibility. **Open** must not be represented as an approved design. A technical spike supports only what it measured.

## Settled product and trust decisions

| ID | Decision | Boundary and tradeoff |
| --- | --- | --- |
| P1 | Serve individuals first. | Business and institutional workflows are later. |
| P2 | V1 includes SOL and USDC shield, private transfer, private withdrawal, and public exit. | Swaps are later. USDC has issuer freeze risk. |
| P3 | A V1 transfer spends from one screened deposit lineage; payment and change can split it. | No cross-origin merge in V1. A later ASP revocation must stop descendants from private spending. |
| P4 | Screening claims cover deposit origins, not private-recipient identity. | Do not claim “zero sanctioned exits” from provenance screening alone. |
| P5 | Use a separate privacy recovery phrase. | The user must back it up; ordinary wallet recovery is insufficient. |
| P6 | Spending secrets stay on the device. | No hosted witness or spending-key prover for production V1. |
| P7 | Browser app first, with Chrome, Firefox, and Safari on mainstream 8 GB desktops. | Mobile proof generation is deferred. Hosted web delivery remains a trusted update path. |
| P8 | Warm proofs for transfer, withdrawal, and public exit: at least 95% under 30 seconds on supported desktops. | First-use setup is separate; if the secure full circuit misses the gate, delay production. |
| P9 | The current holder of a transferred note must be able to use public exit. | Requires a secure ownership proof; original-depositor-only exit would strand recipients. Legal review remains a launch gate. |
| P10 | Public exit reveals the note's originating deposit. | The link can weaken privacy for other descendants of that deposit; disclosure is not legal clearance. Do not publish reusable spending or nullifier secrets. |
| P11 | A confirmed shield enters a pending state until ASP approval; it is not privately spendable while pending. | A denied note needs the independent public-exit path. Show this risk before deposit. |
| P12 | Compare one-input and same-origin multi-input actions using representative full circuits before fixing V1 input count. | Include multi-input only if the secure complete flow meets the browser performance gate; the input limit remains open until measured. |
| G1 | On-chain enforced 48-hour program-upgrade timelock, without an immediate upgrade bypass. | Upgrades remain powerful; urgent fixes wait. Do not call the program immutable. |
| G2 | Emergency authority may pause new deposits, private transfers, and private withdrawals, while a separate public exit stays callable. | A guardian can suspend privacy; a bug shared with public exit may remain uncontainable. |
| G3 | Keep V1 capped and monitored. | The exact cap and multisig quorum are open; five independent signers are **not** assumed. |

## Engineering direction, not frozen protocol

- The first implementation milestone is an [invited Devnet SOL alpha](10-DEVNET-SOL-ALPHA.md) with the full shield → approval → private transfer/withdrawal → recovery/public-exit journey. The informational site may deploy first, but signing stays gated until its wallet and recovery checks pass. This does not change V1's SOL-and-USDC scope or settle its proof stack.

- Retain an on-chain-authenticated commitment root and unique nullifiers. Start with a pool program and the verifier component required by the selected proof system; avoid an extra nullifier program or swap program in V1.
- Treat the indexer as a replaceable cache, but make note ciphertexts, commitments, and ordering recoverable from durable public data. RPC logs alone are not an adequate recovery guarantee.
- Compare browser proving routes against a **representative full circuit**, then select the circuit language, prover, verifier, setup, and licence posture. Current Sunspot and Poseidon spikes do not select this stack.
- Treat input-note count, exact denominations, note format, address construction, scanning, root validity, relayer fees, and ASP update policy as specification work.

## Open launch and design gates

| ID | Open item | Required resolution |
| --- | --- | --- |
| L1 | Launch countries; founder, entity, ASP, relayer, and frontend locations; legal classification and counsel review. | **Intentionally left open by the user.** No jurisdiction or entity structure is presumed. |
| L2 | Whether origin-only screening and public exit meet requirements of chosen markets. | Country-specific legal advice before production. |
| C1 | Privacy-preserving lineage proof, live revocation, public-exit ownership proof, and cross-language crypto encoding. | Formal specification, adversarial tests, independent review. |
| C2 | Browser proof route and complete transaction performance. | Benchmark full flows on supported devices and browsers. |
| C3 | Final input count for same-origin private actions. | Measure one-input and multi-input complete flows, including payment usability and browser performance, under P12. |
| O1 | Independent upgrade signers, quorum, guardian selection, exact TVL cap, and incident process. | Operational design and exercises before deposits. |
| O2 | Durable history and recovery without the operator indexer. | Backfill and independent-recovery demonstration. |

Do not revive superseded decisions from the old register, particularly V1 swaps, hosted proving, deposits-only pause, a fixed jurisdiction, or burning upgrade authority at first mainnet deployment.
