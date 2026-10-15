# Whirlpool — Product thesis and evidence boundaries

**Status: hypothesis, not an investment claim or launch announcement.** The agreed V1 is a Solana privacy pool for individuals: shield SOL or USDC, make a private transfer from one deposit lineage, and withdraw privately or exit publicly. A shield awaits ASP approval for private spending; the current holder can publicly exit after transfer while revealing the originating deposit. Deposit origins are screened and remain revocable through descendants. Private swaps, businesses, and institutions are possible later directions.

## Why try this

Public-chain payments disclose balances, counterparties, and timing. Individuals may value payment privacy if it is usable, recoverable, and credible. Solana offers low-cost transactions and cryptographic primitives that make a shielded-pool experiment worth testing. Neither those primitives nor another chain's deployment proves Whirlpool is feasible, private at small scale, secure, or legally launchable.

## What must be true

1. A browser can generate **full** transfer, withdrawal, and public-exit proofs locally within the agreed performance gate on ordinary supported desktops.
2. A note can preserve one hidden deposit origin through transfer and change, while a live ASP revocation stops descendants from private spending. A public exit must let the current holder leave without exposing a reusable key.
3. Users can understand approval waits, limited effective anonymity, fees, public-exit disclosure, and the need to protect a separate recovery phrase. They can restore funds without the reference indexer.
4. Independent review, safe proof setup, operational controls, and country-specific counsel support an actual production launch.

The existing spikes test narrower questions. They do not validate these four propositions. The old documents' “category winner,” guaranteed legal lane, near-free state, fixed revenue model, and V1 private-swap claims are not adopted as facts.

## Product and trust limits

The ASP screens **origins**, not private recipients. Small pools, asset separation, amounts, timing, or network metadata may reveal a great deal despite valid zero-knowledge proofs. USDC's issuer can block or freeze assets. The hosted browser release can be compromised, and the timelocked upgrade authority can eventually change fund rules. An emergency guardian can suspend private activity; the intended public exit must remain callable, though neither code defects nor external USDC controls can be wished away.

## How to judge progress

Judge the effort by successful end-to-end recovery, proof and transaction measurements, independent security findings, ability to enforce revocation after transfer, real effective anonymity, customer comprehension and repeat use, and legal clearance for the actual operating footprint. Expand beyond a capped V1 only when those measurements justify it.
