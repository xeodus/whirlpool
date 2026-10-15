import { createHash, timingSafeEqual } from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const HASH = /^[0-9a-f]{64}$/;

export function tokenDigest(token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('Invalid invitation token');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// The server receives only token hashes in configuration. A hash is also the
// stable, non-secret key for its quota; plaintext tokens are never logged.
export function createInvitations(commaSeparatedHashes) {
  const hashes = String(commaSeparatedHashes ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!hashes.length || hashes.some(value => !HASH.test(value)))
    throw new Error('Configure at least one SHA-256 invitation digest');
  const allowed = hashes.map(value => Buffer.from(value, 'hex'));
  return { async authenticate(token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    const given = Buffer.from(tokenDigest(token), 'hex');
    let matched = false;
    for (const expected of allowed) matched = timingSafeEqual(expected, given) || matched;
    return matched ? given.toString('hex') : null;
  } };
}
