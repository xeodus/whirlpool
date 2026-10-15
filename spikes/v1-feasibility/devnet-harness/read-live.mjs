// Public, read-only independent replay; no user phrase or spending secret.
import { readPoolHistory } from '../recovery/src/history.mjs';

const [program, pool] = process.argv.slice(2);
const isAddress = value => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
if (!isAddress(program) || !isAddress(pool))
  throw new Error('Usage: node read-live.mjs <program-address> <pool-address>');
const url = process.env.WHIRLPOOL_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com';
const history = await readPoolHistory(url, pool, program);
console.log(JSON.stringify({ cluster: 'Devnet RPC configured by the operator',
  program, pool, signatures: history.signatures, asset: Number(history.asset),
  originCounter: history.origin.toString(), leaves: history.leaves.length,
  records: history.records.length, spent: history.spent.size,
  paused: history.paused, approvedRoot: history.approvedRoot.toString() }));
