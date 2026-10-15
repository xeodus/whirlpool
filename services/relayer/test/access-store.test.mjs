import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvitations, tokenDigest } from '../src/access.mjs';
import { createIntentStore } from '../src/store.mjs';
import { createRedisRest } from '../src/redis-rest.mjs';

test('invitation config accepts only matching hash and keeps token out of the key', async () => {
  const token = 'a'.repeat(32), digest = tokenDigest(token);
  const invites = createInvitations(digest);
  assert.equal(await invites.authenticate(token), digest);
  assert.equal(await invites.authenticate('b'.repeat(32)), null);
  assert.equal(await invites.authenticate('short'), null);
  assert.throws(() => createInvitations('plaintext-token'), /digest/);
});

test('atomic claim returns original signed intent and enforces quota', async () => {
  const values = new Map();
  const redis = {
    get: async key => values.get(key) ?? null,
    eval: async (_, [intentKey, quotaKey], [serialized, limit]) => {
      if (values.has(intentKey)) return [0, values.get(intentKey)];
      const count = values.get(quotaKey) ?? 0;
      if (count >= limit) return [-1, ''];
      values.set(intentKey, serialized);
      values.set(quotaKey, count + 1);
      return [1, serialized];
    },
  };
  const store = createIntentStore(redis, { maxActionsPerDay: 1 });
  const first = { inviteId: 'a'.repeat(64), intentId: '894e93db-8c32-4af4-b86e-36590c4e2bf3',
    signature: 'sig', requestHash: 'b'.repeat(64) };
  assert.equal((await store.claim(first)).created, true);
  assert.equal((await store.claim({ ...first, signature: 'other' })).record.signature, 'sig');
  assert.equal((await store.lookup(first.inviteId, first.intentId)).signature, 'sig');
  await assert.rejects(store.claim({ ...first, intentId: 'e4ef3409-2872-4aa1-9823-9d3282bca7bc' }), /limit/);
});

test('Redis transport sends EVAL in one authenticated request and rejects bad endpoints', async () => {
  const calls = [];
  const redis = createRedisRest({ url: 'https://sample.upstash.io', token: 'x'.repeat(20),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, json: async () => ({ result: [1, 'record'] }) };
    } });
  assert.deepEqual(await redis.eval('return 1', ['a', 'b'], ['c']), [1, 'record']);
  assert.deepEqual(JSON.parse(calls[0].options.body), ['EVAL', 'return 1', 2, 'a', 'b', 'c']);
  assert.throws(() => createRedisRest({ url: 'http://localhost:6379', token: 'x'.repeat(20) }), /HTTPS/);
});
