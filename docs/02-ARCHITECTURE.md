# 02 — V1 architecture direction

**Status: proposed implementation shape, not approved account schemas or deployments.** Build for the first few thousand users and measure before adding throughput infrastructure. Protocol requirements are in `01-PROTOCOL-SPEC.md`; open decisions are in `03-DECISIONS.md`.

## Trust boundaries

| Component | Responsibility and trust |
| --- | --- |
| Browser wallet/app | Holds the separate privacy phrase and witnesses, prepares and verifies notes, generates proofs locally, and signs/submits transactions. A compromised hosted release can steal secrets. |
| Pool program | Owns SOL/USDC vault authority, authenticates commitment and current approval roots, enforces nullifier uniqueness and pause rules, and checks exact proof public inputs. |
| Proof verifier | Verifies the selected proof system and verification key; exact program boundary depends on the measured proof stack. |
| ASP | Screens **deposit origins** and updates approval/revocation state. A confirmed shield is pending until approval. The ASP can deny private spending but must not authorize spending or block the current holder's public-exit entry point. |
| Indexer | Caches ordered outputs, ciphertexts, paths, and statuses. Clients verify responses against on-chain state and can recover from independent durable history. |
| Relayer | Pays network fees and submits already formed proofs and public inputs. It never receives a witness or spending key. |
| Timelock and guardian | The timelock can eventually change program rules; the guardian can immediately pause new deposits, private transfers, and private withdrawals. Both are explicit trust assumptions. |

## On-chain V1

Start with a single pool program for asset-specific vaults, commitment roots, nullifiers, ASP state, and action rules, plus the verifier required by the chosen proof stack. A separate nullifier registry, swap program, compressed-account dependency, and multi-provider ASP registry need measured reasons before inclusion. Use canonical PDA and token-account validation, exact SOL/USDC mint and token-program checks, checked arithmetic, and atomic nullifier/payout transitions.

The deposit must bind its public amount and unique origin identifier to the initial note; a deposit proof or another independently reviewed binding mechanism is required. Transfer and withdrawal proofs must preserve that origin and consult **current** approval. A public-exit path for the current holder, including after transfer, must reveal the originating deposit and prove ownership without exposing reusable spending or nullifier secrets or requiring ASP cooperation. The precise circuit and account ABI are open.

Do not infer full transaction cost from the 172,370-CU sample verifier. Measure complete actions, including CPIs, account locks, output data, and proof bytes. [Solana transaction v1 is active](https://solana.com/docs/core/transactions/versioned-transactions); select legacy/v0 or v1 from actual byte counts and wallet/RPC support, not an assumed future activation.

## Data and services

The chain must carry enough durable output data and ordering information to rebuild notes and paths. [Solana warns that program logs may be truncated](https://solana.com/docs/programs/anchor-events); decide between instruction data, CPI events, or another verified archival strategy before relying on event-only recovery. The first indexer may use RPC polling with checkpoints, backfill, finalized-slot reconciliation, and archived history. Add Geyser streaming when measured throughput or latency warrants it. Independent recovery must be demonstrated without the reference indexer.

Operate one reference ASP and relayer initially, with documented outage and retry behavior. The user can self-submit public exit. No hosted prover receives a witness. Browser artifacts and updates need reproducible builds, release review, content-security controls, dependency review, and rollback; these reduce but do not eliminate the hosted-code trust risk.

## Operations and user experience

Expose pending/approved/revoked note states; proof download and progress; fees and recipient confirmation; recoverable errors; and privacy loss before public exit. Monitor vault assets and liabilities, root consistency, nullifier uniqueness, ASP update freshness, transaction failure rates, and proof latency without collecting secrets. Reconcile SOL and USDC independently, including issuer freeze behavior.

Program upgrades wait **48 hours in an on-chain timelock**. A guardian may immediately pause new deposits, private transfers, and private withdrawals, while public exit remains callable. No immediate upgrade bypass is approved. Independent keyholder count, quorum, TVL cap, alerting, and incident exercises remain launch gates. An upgrade authority can change fund rules, so the program is not immutable.
