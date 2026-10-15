import { entropyToMnemonic, generateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// Research-only 24-word transport for 256 bits of entropy. The entropy is
// passed directly to the versioned HKDF in recovery.mjs; it is NOT a Solana
// wallet phrase, and changing this mapping later breaks restoration.
export function createPrivacyPhrase() { return generateMnemonic(wordlist, 256); }

export function seedFromPrivacyPhrase(phrase) {
  if (typeof phrase !== 'string' || phrase.trim() !== phrase || phrase.split(' ').length !== 24)
    throw new Error('Expected a 24-word privacy recovery phrase');
  const entropy = mnemonicToEntropy(phrase, wordlist);
  if (entropy.length !== 32) throw new Error('Expected 256-bit privacy entropy');
  return entropy;
}

export function phraseFromResearchSeed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('Expected 32-byte research seed');
  return entropyToMnemonic(seed, wordlist);
}
