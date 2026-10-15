# Whirlpool

Whirlpool is a proposed Solana privacy pool for individuals. The intended first release lets a user shield SOL or USDC, transfer privately, withdraw privately, or publicly exit as the current note holder while revealing the originating deposit. A confirmed shield awaits Association Set Provider (ASP) approval before private spending; proofs must preserve hidden origin through transfers so a later revocation stops descendants from private spending. Private swaps and business workflows are later possibilities, not V1 commitments.

**Status: research and Devnet-alpha implementation. No production protocol or app exists.** The earlier demo was removed. The remaining `spikes/` establish narrow feasibility results, not the safety or performance of the intended protocol. A live test-SOL journey is the first implementation milestone; no mainnet deployment, launch jurisdiction, legal classification, full cryptographic specification, or production browser proving stack has been approved.

## Read this first

- [`docs/00-VISION.md`](docs/00-VISION.md): users, V1 journey, and honest product claims.
- [`docs/03-DECISIONS.md`](docs/03-DECISIONS.md): settled choices and explicitly open gates.
- [`docs/09-V1-PROTOCOL-DECISION-NOTE.md`](docs/09-V1-PROTOCOL-DECISION-NOTE.md): the selected step-1 product semantics and remaining technical measurements.
- [`docs/10-DEVNET-SOL-ALPHA.md`](docs/10-DEVNET-SOL-ALPHA.md): first implementation milestone and invitation gates.
- [`docs/01-PROTOCOL-SPEC.md`](docs/01-PROTOCOL-SPEC.md) and [`docs/08-CRYPTO-SPEC.md`](docs/08-CRYPTO-SPEC.md): requirements and unresolved protocol design.
- [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md), [`docs/05-THREAT-MODEL.md`](docs/05-THREAT-MODEL.md), and [`docs/06-ROADMAP.md`](docs/06-ROADMAP.md): components, risks, and gates.
- [`docs/04-COMPLIANCE.md`](docs/04-COMPLIANCE.md): the origin-screening policy and open legal questions.
- [`docs/07-REFERENCES.md`](docs/07-REFERENCES.md): primary sources and technical-spike limits.

## Repository today

`docs/` holds the current design; `spikes/` holds bounded research evidence. `programs/sol-pool/` and `packages/` contain the new test-only SOL implementation; `apps/web/` contains a public preview with transactions disabled. `services/relayer/` and `api/` contain a disabled-by-default relayer route. There is no mainnet program. Run `npm ci`, `npm test`, and `npm run build` at the root; use `npm run dev --workspace @whirlpool/web` for the preview. Run `bash scripts/verify-local-sol-journey.sh` for the proof-bearing local journey after reproducing the candidate proving artifacts. The script never submits a network transaction.

The legal launch boundary is **intentionally open**. Do not infer permitted countries, entity locations, or counsel approval from older drafts or this README.
