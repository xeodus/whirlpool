# Devnet reference relayer

This service is a **test-SOL candidate**, disabled unless `WHIRLPOOL_RELAYER_ENABLED=true`. It accepts only transfer and withdrawal proof instructions. The fee payer signs after Helius simulation, a fee and balance check, and an atomic Redis claim. A submitted intent is never automatically broadcast twice. `/api/relayer-status` reads the saved signature from Solana history; `recorded-unresolved` requires operator review before any new intent.

Deploy Vercel from the repository root so `/api` can import its workspace packages. Never put the following variables under a `VITE_` prefix or commit their values:

| Variable | Purpose |
| --- | --- |
| `WHIRLPOOL_SITE_ORIGIN` | Exact HTTPS origin permitted to call the route. |
| `WHIRLPOOL_PROGRAM_ID`, `WHIRLPOOL_POOL_ID` | Independently reviewed Devnet deployment. |
| `WHIRLPOOL_DEVNET_RPC_URL`, `WHIRLPOOL_DEVNET_GENESIS_HASH` | Server-only RPC and expected cluster identity. |
| `WHIRLPOOL_RELAYER_SECRET_KEY_BASE64` | Separate 64-byte Devnet-only fee-payer key. |
| `WHIRLPOOL_INVITE_SHA256` | Comma-separated SHA-256 hashes of independently generated invite tokens. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Dedicated Redis instance and write token. |

The Redis claim limits each invitation to 20 *new* private actions in a 24-hour window beginning with its first action and retains signed intent records for seven days. Repeated intent IDs return the recorded signature. A new intent after an unresolved send must be held until history and nullifier state are reconciled. The invite gates this operated relayer only; it does not restrict on-chain deposits, exits, or use of another submitter. Tokens, secrets, proofs, and full RPC URLs must be excluded from logs.

No production or invited signing should be enabled until the release gates in `docs/10-DEVNET-SOL-ALPHA.md` pass. The current candidate program and proving setup are test-only. `npm test` runs isolated service tests; a live Upstash atomicity test and deployment smoke test remain required.
