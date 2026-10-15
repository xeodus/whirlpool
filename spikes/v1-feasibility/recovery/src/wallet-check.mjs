import { getWallets } from '@wallet-standard/app';

const status = document.getElementById('status');
const list = getWallets();
function versions(feature) {
  const value = feature?.supportedTransactionVersions;
  return value ? Array.from(value).map(String) : [];
}
function render() {
  const wallets = list.get().filter(wallet => wallet.chains.some(chain => chain.startsWith('solana:')));
  if (!wallets.length) {
    status.textContent = 'No Solana wallet has registered with Wallet Standard on this page.';
    return;
  }
  status.textContent = wallets.map(wallet => {
    const sign = versions(wallet.features['solana:signTransaction']);
    const send = versions(wallet.features['solana:signAndSendTransaction']);
    return `Wallet: ${wallet.name}\nChains: ${wallet.chains.join(', ')}\n` +
      `Sign versions: ${sign.join(', ') || 'unreported'}\n` +
      `Sign-and-send versions: ${send.join(', ') || 'unreported'}\n` +
      `Can sign v1: ${sign.includes('1') ? 'advertised' : 'not advertised'}\n` +
      `Can sign-and-send v1: ${send.includes('1') ? 'advertised' : 'not advertised'}`;
  }).join('\n\n');
}
list.on('register', render);
list.on('unregister', render);
render();
