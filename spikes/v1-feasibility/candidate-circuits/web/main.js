const status = document.getElementById('status');
const start = document.getElementById('start');
const params = new URLSearchParams(location.search);
const allowed = new Set(['shield', 'transfer_one', 'transfer_two', 'withdraw_one', 'withdraw_two', 'public_exit']);
const circuit = params.get('circuit') || 'transfer_one';
const runs = Number(params.get('runs') || '3');
async function progress(stage) {
  try {
    await fetch('/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ circuit, stage, at: Date.now() }),
    });
  } catch { /* The visible status remains the primary feedback. */ }
}

async function fetchBytes(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot fetch ${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot fetch ${path}: ${response.status}`);
  return response.json();
}

start.addEventListener('click', async () => {
  if (!allowed.has(circuit) || !Number.isInteger(runs) || runs < 1 || runs > 100) {
    status.textContent = 'Choose a supported circuit and 1 to 100 runs.';
    return;
  }
  start.disabled = true;
  try {
    status.textContent = 'Loading test artifacts…';
    await progress('loading');
    const fetchStart = performance.now();
    const [wasm, zkey, input, vk] = await Promise.all([
      fetchBytes(`/wasm/${circuit}`),
      fetchBytes(`/zkey/${circuit}`),
      fetchJson(`/input/${circuit}`),
      fetchJson(`/vk/${circuit}`),
    ]);
    const artifactLoadMs = performance.now() - fetchStart;
    await progress('loaded');
    const timesMs = [];
    let finalProof;
    let finalPublicSignals;
    for (let i = 0; i < runs; i++) {
      status.textContent = `Generating ${circuit} proof ${i + 1} of ${runs}…`;
      await progress(`proving ${i + 1}`);
      const started = performance.now();
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input, `/wasm/${circuit}`, `/zkey/${circuit}`);
      timesMs.push(performance.now() - started);
      if (!await snarkjs.groth16.verify(vk, publicSignals, proof)) {
        throw new Error(`Proof ${i + 1} failed local verification`);
      }
      await progress(`verified ${i + 1}`);
      finalProof = proof;
      finalPublicSignals = publicSignals;
    }
    const result = {
      circuit,
      userAgent: navigator.userAgent,
      artifactLoadMs,
      wasmBytes: wasm.byteLength,
      zkeyBytes: zkey.byteLength,
      timesMs,
      // Chromium-only approximation; do not treat it as total process memory.
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      proof: finalProof,
      publicSignals: finalPublicSignals,
    };
    const response = await fetch('/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (!response.ok) throw new Error('Could not save local result');
    const warm = timesMs.slice(1);
    status.textContent = `Saved ${circuit}: artifact load ${Math.round(artifactLoadMs)} ms; first proof ${Math.round(timesMs[0])} ms; warm proofs ${warm.map(Math.round).join(', ')} ms.`;
  } catch (error) {
    status.textContent = `Failed: ${error.message}`;
    await progress(`failed: ${error.message}`);
  } finally {
    start.disabled = false;
  }
});

if (params.has('autorun')) start.click();
