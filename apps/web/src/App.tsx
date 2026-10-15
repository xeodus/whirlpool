import { useEffect, useState } from 'react';
import { getWallets } from '@wallet-standard/app';

type WalletCapability = { name: string; v1: boolean; devnet: boolean };

const steps = [
  { number: '01', title: 'Shield test SOL', detail: 'Your deposit becomes a private note. It waits for an ASP decision before private spending.' },
  { number: '02', title: 'Move privately', detail: 'Send to another privacy address or withdraw to a public Solana address.' },
  { number: '03', title: 'Keep your way out', detail: 'Recover on a fresh device or use a public exit if approval is denied or revoked.' },
];

function walletCapabilities(): WalletCapability[] {
  return getWallets().get().filter(wallet => wallet.chains.includes('solana:devnet')).map(wallet => {
    const sign = wallet.features['solana:signTransaction'] as { supportedTransactionVersions?: ReadonlySet<string | number> } | undefined;
    const versions = Array.from(sign?.supportedTransactionVersions ?? []).map(String);
    return { name: wallet.name, v1: versions.includes('1'), devnet: true };
  });
}

export function App() {
  const [wallets, setWallets] = useState<WalletCapability[]>([]);
  const [showWallets, setShowWallets] = useState(false);
  useEffect(() => {
    const registry = getWallets();
    const update = () => setWallets(walletCapabilities());
    update();
    const offRegister = registry.on('register', update);
    const offUnregister = registry.on('unregister', update);
    return () => { offRegister(); offUnregister(); };
  }, []);

  return <div className="site">
    <header className="nav shell">
      <a className="brand" href="#top" aria-label="Whirlpool home"><span className="mark" aria-hidden="true"><span /></span><span>whirlpool</span></a>
      <div className="nav-right"><a href="#how-it-works">How it works</a><a href="#status">Build status</a><span className="network-pill"><span className="live-dot" /> DEVNET RESEARCH</span></div>
    </header>

    <main id="top">
      <section className="hero shell">
        <div className="eyebrow"><span className="eyebrow-line" /> PRIVATE VALUE, WITH AN OPEN EXIT</div>
        <div className="hero-grid">
          <div className="hero-copy">
            <h1>Move with<br /><em>more room</em><br />to breathe.</h1>
            <p>Whirlpool is building a quieter way to hold and move value on Solana. Your spending secrets stay with you. Your way out stays open.</p>
            <div className="hero-actions"><a className="primary-button" href="#how-it-works">Explore the journey <span aria-hidden="true">↗</span></a><a className="text-link" href="#status">See what is live <span aria-hidden="true">→</span></a></div>
            <div className="hero-foot"><span className="foot-rule" /> Test SOL only. No transaction access yet.</div>
          </div>
          <div className="visual" aria-label="Abstract concentric water rings"><div className="ring ring-one" /><div className="ring ring-two" /><div className="ring ring-three" /><div className="ring ring-four" /><div className="center-glow" /><div className="visual-caption">A PRIVATE PATH. A PUBLIC WAY OUT.</div></div>
        </div>
      </section>

      <section className="intro-band"><div className="shell intro-inner"><span>DESIGNED FOR PEOPLE, NOT ONLY PROOFS</span><p>Private transfer, honest limits, and recovery that you can actually use.</p><span className="intro-star" aria-hidden="true">✳</span></div></section>

      <section className="journey shell" id="how-it-works">
        <div className="section-head"><span className="kicker">THE JOURNEY</span><h2>Private when you need it.<br /><em>Clear when it matters.</em></h2><p>The Devnet alpha will let invited testers try the full SOL flow from deposit to recovery and exit.</p></div>
        <div className="step-grid">{steps.map(step => <article className="step" key={step.number}><span className="step-number">{step.number}</span><div className="step-symbol" aria-hidden="true">{step.number === '01' ? '◉' : step.number === '02' ? '↗' : '↙'}</div><h3>{step.title}</h3><p>{step.detail}</p></article>)}</div>
        <p className="journey-note">A public exit reveals the originating deposit and can weaken privacy for related notes. Fees and approval risks will be shown before a transaction.</p>
      </section>

      <section className="status-wrap" id="status"><div className="shell status-layout"><div><span className="kicker">BUILD STATUS</span><h2>We are building the<br /><em>real Devnet journey.</em></h2><p>The earlier research completed one fixed test flow. The general application and its safety checks are still being built. We will open transaction access only when the flow can be recovered and signed clearly.</p><a className="text-link" href="https://github.com/xeodus/whirlpool" target="_blank" rel="noreferrer">Follow the work <span aria-hidden="true">↗</span></a></div><div className="status-card"><div className="status-top"><span className="status-light" /> DEVNET ALPHA · IN DEVELOPMENT</div><div className="status-item"><span>Public preview</span><strong>Available in this build</strong></div><div className="status-item"><span>Wallet capability check</span><strong>Read only</strong></div><div className="status-item"><span>Shield · transfer · withdrawal</span><strong>Not enabled</strong></div><div className="status-item"><span>Recovery · public exit</span><strong>Not enabled</strong></div><div className="status-bottom">No mainnet assets. No live custody through this site.</div></div></div></section>

      <section className="wallet-section shell"><div><span className="kicker">BEFORE YOU TRY THE ALPHA</span><h2>Check your wallet.</h2><p>Proof-bearing Solana transactions need a wallet that advertises transaction version 1. This check only reads wallet capabilities. It does not connect, sign, or send.</p></div><div className="wallet-box"><button className="secondary-button" type="button" onClick={() => setShowWallets(!showWallets)}>{showWallets ? 'Hide wallet results' : 'Check this browser'} <span aria-hidden="true">↗</span></button>{showWallets && <div className="wallet-results" aria-live="polite">{wallets.length ? wallets.map(wallet => <div key={wallet.name}><span>{wallet.name}</span><strong>{wallet.v1 ? 'Devnet + v1 advertised' : 'v1 signing not advertised'}</strong></div>) : <p>No Devnet wallet was detected in this browser.</p>}<small>Capability advertising is not proof of a safe signing prompt or successful transaction.</small></div>}</div></section>
    </main>
    <footer className="footer shell"><span className="brand"><span className="mark" aria-hidden="true"><span /></span><span>whirlpool</span></span><span>Thoughtful privacy takes careful work.</span><span>DEVNET RESEARCH · 2026</span></footer>
  </div>;
}
