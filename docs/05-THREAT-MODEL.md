# 05 — V1 threat model

**Status: pre-implementation.** The protected assets are vault funds, spending and recovery secrets, note history, origin-screening integrity, and the ability to exit. The adversaries include malicious users, chain analysts, compromised browser delivery, RPC/indexer/ASP/relayer operators, compromised upgrade or guardian keys, and USDC's issuer controls. No mitigation below is complete until implemented and tested.

| Risk | Required control and validation |
| --- | --- |
| Fabricated root or note drains a vault | Program-authenticated roots; deposit proof binds amount and origin to its note; independent balance and tree invariant tests. |
| Value inflation or cross-asset payout | Bounded integer arithmetic, per-asset conservation, canonical mint/token-program checks, and adversarial proof tests. |
| Replay, double spend, or redirected withdrawal | Atomic unique nullifiers; every public input bound in-circuit and checked against program accounts; change-recipient/fee replay tests. |
| Revoked funds retain private exit through transfer | Hidden origin preserved at each action; only live approval accepted; test revocation of a deposit after one and several transfers. |
| Public exit steals funds or leaks all notes | Ownership proof for the current holder, unique nullifier, origin disclosure, **no reusable key disclosure**; independent audit and misuse tests. |
| ASP or indexer censors or lies | Pending/revoked UI, independently checkable roots and paths, self-submitted public exit, durable data and independent recovery. An ASP can still deny private spending. |
| Browser release, dependency, or extension steals a phrase | Audited client, controlled and verifiable releases, strict content policy, dependency review, phrase handling, and no third-party scripts in secret flows. Web delivery remains a trust risk. |
| Upgrade or guardian abuse | On-chain 48-hour timelock without bypass, monitored proposals, separate narrowly scoped private-activity pause, capped exposure, independently staffed keys. Upgrade authority can still change fund rules. |
| Outflow exploit during timelock | Emergency pause can stop new deposits, private transfers, and private withdrawals; public exit remains callable. A flaw in public exit or shared validation may still drain funds; cap and audits limit, not remove, loss. |
| Lost history or misleading wallet balance | Durable encrypted outputs and ordering, checkpointed backfill, commitment verification, restore tests with reference indexer offline. |
| Traffic, timing, or small-set deanonymization | Relaying and honest UI about effective set size, amounts, timing, and network metadata; avoid secret-bearing analytics. No global-observer guarantee. |
| USDC vault freeze | Disclose issuer power, monitor token accounts, test frozen-vault behavior, and avoid unconditional USDC exit guarantees. |

## Production gates

- Full protocol and circuit specification, cross-language vectors, negative tests for every public input, fuzz/property tests for value, roots, nullifiers, lineage and exits.
- Independent circuit, verifier, program, and client security reviews; safe proof setup and published verification artifacts for the selected stack.
- Complete browser spend/exit tests on supported 8 GB Chrome, Firefox, and Safari desktops; at least 95% of warm proofs under 30 seconds. No hosted witness fallback.
- Recover funds with the reference indexer and relayer unavailable; verify emergency pause blocks new deposits and private spends while leaving public exit callable. Exercise a malicious upgrade proposal and a revocation race.
- Set and monitor a V1 exposure cap, incident runbook, signer/guardian quorum, and vault solvency checks before deposits.
- Obtain country-specific legal review for the actual operator and user footprint. Origin screening alone does not establish recipient eligibility.
