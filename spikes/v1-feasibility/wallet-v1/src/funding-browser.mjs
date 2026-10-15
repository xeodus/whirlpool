import { getWallets } from '@wallet-standard/app';
import { getBase58Decoder, getBase64Decoder, getTransactionDecoder } from '@solana/kit';
import { buildFundingTransaction, FUNDING_SOURCE, FUNDING_DESTINATION, FUNDING_LAMPORTS } from './funding-transaction.mjs';

const status = document.getElementById('status');
const connect = document.getElementById('connect');
const prepare = document.getElementById('prepare');
const send = document.getElementById('send');
let wallet, account, reviewedFee;
const say = value => { status.textContent = value; };
async function rpc(method, params) {
  const response = await fetch('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `RPC HTTP ${response.status}`);
  return body.result;
}
async function check() {
  const [blockhash, balance, destinationBalance] = await Promise.all([
    rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]),
    rpc('getBalance', [FUNDING_SOURCE, { commitment: 'confirmed' }]),
    rpc('getBalance', [FUNDING_DESTINATION, { commitment: 'confirmed' }]),
  ]);
  const built = buildFundingTransaction(blockhash.value);
  const [simulation, fee] = await Promise.all([
    rpc('simulateTransaction', [getBase64Decoder().decode(built.bytes), {
      encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed',
    }]),
    rpc('getFeeForMessage', [getBase64Decoder().decode(built.transaction.messageBytes),
      { commitment: 'confirmed' }]),
  ]);
  if (simulation.value.err !== null || !Number.isSafeInteger(fee.value) || fee.value > 20_000)
    throw new Error(`Simulation or fee check failed: ${JSON.stringify(simulation.value.err)}; fee ${fee.value}`);
  if (balance.value < Number(FUNDING_LAMPORTS) + fee.value)
    throw new Error('Jupiter test wallet has insufficient Devnet SOL');
  return { built, balance: balance.value, destinationBalance: destinationBalance.value, fee: fee.value,
    units: simulation.value.unitsConsumed };
}
connect.onclick = async () => {
  try {
    wallet = getWallets().get().find(w => w.name === 'Jupiter');
    if (!Array.from(wallet?.features['solana:signTransaction']?.supportedTransactionVersions ?? []).map(String).includes('1'))
      throw new Error('Jupiter with v1 signing is required');
    const connected = await wallet.features['standard:connect'].connect();
    account = connected.accounts.find(a => a.address === FUNDING_SOURCE && a.chains.includes('solana:devnet'));
    if (!account) throw new Error(`Connect the approved Devnet account ${FUNDING_SOURCE}`);
    say(`Connected ${account.address}. No transaction signed or sent.`);
    prepare.disabled = false;
  } catch (error) { say(`Connect failed: ${error.message}`); }
};
prepare.onclick = async () => {
  try {
    prepare.disabled = true; send.disabled = true;
    const result = await check(); reviewedFee = result.fee;
    say(`Cluster: Solana Devnet (fixed server endpoint)\nFrom: ${FUNDING_SOURCE}\nTo: ${FUNDING_DESTINATION}\nAmount: 2 Devnet SOL (${FUNDING_LAMPORTS} lamports)\nFee: ${result.fee} lamports\nSource balance: ${result.balance} lamports\nDestination balance before: ${result.destinationBalance} lamports\nSimulation: success; compute units: ${result.units}\nNo transaction signed or sent.`);
    send.disabled = false;
  } catch (error) { say(`Preparation failed: ${error.message}\nNo transaction signed or sent.`); }
  finally { prepare.disabled = false; }
};
send.onclick = async () => {
  send.disabled = true; prepare.disabled = true;
  try {
    if (!account || !wallet || reviewedFee === undefined) throw new Error('Simulate first');
    const { built, fee } = await check();
    if (fee !== reviewedFee) throw new Error('Fee changed; review again');
    say(`Review Jupiter's prompt carefully. Devnet only; exactly 2 SOL to ${FUNDING_DESTINATION}; fee ${fee} lamports. Reject any mismatch.`);
    const [result] = await wallet.features['solana:signTransaction'].signTransaction({
      account, chain: 'solana:devnet', transaction: built.bytes,
    });
    const signed = result?.signedTransaction;
    if (!(signed instanceof Uint8Array)) throw new Error('Wallet did not return a signed transaction');
    const decoded = getTransactionDecoder().decode(signed);
    if (decoded.messageBytes.length !== built.transaction.messageBytes.length ||
        !decoded.messageBytes.every((byte, i) => byte === built.transaction.messageBytes[i]))
      throw new Error('Jupiter changed the simulated transaction; nothing broadcast');
    const signature = decoded.signatures[FUNDING_SOURCE];
    if (!(signature instanceof Uint8Array) || signature.length !== 64) throw new Error('Missing signature');
    const key = await crypto.subtle.importKey('raw', account.publicKey, 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, signature, decoded.messageBytes))
      throw new Error('Signature verification failed');
    const response = await fetch('/broadcast', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transaction: getBase64Decoder().decode(signed) }) });
    const body = await response.json();
    if (!response.ok) throw new Error(`${body.error}; inspect chain before any retry`);
    if (body.signature !== getBase58Decoder().decode(signature)) throw new Error('RPC signature mismatch');
    say(`Devnet RPC accepted ${body.signature}. Check finalization before deployment. Do not retry.`);
  } catch (error) { say(`Stopped: ${error.message}\nDo not retry until Devnet history is checked.`); }
};
