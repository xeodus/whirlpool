// Minimal Upstash REST transport. Keeping Redis's wire commands explicit avoids
// accidental SDK serialization changes for the atomic EVAL response.
export function createRedisRest({ url, token, fetchImpl = fetch }) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.upstash.io') ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new Error('Expected an HTTPS Upstash Redis endpoint');
  if (typeof token !== 'string' || token.length < 20) throw new Error('Missing Redis token');
  const command = async values => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Redis request failed (${response.status})`);
    const result = await response.json();
    if (!result || Object.hasOwn(result, 'error') || !Object.hasOwn(result, 'result'))
      throw new Error('Redis command failed');
    return result.result;
  };
  return {
    get: key => command(['GET', key]),
    eval: (script, keys, args) => command(['EVAL', script, keys.length, ...keys, ...args]),
  };
}
