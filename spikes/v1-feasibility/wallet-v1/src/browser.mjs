import { getWallets } from '@wallet-standard/app';
import { getBase58Decoder, getBase64Decoder, getTransactionDecoder } from '@solana/kit';
import { buildUnsignedMemoTransaction } from './transaction.mjs';

// Jupiter's wallet broadcast returned 500; disabled pending route review.
const ENABLE_SEND = false;
// The approved one-shot test completed and finalized; do not enable again without a new decision.
const ENABLE_APP_BROADCAST = false;
const status = document.getElementById('status');
const connect = document.getElementById('connect');
const prepare = document.getElementById('prepare');
const send = document.getElementById('send');
const signOnly = document.getElementById('sign-only');
let account, wallet;

async function rpc(method, params) {
  const response = await fetch('/rpc', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `RPC proxy: HTTP ${response.status}`);
  return result.result;
}

function setStatus(message) { status.textContent = message; }
connect.onclick = async () => {
  try {
    wallet = getWallets().get().find(w => w.name === 'Jupiter');
    if (!wallet) throw new Error('Jupiter Wallet was not found in this browser.');
    const versions = Array.from(wallet.features['solana:signTransaction']?.supportedTransactionVersions ?? []).map(String);
    if (!versions.includes('1'))
      throw new Error('This Jupiter installation does not advertise v1 signing.');
    const feature = wallet.features['standard:connect'];
    if (!feature) throw new Error('Jupiter does not expose Wallet Standard connect.');
    const connected = await feature.connect();
    account = connected.accounts.find(a => a.chains.includes('solana:devnet'));
    if (!account) throw new Error('The connected account does not advertise Solana Devnet.');
    setStatus(`Connected public address: ${account.address}\nAccount chains: ${account.chains.join(', ')}\nNo transaction was signed or sent.`);
    prepare.disabled = false;
  } catch (error) { setStatus(`Connect failed: ${error.message}`); }
};

prepare.onclick = async () => {
  try {
    prepare.disabled = true;
    setStatus('Preparing an unsigned 1,510-byte Devnet v1 Memo transaction...');
    const [blockhash, balance] = await Promise.all([
      rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]),
      rpc('getBalance', [account.address, { commitment: 'confirmed' }]),
    ]);
    const built = buildUnsignedMemoTransaction(account.address, blockhash.value);
    const wire = getBase64Decoder().decode(built.bytes);
    const feeMessage = getBase64Decoder().decode(built.transaction.messageBytes);
    const [simulation, fee] = await Promise.all([
      rpc('simulateTransaction', [wire, {
        encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false,
        commitment: 'confirmed',
      }]),
      rpc('getFeeForMessage', [feeMessage, { commitment: 'confirmed' }]),
    ]);
    setStatus(`Cluster: Solana Devnet (fixed server endpoint)\nWallet address: ${account.address}\n` +
      `Transaction: v1, ${built.size} bytes, Memo only, no asset transfer\n` +
      `Balance: ${balance.value} lamports; estimated fee: ${fee.value ?? 'unavailable'} lamports\n` +
      `Simulation error: ${JSON.stringify(simulation.value.err)}\n` +
      `Compute units: ${simulation.value.unitsConsumed ?? 'unavailable'}\n` +
      `No transaction was signed or sent.`);
    send.hidden = !ENABLE_SEND || simulation.value.err !== null || fee.value > 10_000;
    signOnly.hidden = !ENABLE_APP_BROADCAST || simulation.value.err !== null || fee.value > 10_000;
  } catch (error) { setStatus(`Preparation failed: ${error.message}\nNo transaction was signed or sent.`); }
  finally { prepare.disabled = false; }
};

