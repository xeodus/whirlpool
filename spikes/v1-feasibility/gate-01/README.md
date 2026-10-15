# Gate 01: browser Groth16 to Solana verifier

**Research only.** This tiny circuit tests byte-level interoperability. It proves no pool invariant and uses a single-party test setup. Never use its keys or proof in production.

Run `npm ci`, `npm run setup`, `npm run prove`, and `npm run encode`. Then run `npm run serve`, open the printed loopback URL, and click the button. The browser generates a proof for private input `7` and posts a test fixture to the loopback server. Run `node scripts/encode.mjs browser` to encode it. From `program/`, run `NO_DNA=1 cargo build-sbf`, then `NO_DNA=1 REQUIRE_BROWSER_FIXTURE=1 cargo test --test interoperability -- --nocapture`. The Rust harness loads the compiled Solana program in LiteSVM and rejects tampered proof and public-input bytes.

The pinned `circom2` npm compiler is an experimental third-party WASM packaging of Circom. It is used only to keep this smoke test reproducible without installing a global compiler. Production compiler provenance and the GPL-3.0 obligations of `snarkjs` need review before stack selection.

The next gate replaces this circuit with representative complete shield, transfer, withdrawal, and exit statements. Passing this gate alone does not establish browser performance, V1 soundness, transaction size, or an approved trusted setup.
