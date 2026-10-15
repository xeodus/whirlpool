# 01 — V1 protocol requirements

**Status: draft requirements, not a frozen circuit ABI.** This document records the agreed V1 behavior and the properties a candidate protocol must prove. Exact cryptography, field encodings, account layouts, and denominations remain open in `08-CRYPTO-SPEC.md` and `03-DECISIONS.md`.

## Value and identity model

- Separate SOL and USDC vault accounting. Only canonical allow-listed assets may enter; the USDC mint, token program, decimals, and issuer controls must be verified before implementation.
- A private note represents an asset, a nonnegative bounded value, an owner, fresh note randomness, and a **hidden originating deposit identifier**. The exact note commitment and encryption format are open.
- Each V1 private action consumes notes from **one deposit lineage**. Payment and change may create new notes with the *same* hidden origin. Whether an action may consume more than one note from that origin remains open; combining different origins is outside V1.
- A separate privacy recovery phrase derives note authority and viewing capabilities. No proof witness or spending key is sent to an operator.

## Required actions

| Action | Public effect | Required proof or check |
| --- | --- | --- |
| Shield | Move SOL/USDC into its vault and publish a new commitment and recoverable encrypted output. | Canonical asset, exact received amount, depositor authorization, and on-chain root update. A deposit proof or another reviewed mechanism must bind the public amount and unique origin to the initial private note. A confirmed shield begins **pending** ASP approval and cannot be spent privately until approved. |
| Private transfer | Consume note(s) from one origin and publish payment/change commitments and encrypted outputs; input count is open. | Ownership and membership for every input, a fresh nullifier for each, value conservation, recipient/output binding, and preservation of the hidden origin. The origin must be approved by the **current** policy root. |
| Private withdrawal | Consume note(s) from one origin, pay a public recipient and an agreed relayer fee, optionally return change; input count is open. | The same ownership, membership, nullifier, value, recipient, fee, and current-origin-approval checks. Public amount policy remains open. |
| Public exit | Let the current holder consume a note and pay a public recipient while revealing its originating deposit. | A separate ownership proof and value/membership/nullifier checks **without publishing reusable spending or nullifier secrets**. It must work after private transfer, without ASP approval, and during the private-activity pause. |

All payouts and nullifier marking must be atomic. Every public input that affects value, asset, destination, fee, root, output, or mode must be constrained in the proof and checked against the corresponding program accounts. A relayer may submit a proof but may not redirect value or change its fee. Users need a route to submit a public exit without the reference relayer.

## Approval and revocation

The ASP screens a **deposit origin** and publishes a verifiable current approval state. A private spend proves, without revealing which deposit it came from, that its hidden origin is currently approved. This approval is preserved through private transfers by the lineage relation, not by automatically trusting every new commitment. Removing an origin must block later private spends of all its descendants. **Stale approval roots cannot remain valid after revocation**; the exact root-update, finality, and in-flight-transaction rules need a formal specification and tests.

Origin screening does not screen the current note holder, a private recipient, or the public withdrawal recipient. This is an explicit product and legal limitation, not a claim of sanctions-safe exits. A public exit by the current holder reveals origin, which can also weaken privacy for other notes descended from that deposit. Its legal treatment requires country-specific review before launch.

## Trees, recovery, and privacy

- The program must authenticate commitment roots and enforce unique nullifiers; a caller-supplied unauthenticated root is never accepted.
- A wallet must recover encrypted outputs, their order, and Merkle paths from durable public data even if the reference indexer disappears. RPC logs alone are insufficient as the sole record.
- Recipient addresses must contain enough public information to construct a spendable note commitment and encrypt it. The wallet must verify decrypted notes against published commitments; malformed addresses or ciphertexts must not be shown as spendable funds.
- The effective anonymity set is reduced by asset, deposit/withdrawal amounts, approval status, timing, and network metadata. The UI must describe these limits rather than promise universal unlinkability.

## Verification gates

Before a circuit or ceremony is frozen, demonstrate full transfer, withdrawal, revocation, and public-exit statements with cross-language test vectors; negative tests for every public input; browser proving and transaction-size measurements; and independent cryptographic review. The previous depth-20 sample in `spikes/` is not this protocol.
