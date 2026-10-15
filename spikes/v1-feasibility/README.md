# V1 feasibility slice

This is unreviewed, test-only research for the gates in `docs/06-ROADMAP.md`. It must not receive real funds or determine the final circuit ABI, proof stack, recovery format, or launch clearance.

- `gate-01/` proves a small browser-to-Solana Groth16 interoperability path.
- `candidate-circuits/` contains representative shield, one/two-input transfer, one/two-input withdrawal, and current-holder public-exit statements, with browser benchmarks and a verifier-only program.
- `pool/` exercises proof verification, account state, SOL and local SPL Token custody, ASP revocation, pause, and public exit in LiteSVM.
- `recovery/` tests a 24-word research phrase, deterministic view/spend derivation, encrypted outputs, and a standard-RPC history reader that rejects missing transactions and mismatched pool state. A mocked RPC is the only history source tested so far.
- `wallet-v1/` tests Jupiter's browser-wallet v1 signing against an inert 1,510-byte Memo. One signed Memo finalized on Devnet through public RPC; it does not exercise the pool or recovery.
- `devnet-harness/` prepares an isolated pool build with fresh, still-unsafe test keys for a possible throwaway public-chain trial. It does not sign or deploy anything.

See `RESULTS.md` for the evidence and remaining gates. Generated proving keys use fixed public test entropy and are ignored by Git. Never deploy them.
