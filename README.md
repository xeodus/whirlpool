# whirlpool

Shielded SOL transfers on Solana: Noir circuit, Groth16 via Sunspot, Anchor pool program, proving API, Next.js UI.

v1 target: **fixed denominations** (0.1 / 1 / 10 SOL). The copied demo still uses variable amounts; that is a protocol bug to fix, not the folder layout.

## What you actually need (same as the working demo)

Tornado-style systems and the [catmcgee demo](https://github.com/catmcgee/noir-solana-private-transfers) use **four** pieces, not six:

| Folder | Job |
| ------ | --- |
| `circuits/withdrawal/` | Noir: commitment, nullifier, Merkle membership. Sunspot turns this into a Groth16 verifier `.so`. |
| `anchor/` | On-chain pool: take SOL, store recent roots, check nullifiers, CPI-verify the proof, pay out. |
| `backend/` | HTTP API: build the note, run `nargo execute` + `sunspot prove`. This **is** the prover. |
| `app/` | Wallet UI. Same role as the demo’s `frontend/`. |

There is **no** separate `prover/` or `indexer/` in the demo. Merkle paths are built inside `backend/` today. A dedicated indexer is only needed later if you reconstruct the tree from `DepositEvent` logs so many deposits share one root (the demo does not do that).

The demo README lists `circuits/hasher` and `circuits/merkle-hasher`. **Those directories are not in the clone.** Hashing is `noir-lang/poseidon` inside the withdrawal circuit plus `@zkpassport/poseidon2` in the backend.

## Why `app/` is not named `frontend/`

Whirlpool started as the Solana Kit **Next.js** template. Next.js App Router **must** live in `app/`. The demo is a **Vite** SPA under `frontend/`.

You need one UI that can connect a wallet and call the program + backend. You do not need both stacks. Keep Next + Kit here; do not copy the Vite app.

## Layout

```
app/                     Next.js UI (Kit, wallet-standard)
anchor/                  Pool program
backend/                 Note + Groth16 proving API (from the demo)
circuits/withdrawal/     Noir circuit (from the demo)
codama.json              TS client from Anchor IDL
```

## Run (UI only, today)

```shell
npm install
npm run dev
```

Proving needs Noir **1.0.0-beta.13**, Go **1.24+**, [Sunspot](https://github.com/reilabs/sunspot), and `GNARK_VERIFIER_BIN`. Then:

```shell
cd circuits/withdrawal && nargo compile && nargo test
cd backend && npm install && npm run dev
```

`backend/src/server.ts` still has the demo’s program ID (`9T8s…`). Point it at this program after deploy. The backend’s Merkle helpers currently hash each leaf against **empty** siblings (anonymity set of one). Replace that with an incremental tree before calling this a mixer.

## Not in this repo on purpose

- Demo `frontend/` (Vite / `@solana/client`)
- Demo `instructions/` (workshop markdown)
- Empty `prover/` / `indexer/` folders
- Personal SOL vault UI
