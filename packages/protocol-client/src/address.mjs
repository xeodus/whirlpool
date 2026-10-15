const PREFIX = 'wpdev1_';
const DOMAIN = new TextEncoder().encode('whirlpool-devnet-address-v1');
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16));
const bytes32 = value => unhex(BigInt(value).toString(16).padStart(64, '0'));
const base64url = bytes => btoa(Array.from(bytes, x => String.fromCharCode(x)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64url = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), x => x.charCodeAt(0));
async function checksum(body) {
  const bytes = new Uint8Array(DOMAIN.length + body.length);
  bytes.set(DOMAIN); bytes.set(body, DOMAIN.length);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).subarray(0, 4);
}

export async function encodePrivacyAddress(account) {
  if (!/^[0-9a-f]{64}$/.test(account?.viewPublic ?? '')) throw new Error('Invalid view public key');
  const owner = BigInt(account.owner);
  if (owner < 0n || owner >= FIELD) throw new Error('Invalid owner field');
  const body = new Uint8Array(64);
  body.set(unhex(account.viewPublic)); body.set(bytes32(owner), 32);
  const wire = new Uint8Array(68);
  wire.set(body); wire.set(await checksum(body), 64);
  return PREFIX + base64url(wire);
}

export async function decodePrivacyAddress(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX) || !/^[A-Za-z0-9_-]{91}$/.test(value.slice(PREFIX.length)))
    throw new Error('Invalid Devnet privacy address');
  const wire = fromBase64url(value.slice(PREFIX.length));
  if (wire.length !== 68) throw new Error('Invalid privacy address length');
  if (base64url(wire) !== value.slice(PREFIX.length)) throw new Error('Noncanonical privacy address');
  const body = wire.subarray(0, 64);
  const expected = await checksum(body);
  if (!expected.every((byte, i) => byte === wire[64 + i])) throw new Error('Privacy address checksum mismatch');
  const owner = BigInt(`0x${hex(body.subarray(32, 64))}`);
  if (owner >= FIELD) throw new Error('Noncanonical privacy address owner');
  return { viewPublic: hex(body.subarray(0, 32)), owner };
}
