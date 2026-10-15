import {
  address, appendTransactionMessageInstruction, compileTransaction,
  createTransactionMessage, getTransactionEncoder, pipe,
  setTransactionMessageConfig, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';

export const FUNDING_SOURCE = 'G7CNKbhchpaLaoqPa6tQKqSY7UZkrxFXb2yB6cXmq3v1';
export const FUNDING_DESTINATION = '36XpD2MqRrdbBAARdQmWJrA3sR3z9QV7YCQUb58WFKAP';
export const FUNDING_LAMPORTS = 2_000_000_000n;
const SYSTEM_PROGRAM = address('11111111111111111111111111111111');

export function buildFundingTransaction(latestBlockhash) {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true); // SystemProgram::Transfer
  view.setBigUint64(4, FUNDING_LAMPORTS, true);
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    m => setTransactionMessageFeePayer(address(FUNDING_SOURCE), m),
    m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    m => appendTransactionMessageInstruction({ programAddress: SYSTEM_PROGRAM, accounts: [
      { address: address(FUNDING_SOURCE), role: 3 },
      { address: address(FUNDING_DESTINATION), role: 1 },
    ], data }, m),
    m => setTransactionMessageConfig({ computeUnitLimit: 600_000,
      loadedAccountsDataSizeLimit: 1024 * 1024, priorityFeeLamports: 0n }, m),
  );
  const transaction = compileTransaction(message);
  return { transaction, bytes: getTransactionEncoder().encode(transaction) };
}
