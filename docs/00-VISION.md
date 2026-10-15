# 00 — Vision and V1 product

**Status:** product direction agreed; protocol feasibility and legal launch remain open. This describes the intended product, not a deployed service.

## Problem and audience

Public Solana transactions reveal balances, counterparties, and timing. Some individuals need to make payments without publishing their entire financial graph. Whirlpool's first customers are privacy-conscious individuals; business treasury, institutional disclosure, and private trading are later product questions.

## First-release journey

1. Create and back up a **separate privacy recovery phrase**. A connected Solana wallet funds public deposits; wallet recovery is not assumed to recover notes.
2. Shield SOL or USDC. Show the source, amount, fees, issuer risks, and a clear **pending ASP approval** state. A confirmed deposit is not privately spendable until approved; denial may require public exit.
3. Send a private payment from **one deposit lineage**. Payment and change may split that lineage; combining notes from unrelated origins is outside V1.
4. Withdraw privately to a public recipient, or let the **current holder** use public exit after a transfer, denial, or revocation. Public exit reveals the originating deposit and can affect other descendants' privacy. Both paths must work without giving a server the spending secret.
5. Recover on another device from the privacy phrase and durable public data, including after the operator's indexer is unavailable.

The product claim is **screened fund origins**, not verified private recipients. Approved provenance does not establish the identity or legal status of a later recipient. Privacy also depends on effective set size, amounts, timing, network metadata, and user behavior; the UI must explain these limits.

## V1 quality bar

- Spending witnesses and the privacy phrase stay on the user's device. A hosted browser app is acceptable with controlled, independently verifiable releases; a compromised deployment remains a secret-exposure risk.
- On supported mainstream 8 GB desktops, at least 95% of **warm** transfer, private-withdrawal, and public-exit proofs finish within 30 seconds in Chrome, Firefox, and Safari. First-use artifact setup is separate and shown explicitly.
- A user can see approval status, note balance and spendability, fees, transaction progress, recovery status, and what a public exit reveals before confirming.
- Representative first users can complete backup, transfer, and fresh-device recovery and explain the difference between screened origins and screened recipients.
- Production waits if full proof, recoverability, security, or legal gates fail.

## Later possibilities

Private swaps, cross-origin note merges, mobile proving, multiple ASPs, institutional auditor flows, and high-throughput compression require separate product and security decisions. None is a reason to pre-build a V1 swap engine.

**Legal launch geography, operator locations, and counsel approval are open.** No country is declared included or excluded by this design.
