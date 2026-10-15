#!/usr/bin/env bash
# Runs all four Poseidon implementations and compares to vectors.json.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .out

NARGO="${NARGO:-$HOME/.nargo/bin/nargo}"

echo "running rust (light-poseidon)..."     >&2
(cd rust && cargo run --quiet 2>/dev/null) | grep -oE '0x[0-9a-f]+' > .out/rust.txt
echo "running solana (sol_poseidon path)..." >&2
(cd rust-solana && cargo run --quiet 2>/dev/null) | grep -oE '0x[0-9a-f]+' > .out/solana.txt
echo "running noir..."                     >&2
(cd noir && "$NARGO" execute 2>/dev/null) | grep -oE '0x[0-9a-f]+' > .out/noir.txt
echo "running ts..."                       >&2
(cd ts && node index.cjs) | grep -oE '0x[0-9a-f]+' > .out/ts.txt

python3 - <<'PY'
import json
expected = list(json.load(open('vectors.json'))['vectors'].values())
def norm(xs): return [x[2:].lower().lstrip('0') or '0' for x in xs]
exp = norm(expected)
ok_all = True
for name in ['rust', 'solana', 'noir', 'ts']:
    got = norm([l.strip() for l in open(f'.out/{name}.txt') if l.strip()])
    ok = got == exp
    ok_all = ok_all and ok
    print(f"{name:7} {'PASS' if ok else 'FAIL'}")
    if not ok:
        for i, (g, e) in enumerate(zip(got, exp)):
            if g != e:
                print(f"   [{i}] got {g} expected {e}")
print("RESULT:", "ALL PASS" if ok_all else "FAILURE")
PY
