import { createRelayerHandler } from '../services/relayer/src/http.mjs';
import { createRuntime } from '../services/relayer/src/runtime.mjs';

// Transaction access is off until the release gates are met and an operator
// explicitly enables it. Missing configuration fails closed.
const handler = createRelayerHandler({
  siteOrigin: process.env.WHIRLPOOL_SITE_ORIGIN ?? 'https://invalid.example',
  runtime: () => createRuntime(process.env),
});

export default { fetch: handler };
