import {
  address, appendTransactionMessageInstruction, compileTransaction,
  createTransactionMessage, getTransactionEncoder, pipe,
  setTransactionMessageConfig, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';

// Built-in Memo program: this harness records no pool state and moves no tokens.
const MEMO_PROGRAM = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const MARKER = 'Whirlpool Step 2 v1 wallet/RPC compatibility test; no assets or secrets. ';

export function buildUnsignedMemoTransaction(feePayer, latestBlockhash) {
  const data = new TextEncoder().encode(MARKER.padEnd(1320, '.'));
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    m => setTransactionMessageFeePayer(address(feePayer), m),
    m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    m => appendTransactionMessageInstruction({ programAddress: MEMO_PROGRAM, data }, m),
    m => setTransactionMessageConfig({
      computeUnitLimit: 600_000,
      loadedAccountsDataSizeLimit: 1024 * 1024,
      priorityFeeLamports: 0n,
    }, m),
  );
  const transaction = compileTransaction(message);
  const bytes = getTransactionEncoder().encode(transaction);
  if (bytes.length <= 1232 || bytes.length > 4096) throw new Error(`Unexpected v1 size: ${bytes.length}`);
  return { bytes, size: bytes.length, memo: MARKER, transaction };
}
