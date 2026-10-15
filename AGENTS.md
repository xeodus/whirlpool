# Repository Guidelines

## Project Structure & Current Authority

Whirlpool is building an invited Devnet SOL alpha; there is no production app or program. `docs/03-DECISIONS.md` is the decision register, `docs/10-DEVNET-SOL-ALPHA.md` defines this milestone, and `docs/06-ROADMAP.md` defines later gates. `apps/web/` is the transaction-disabled Vite preview. `packages/` holds approval and recovery clients; `services/relayer/` holds a disabled-by-default server route; `programs/sol-pool/` is a test-only candidate. `spikes/` provides bounded evidence, not deployable artifacts. Never treat generated `target/` or proving keys as source.

## Build, Test, and Development Commands

Run `npm ci`, `npm run build`, and `npm test` at the repository root for the workspace app and client checks. Use `npm run dev --workspace @whirlpool/web` for local UI work. Run `bash scripts/verify-local-sol-journey.sh` for the local proof-to-custody path after generating the ignored candidate artifacts. A passing local flow does not clear Devnet or V1 release gates.

## Coding Style & Naming

Keep numbered design files under `docs/` and experimental code inside its spike. Mark claims **settled**, **proposed**, or **open**; cite evidence for technical assertions. Use consistent two-space indentation for nested Markdown lists. Format Rust with `cargo fmt` and Noir with `nargo fmt` where those toolchains apply. No repository-wide TypeScript formatter or linter is configured.

## Testing & V1 Gates

Keep cross-language cryptographic vectors byte-identical. Name tests for behavior, such as `revoked_origin_blocks_transfer`. Test value conservation, public-input binding, nullifier replay, lineage revocation, public exit, and recovery with the reference indexer unavailable. Record hardware, browser, artifact setup, and warm proof latency separately; the gate is p95 under 30 seconds for transfer, withdrawal, and public-exit proofs on supported 8 GB desktops. No coverage threshold exists yet.

## Commits & Pull Requests

History contains `wip` and `chore: initial commit`, so it establishes no reliable convention. Use clear imperative subjects, for example `docs: clarify revocation gate`. PRs should describe the decision or behavior changed, link evidence or issues, list validation, identify security and legal assumptions, and include screenshots for UI changes.

## Security & Decision Changes

Keep recovery phrases, witnesses, keypairs, and credentials out of Git. Spending secrets stay on-device; do not introduce a hosted-prover fallback. V1 excludes swaps and cross-origin merges. Preserve the 48-hour on-chain upgrade timelock and guardian pause of deposits and private spends, with public exit callable. Launch geography, proof stack, signer quorum, and cap remain open. Discuss consequential changes to settled decisions before treating them as approved; never infer launch clearance from research or a spike.
