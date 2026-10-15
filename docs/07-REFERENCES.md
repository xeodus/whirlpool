# 07 — Evidence and prior art

**Status:** source index for the design, not proof that Whirlpool's proposed protocol is safe or legal. Prefer primary specifications, official platform documentation, and upstream code over marketing claims. Recheck version-sensitive sources before implementation.

## Protocol and cryptography

- [Zcash Orchard protocol and ZIP-224](https://zips.z.cash/zip-0224) and the [Orchard book](https://zcash.github.io/orchard/design/keys.html): useful note, viewing-key, nullifier, and address security models. Whirlpool cannot copy their claims without implementing and reviewing equivalent relations.
- [Orchard nullifier design](https://zcash.github.io/orchard/design/nullifiers.html): highlights spent-status and note-privacy properties that the old “full viewing key without nullifier key” draft did not resolve.
- [0xbow Privacy Pools implementation](https://github.com/0xbow-io/privacy-pools-core) and [ragequit documentation](https://docs.privacypools.com/protocol/ragequit): precedent for approved deposit sets and **original-depositor** public exit. It does not supply a transferable-descendant revocation or exit design.
- [Sunspot](https://github.com/reilabs/sunspot): Noir-to-Groth16/Solana candidate; upstream says it is unaudited and warns that the simple setup is unsafe.
- [snarkjs](https://github.com/iden3/snarkjs): browser Groth16 candidate using Circom artifacts and GPL-3 licensing. Browser support is real; compatibility with the Sunspot pipeline is unproved.

## Solana operation and security

- [Versioned transactions](https://solana.com/docs/core/transactions/versioned-transactions): v1 is active; format choice still requires byte-size and ecosystem-support tests.
- [Transaction and compute limits](https://solana.com/docs/core/constants-reference): bounds for full-action measurement, not a substitute for a benchmark.
- [Anchor event guidance](https://solana.com/docs/programs/anchor-events) and [RPC provider guidance](https://solana.com/docs/rpc/providers): logs may be truncated; historical retention varies. Recovery must be independently tested.
- [Program deployment and upgrade authority](https://solana.com/docs/core/programs/program-deployment): the upgrade authority can replace program bytecode; removing it makes the program permanently immutable.
- [Verified builds](https://solana.com/docs/programs/verified-builds): verifies deployed code matches source, **not** that the code is secure.
- [Circle USDC terms](https://www.circle.com/legal/usdc-terms): issuer blocklisting/freezing powers must appear in product and incident design.

## Legal and policy sources

- [FATF virtual-asset guidance](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html) and [2026 DeFi report](https://www.fatf-gafi.org/en/news/targeted-report-decentralised-finance-2026.html): actual operator control, upgrades, and services matter to classification.
- [FinCEN 2019 CVC guidance](https://www.fincen.gov/system/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf): distinguishes roles in anonymizing software and services; no label alone resolves status.
- [U.S. Treasury Tornado Cash delisting](https://home.treasury.gov/news/press-releases/sb0057), [DOJ 2025 remarks](https://www.justice.gov/opa/speech/acting-assistant-attorney-general-matthew-r-galeotti-delivers-remarks-american), [EU AMLR](https://eur-lex.europa.eu/eli/reg/2024/1624/oj), and [VARA prohibited-asset rule](https://rulebooks.vara.ae/rulebook/c-prohibited-virtual-assets): jurisdiction-specific context, **not** an opinion that Whirlpool is permitted or prohibited anywhere.

## Repository evidence

- `spikes/hash-conformance/RESULTS.md`: tested Poseidon vectors, arities, and zeros only.
- `spikes/proving-feasibility/RESULTS.md`: small Sunspot sample and its particular client-toolchain comparison; it did not prove browser proving impossible.
- `spikes/groth16-verify-cu/RESULTS.md`: one sample verifier in LiteSVM, not full V1 transaction cost.
