# Devnet SOL candidate pool

This is a **test-only** successor to the fixed feasibility pool. It supports unique sequential deposit origins, authenticated ASP approval and revocation leaf updates, SOL custody, private transfers and withdrawals, guardian pause, and current-holder public exit. The program accepts only SOL initialization. Its verifier keys come from ignored research artifacts generated with public phase-1 entropy; **never deploy this build for real assets**.

The approval instruction is `tag 1 | origin u64 little-endian | approved u8 | 20 sibling fields (32-byte big-endian each)`. The ASP signs a leaf transition against the current approval root. Finalized instructions publish the origin and path, enabling independent witness replay. The first test origin is 55 for compatibility with the candidate circuit vectors; every shield increments it. The 32-root history and candidate note format remain research limits.

Run `NO_DNA=1 cargo build-sbf --offline` and `NO_DNA=1 cargo test --offline --lib --test approval`. From the repository root, `bash scripts/verify-local-sol-journey.sh` also proves arbitrary amounts for two origins and checks the full test-SOL custody path in LiteSVM. It requires local ignored proving artifacts from the candidate-circuits spike and signs or sends no network transaction.
