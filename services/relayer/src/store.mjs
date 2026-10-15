// Redis EVAL is one atomic operation across concurrent serverless instances.
// A signed transaction is saved before sendTransaction is called. Intent keys
// outlive any recent blockhash; duplicate requests never trigger another send.
export const CLAIM_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {0, existing} end
local count = tonumber(redis.call('GET', KEYS[2]) or '0')
if count >= tonumber(ARGV[2]) then return {-1, ''} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
if count == 0 then
  redis.call('SET', KEYS[2], 1, 'EX', 86400)
else
  redis.call('INCR', KEYS[2])
end
return {1, ARGV[1]}
`;

const INVITE_ID = /^[0-9a-f]{64}$/;
const INTENT_ID = /^[0-9a-f-]{36}$/i;

export function createIntentStore(redis, { prefix = 'whirlpool:devnet:relayer',
  maxActionsPerDay = 20, retentionSeconds = 7 * 86400 } = {}) {
  if (!redis || typeof redis.get !== 'function' || typeof redis.eval !== 'function')
    throw new Error('A durable Redis client is required');
  if (!/^[a-z0-9:-]{1,64}$/.test(prefix) ||
      !Number.isSafeInteger(maxActionsPerDay) || maxActionsPerDay < 1 || maxActionsPerDay > 100 ||
      !Number.isSafeInteger(retentionSeconds) || retentionSeconds < 86400)
    throw new Error('Invalid relayer store limits');
  const keys = (inviteId, intentId) => {
    if (!INVITE_ID.test(inviteId) || !INTENT_ID.test(intentId)) throw new Error('Invalid relayer identity');
    return [`${prefix}:intent:${inviteId}:${intentId}`, `${prefix}:quota:${inviteId}`];
  };
  return {
    async lookup(inviteId, intentId) {
      const [key] = keys(inviteId, intentId);
      const value = await redis.get(key);
      return value == null ? null : typeof value === 'string' ? JSON.parse(value) : value;
    },
    async claim(record) {
      const claimKeys = keys(record.inviteId, record.intentId);
      const serialized = JSON.stringify(record);
      const result = await redis.eval(CLAIM_SCRIPT, claimKeys,
        [serialized, maxActionsPerDay, retentionSeconds]);
      if (!Array.isArray(result) || result.length !== 2 || ![-1, 0, 1].includes(Number(result[0])))
        throw new Error('Unexpected durable store response');
      if (Number(result[0]) === -1) throw new Error('Invitation daily relayer limit reached');
      const value = result[1];
      return { created: Number(result[0]) === 1,
        record: typeof value === 'string' ? JSON.parse(value) : value };
    },
  };
}
