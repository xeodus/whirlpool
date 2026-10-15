# 09 — V1 protocol decision note

**Status: product choices recorded; technical specification and launch gates remain open.** The product owner answered the four questions below. This is not a frozen circuit ABI or an approved legal operating model. The [decision register](03-DECISIONS.md) is authoritative.

## Fixed boundaries

V1 serves individuals shielding SOL or USDC, transferring privately, withdrawing privately, or exiting publicly. Private spending preserves one hidden screened deposit origin through payment and change; later ASP revocation stops descendants from **private** spending. Spending secrets remain on-device. The guardian can pause new deposits and private actions, but public exit must remain callable. Upgrades wait 48 hours on-chain. The full browser proof must meet the recorded performance gate. Launch countries and legal approval are intentionally open.

## Product-owner answers and remaining gates

| Question | Selected behavior | Remaining gate and tradeoff |
| --- | --- | --- |
| Who may publicly exit after private transfer? | **The current note holder.** | Prove transferable-note ownership without leaking a reusable secret; obtain legal review. [0xbow's ragequit](https://docs.privacypools.com/protocol/ragequit) serves only the original depositor and does not establish this design. |
| Must public exit reveal its originating deposit? | **Yes.** | The link may weaken privacy for other descendants; payout address and amount are also public. Test disclosures and seek legal review; public provenance alone does not establish compliance. |
| When does a shield become privately spendable? | **Deposit, then pending ASP approval.** | Warn before the final deposit; a denied note needs independent public exit and may incur fees. A precheck, if later added, cannot guarantee final approval. |
| How many input notes may one private action consume? | **Measure one-input and same-origin multi-input full circuits first.** | Include multi-input only if the secure complete flow meets the browser gate. The final V1 input limit remains open; one-input-only can strand fragmented balances for larger payments. |

## Technical choices to prove before an ABI freeze

1. **Initial binding.** A public deposit's exact received asset and amount, a unique origin identifier, and its first private note must be cryptographically linked. A caller-chosen commitment without this relation can create unbacked notes. Specify the origin identifier and the proof or reviewed equivalent.
2. **Transfer statement.** Every consumed note must be owned, unspent, and in an authenticated commitment tree. Every output must bind its recipient, amount, randomness, and the **same hidden origin**. Prove bounded integer value conservation, including the chosen fee. Decide input count, maximum outputs, zero-value behavior, and dust policy with browser measurements.
3. **Approval timing.** A private spend must check the approval state current at on-chain execution; a historical commitment root may be acceptable, but an old **approval** root must not bypass revocation. Specify ASP update authority, state commitments, transaction ordering, finality, and maximum update delay. A spend ordered before a revocation update cannot be retroactively invalidated.
4. **Public exit statement.** Prove current-note ownership, membership, value, origin disclosure, and a fresh nullifier without publishing a reusable spending or nullifier key. The current holder can exit after transfer. Decide full-note versus partial exit, recipient binding, and fee payment. The intended independent path must work for approved, pending, and revoked notes, including during a private-activity pause; otherwise ASP inaction or a pause can strand funds. This is a new design, not functionality inherited from 0xbow, and its legal limits need review.
5. **Fees and delivery.** Define who pays network fees for shield, transfer, withdrawal, and public exit; how a relayer is compensated; maximum fee authorization; retries; and a funded self-submission path for public exit. A user-funded SOL fee payer can link a private action to a public wallet. A relayer-funded action avoids that direct link, but needs a bounded fee paid from the note, sponsorship, or another sustainable payment path; USDC fees still require someone to advance SOL. A relayer must not redirect a payout or change the user's authorized fee. Independent exit means anyone can submit the proof, but a user may still need SOL or another willing fee payer.
6. **Recovery.** Define note encryption, address data, viewing/spending derivation, spent-status detection, and a bounded discovery algorithm. Publish enough durable ciphertext and ordering data for recovery without the reference indexer; logs alone are insufficient because [Solana notes they may be truncated](https://solana.com/docs/programs/anchor-events). Specify the oldest recoverable history and test it with an independent reader.

## Acceptance scenarios for the feasibility slice

- A valid shield creates exactly one backed initial note. Wrong asset, wrong received amount, reused origin identifier, malformed recipient data, and a forged initial commitment fail.
- A private transfer from an approved origin conserves value and binds payment, change, recipient, and fee. Changing any bound field, reusing a nullifier, or mixing origins fails. Test any proposed multi-input path separately.
- After an on-chain revocation update, descendants created before that update cannot transfer or withdraw privately, even with a stale approval witness. A spend ordered before the update follows the documented ordering rule.
- The current holder can publicly exit approved, pending, and revoked notes after transfer while revealing the origin, including during the guardian pause and with the reference ASP, indexer, and relayer offline, provided the user can fund a transaction or find another submitter. A stranger, duplicate spend, changed recipient, or leaked reusable secret fails.
- A fresh device restores notes and spent status from the separate privacy phrase plus independently obtained public history; it verifies commitments and can form a valid witness without trusting the operator's database.
- Measure *complete* proof generation, memory, artifact setup, transaction bytes, compute, and confirmation. A small circuit or verifier-only benchmark does not pass the V1 gate.

## Stop conditions

Do not freeze a circuit ABI, run a production setup, or accept production deposits until the exit, revocation, recovery, and value invariants survive adversarial review. If the current-holder exit or full browser proof fails, return to the product decision instead of adding a hosted witness prover. Country-specific counsel must assess the selected exit and screening model before a production launch.

**Design references:** [0xbow's original-depositor ragequit](https://docs.privacypools.com/protocol/ragequit), [Orchard note/nullifier properties](https://zcash.github.io/orchard/design/nullifiers.html), and [Solana event durability guidance](https://solana.com/docs/programs/anchor-events). These are precedents and constraints, not proofs of Whirlpool's design.
