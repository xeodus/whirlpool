# Test-only SOL and token pool

This program exercises candidate proof verification against Solana account state, SOL transfers, and a local USDC-like SPL Token mint in LiteSVM. It is **not** a deployable pool or a V1 protocol ABI. It uses insecure fixed test proving keys, a fixture-specific initial origin, a 32-root account-local history, and a directly authorized ASP root update. The token is not canonical USDC. It omits production governance/timelock, independent chain-history recovery, and operational hardening. Never send real assets to it.

After generating the candidate circuit keys/proofs and `generated/*_verifying_key.rs`, run `NO_DNA=1 cargo build-sbf` and `NO_DNA=1 cargo test -- --nocapture` from this directory.
