import { createStatusHandler } from '../services/relayer/src/http.mjs';
import { createRuntime } from '../services/relayer/src/runtime.mjs';

const handler = createStatusHandler({
  siteOrigin: process.env.WHIRLPOOL_SITE_ORIGIN ?? 'https://invalid.example',
  runtime: () => createRuntime(process.env),
});

export default { fetch: handler };