send.onclick = async () => {
  if (!ENABLE_SEND || !account || !wallet) return;
  send.disabled = true;
  try {
    // A fresh blockhash and simulation are mandatory immediately before wallet approval.
    const blockhash = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const built = buildUnsignedMemoTransaction(account.address, blockhash.value);
    const [simulation, fee] = await Promise.all([
      rpc('simulateTransaction', [getBase64Decoder().decode(built.bytes), {
        encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false,
        commitment: 'confirmed',
      }]),
      rpc('getFeeForMessage', [getBase64Decoder().decode(built.transaction.messageBytes),
        { commitment: 'confirmed' }]),
    ]);
    if (simulation.value.err !== null || !Number.isInteger(fee.value) || fee.value > 10_000)
      throw new Error(`Simulation or fee check failed: ${JSON.stringify(simulation.value.err)}`);
    const versions = Array.from(wallet.features['solana:signAndSendTransaction']?.supportedTransactionVersions ?? []).map(String);
    if (!versions.includes('1')) throw new Error('Jupiter no longer advertises v1 sign-and-send.');
    setStatus(`Requesting Jupiter approval for one Devnet v1 Memo, ${built.size} bytes, ${fee.value} lamports fee. Check the wallet prompt before approving.`);
    const [result] = await wallet.features['solana:signAndSendTransaction'].signAndSendTransaction({
      account, chain: 'solana:devnet', transaction: built.bytes,
    });
    const signature = result?.signature;
    if (!(signature instanceof Uint8Array) || signature.length !== 64)
      throw new Error('Wallet returned an unexpected signature; check Devnet history before retrying.');
    setStatus(`Jupiter returned Devnet transaction signature: ${getBase58Decoder().decode(signature)}\n` +
      `Memo only, ${built.size} bytes. Verify finalized status separately before treating the transaction as accepted.`);
  } catch (error) { setStatus(`Wallet submission failed or was declined: ${error.message}\nCheck Devnet history before retrying.`); }
};

signOnly.onclick = async () => {
  if (!ENABLE_APP_BROADCAST || !account || !wallet) return;
  signOnly.disabled = true;
  try {
    const blockhash = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const built = buildUnsignedMemoTransaction(account.address, blockhash.value);
    const [simulation, fee] = await Promise.all([
      rpc('simulateTransaction', [getBase64Decoder().decode(built.bytes), {
        encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false,
        commitment: 'confirmed',
      }]),
      rpc('getFeeForMessage', [getBase64Decoder().decode(built.transaction.messageBytes),
        { commitment: 'confirmed' }]),
    ]);
    if (simulation.value.err !== null || !Number.isInteger(fee.value) || fee.value > 10_000)
      throw new Error(`Fresh simulation or fee check failed: ${JSON.stringify(simulation.value.err)}`);
    const versions = Array.from(wallet.features['solana:signTransaction']?.supportedTransactionVersions ?? []).map(String);
    if (!versions.includes('1')) throw new Error('Jupiter no longer advertises v1 signing.');
    setStatus(`Requesting Jupiter signature for one Devnet Memo, ${built.size} bytes, ${fee.value} lamports fee. Review the wallet prompt.`);
    const [result] = await wallet.features['solana:signTransaction'].signTransaction({
      account, chain: 'solana:devnet', transaction: built.bytes,
    });
    const signed = result?.signedTransaction;
    if (!(signed instanceof Uint8Array) || signed.length !== built.size)
      throw new Error('Wallet returned an unexpected transaction size; nothing was broadcast.');
    const decoded = getTransactionDecoder().decode(signed);
    if (decoded.messageBytes.length !== built.transaction.messageBytes.length ||
        !decoded.messageBytes.every((byte, i) => byte === built.transaction.messageBytes[i]))
      throw new Error('Wallet changed the transaction message; nothing was broadcast.');
    const signature = decoded.signatures[account.address];
    if (!(signature instanceof Uint8Array) || signature.length !== 64)
      throw new Error('Wallet signature is missing; nothing was broadcast.');
    const publicKey = await crypto.subtle.importKey('raw', account.publicKey, 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', publicKey, signature, decoded.messageBytes))
      throw new Error('Wallet signature did not verify; nothing was broadcast.');
    setStatus('Jupiter signed the exact simulated Memo. Broadcasting once through public Solana Devnet RPC...');
    const response = await fetch('/broadcast', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: account.address, transaction: getBase64Decoder().decode(signed) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${body.error || `HTTP ${response.status}`}; check history before retrying`);
    setStatus(`Public Devnet RPC accepted signature: ${body.signature}\n` +
      `Local signature: ${getBase58Decoder().decode(signature)}\n` +
      `Memo only, ${built.size} bytes. Finalization still needs independent readback.`);
  } catch (error) { setStatus(`Sign-only path stopped: ${error.message}\nDo not retry until Devnet history is checked.`); }
};
