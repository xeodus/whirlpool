import { readPrivateActionStatus, submitPrivateAction } from './core.mjs';

const MAX_BODY_BYTES = 8192;
const fail = (status, message) => Response.json({ error: message },
  { status, headers: { 'Cache-Control': 'no-store' } });

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) throw new Error('Request exceeds size limit');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
}

export function createRelayerHandler({ siteOrigin, runtime }) {
  const expectedOrigin = new URL(siteOrigin).origin;
  return async request => {
    if (request.method !== 'POST') return fail(405, 'Use POST');
    if (request.headers.get('Origin') !== expectedOrigin) return fail(403, 'Origin not allowed');
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
      return fail(415, 'Use JSON');
    let body;
    try { body = await readBody(request); }
    catch { return fail(400, 'Invalid request body'); }
    const encoded = body?.instruction;
    if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      return fail(400, 'Invalid public instruction');
    const data = Uint8Array.from(Buffer.from(encoded, 'base64'));
    if (data.length < 1 || data.length > 4096 || Buffer.from(data).toString('base64') !== encoded)
      return fail(400, 'Invalid public instruction');
    try {
      const result = await submitPrivateAction({ inviteToken: body.invitation,
        intentId: body.intentId, data }, await runtime());
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/Invitation|intent ID|public proof instruction|private actions only|Unexpected private action fee|Invalid private action payout|different data|daily relayer limit/.test(message))
        return fail(400, message);
      return fail(503, 'Relayer unavailable; check the intent status before retrying');
    }
  };
}

export function createStatusHandler({ siteOrigin, runtime }) {
  const expectedOrigin = new URL(siteOrigin).origin;
  return async request => {
    if (request.method !== 'POST') return fail(405, 'Use POST');
    if (request.headers.get('Origin') !== expectedOrigin) return fail(403, 'Origin not allowed');
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
      return fail(415, 'Use JSON');
    let body;
    try { body = await readBody(request); }
    catch { return fail(400, 'Invalid request body'); }
    try {
      const result = await readPrivateActionStatus({ inviteToken: body?.invitation,
        intentId: body?.intentId }, await runtime());
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/Invitation|intent ID/.test(message)) return fail(400, message);
      return fail(503, 'Relayer status unavailable');
    }
  };
}
