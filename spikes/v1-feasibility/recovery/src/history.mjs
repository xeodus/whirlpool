import { poseidon2 } from 'poseidon-lite';
import { commitment, nullifier, recover, unpackOutputs } from './recovery.mjs';

// Decoder for the research pool's instruction ABI. This is deliberately not a V1 ABI.
const DEPTH = 20;
const POOL_SIZE = 2513;
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const zeros = [0n];
for (let i = 0; i < DEPTH; i++) zeros.push(poseidon2([zeros[i], zeros[i]]));
const field = (bytes, at) => BigInt(`0x${Array.from(bytes.subarray(at, at + 32), x => x.toString(16).padStart(2, '0')).join('')}`);
const little64 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(at, true);
const little32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function decode58(value) {
  if (typeof value !== 'string' || !value.length) throw new Error('Invalid base58');
  let n = 0n;
  for (const c of value) {
    const digit = alphabet.indexOf(c);
    if (digit < 0) throw new Error('Invalid base58');
    n = n * 58n + BigInt(digit);
  }
  const tail = [];
  while (n) { tail.unshift(Number(n & 255n)); n >>= 8n; }
  return Uint8Array.from([...Array(value.match(/^1*/)[0].length).fill(0), ...tail]);
}

class SparseTree {
  constructor() { this.levels = Array.from({ length: DEPTH + 1 }, () => new Map()); this.count = 0; }
  append(value) {
    if (this.count >= 1 << DEPTH) throw new Error('Tree full');
    let position = this.count++;
    this.levels[0].set(position, value);
    for (let level = 0; level < DEPTH; level++) {
      const nodes = this.levels[level];
      const parent = Math.floor(position / 2);
      this.levels[level + 1].set(parent, poseidon2([
        nodes.get(parent * 2) ?? zeros[level], nodes.get(parent * 2 + 1) ?? zeros[level],
      ]));
      position = parent;
    }
  }
  get root() { return this.levels[DEPTH].get(0) ?? zeros[DEPTH]; }
  path(index) {
    if (index < 0 || index >= this.count) throw new Error('Missing note leaf');
    let position = index;
    const siblings = [], bits = [];
    for (let level = 0; level < DEPTH; level++) {
      siblings.push(this.levels[level].get(position ^ 1) ?? zeros[level]);
      bits.push(BigInt(position & 1));
      position = Math.floor(position / 2);
    }
    return { root: this.root, siblings, bits };
  }
}

export function notePath(leaves, index) {
  const tree = new SparseTree();
  for (const leaf of leaves) tree.append(leaf);
  return tree.path(index);
}

// The test ASP approves exactly one origin at position zero. Arbitrary
// approval trees need published leaf changes or a separate durable witness.
export function singletonApprovalRoot(origin) {
  return notePath([poseidon2([104n, BigInt(origin)])], 0).root;
}
export function singletonApprovalWitness(history, origin) {
  const witness = notePath([poseidon2([104n, BigInt(origin)])], 0);
  if (witness.root !== history.approvedRoot) throw new Error('Approval witness unavailable from public history');
  return witness;
}

function proofSignals(bytes, count) {
  if (bytes.length < 1 + 256 + count * 32) throw new Error('Truncated proof instruction');
  return Array.from({ length: count }, (_, i) => field(bytes, 1 + 256 + i * 32));
}

function payload(bytes, count) {
  const at = 1 + 256 + count * 32;
  if (bytes.length < at + 2) throw new Error('Missing ciphertext payload');
  const length = bytes[at] | (bytes[at + 1] << 8);
  if (length < 32 || length > 1024 || at + 2 + length !== bytes.length) throw new Error('Bad payload length');
  return bytes.subarray(at + 2);
}

export function replayPoolInstructions(instructions) {
  let initialized = false, origin = 55n, approvedRoot = 0n, paused = false, asset = 0n;
  let mint = new Uint8Array(32), vault = new Uint8Array(32);
  const leaves = [], records = [], spent = new Set();
  const tree = new SparseTree();
  const recentRoots = [zeros[DEPTH]];
  const append = value => {
    leaves.push(value);
    tree.append(value);
    recentRoots.push(tree.root);
    if (recentRoots.length > 32) recentRoots.shift();
  };
  for (const bytes of instructions) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('Invalid instruction');
    const tag = bytes[0];
    if (tag === 0) {
      if (initialized || ![1, 66].includes(bytes.length)) throw new Error('Invalid pool initialization');
      initialized = true;
      asset = bytes.length === 66 ? 1n : 0n;
      if (asset === 1n) {
        if (bytes[1] !== 1) throw new Error('Invalid token pool initialization');
        mint = bytes.slice(2, 34);
        vault = bytes.slice(34, 66);
      }
    } else if (!initialized) throw new Error('Missing pool initialization');
    else if (tag === 1) {
      if (bytes.length !== 33) throw new Error('Invalid approval update');
      approvedRoot = field(bytes, 1);
    } else if (tag === 2) {
      if (bytes.length !== 2 || bytes[1] > 1) throw new Error('Invalid pause update');
      paused = bytes[1] === 1;
    } else if (tag === 3) {
      const signals = proofSignals(bytes, 6);
      if (signals[0] !== asset || signals[2] !== origin) throw new Error('Shield sequence mismatch');
      append(signals[3]);
      origin++;
      // The pool checks packed record shape and embedded commitment. The
      // independent reader also parses the record before attempting recovery.
      const encrypted = unpackOutputs(payload(bytes, 6));
      if (encrypted.length !== 1 || encrypted[0].commitment !== signals[3].toString(16).padStart(64, '0'))
        throw new Error('Shield ciphertext commitment mismatch');
      records.push(encrypted[0]);
    } else if (tag >= 4 && tag <= 7) {
      const two = tag === 5 || tag === 7;
      const count = two ? 13 : 12;
      const signals = proofSignals(bytes, count);
      if (signals[0] !== asset || !recentRoots.includes(signals[1]) || signals[2] !== approvedRoot)
        throw new Error('Action root or asset mismatch');
      const nullifiers = signals.slice(3, two ? 5 : 4);
      for (const nf of nullifiers) {
        if (spent.has(nf.toString())) throw new Error('Nullifier replay in history');
        spent.add(nf.toString());
      }
      const base = two ? 5 : 4;
      const outputs = tag <= 5 ? [signals[base], signals[base + 1]] : [signals[base + 1]];
      const encrypted = unpackOutputs(payload(bytes, count));
      if (encrypted.length !== outputs.length || encrypted.some((r, i) => r.commitment !== outputs[i].toString(16).padStart(64, '0')))
        throw new Error('Output ciphertext commitment mismatch');
      for (const output of outputs) append(output);
      records.push(...encrypted);
    } else if (tag === 8) {
      if (bytes.length !== 1 + 256 + 7 * 32) throw new Error('Invalid exit');
      const signals = proofSignals(bytes, 7);
      if (signals[0] !== asset || !recentRoots.includes(signals[1]) || spent.has(signals[2].toString()))
        throw new Error('Exit replay, unknown root or asset mismatch');
      spent.add(signals[2].toString());
    } else throw new Error('Unknown pool instruction');
    if (leaves.length >= 1 << DEPTH) throw new Error('Tree full');
  }
  if (!initialized) throw new Error('Pool initialization not found');
  return { leaves, records, spent, approvedRoot, paused, asset, mint, vault, origin,
    noteRoot: tree.root, tree };
}

async function rpc(url, method, params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result;
    } catch (error) {
      if (attempt === 3 || !['TimeoutError', 'TypeError'].includes(error.name)) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
}

// Standard Solana JSON RPC only. A complete history must reach initialization
// and match the current pool state; unavailable or pruned transactions fail closed.
export async function readPoolHistory(url, poolAddress, programAddress, { pageSize = 1000, concurrency = 8 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000 ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('Invalid scan limits');
  const signatures = [];
  const seen = new Set();
  let before;
  for (;;) {
    const page = await rpc(url, 'getSignaturesForAddress', [poolAddress,
      { limit: pageSize, commitment: 'finalized', ...(before ? { before } : {}) }]);
    if (!Array.isArray(page)) throw new Error('Invalid signature page');
    if (!page.length) break;
    for (const entry of page) {
      if (entry.confirmationStatus && entry.confirmationStatus !== 'finalized')
        throw new Error('Unfinalized history');
      if (seen.has(entry.signature)) throw new Error('Repeated history signature');
      seen.add(entry.signature);
      // Failed transactions do not mutate the pool; arbitrary senders can
      // submit them, so they cannot make recovery fail.
      if (!entry.err) signatures.push(entry.signature);
    }
    if (page.length < pageSize) break;
    before = page.at(-1).signature;
  }
  const instructions = [];
  const chronological = signatures.reverse();
  for (let offset = 0; offset < chronological.length; offset += concurrency) {
    const batch = chronological.slice(offset, offset + concurrency);
    const transactions = await Promise.all(batch.map(signature => rpc(url, 'getTransaction', [signature,
      { encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 1 }])));
    for (let i = 0; i < batch.length; i++) {
      const transaction = transactions[i];
      if (!transaction || transaction.meta?.err || !transaction.transaction?.message)
        throw new Error(`Missing transaction ${batch[i]}`);
      const message = transaction.transaction.message;
      const keys = [
        ...message.accountKeys.map(key => typeof key === 'string' ? key : key.pubkey),
        ...(transaction.meta?.loadedAddresses?.writable ?? []),
        ...(transaction.meta?.loadedAddresses?.readonly ?? []),
      ];
      if (!keys.includes(poolAddress)) throw new Error('Pool account absent from history transaction');
      const capture = ix => {
        if (keys[ix.programIdIndex] !== programAddress) return;
        if (!ix.accounts.some(i => keys[i] === poolAddress)) return;
        instructions.push(decode58(ix.data));
      };
      for (let top = 0; top < message.instructions.length; top++) {
        capture(message.instructions[top]);
        for (const group of transaction.meta?.innerInstructions ?? []) {
          if (group.index === top) for (const ix of group.instructions) capture(ix);
        }
      }
    }
  }
  const state = replayPoolInstructions(instructions);
  const current = await rpc(url, 'getAccountInfo', [poolAddress, { encoding: 'base64', commitment: 'finalized' }]);
  if (!current?.value || current.value.owner !== programAddress) throw new Error('Missing or wrong-owner pool account');
  const raw = Uint8Array.from(atob(current.value.data[0]), c => c.charCodeAt(0));
  if (raw.length !== POOL_SIZE || raw[0] !== 0x57) throw new Error('Unexpected pool state');
  if (little32(raw, 10) !== state.leaves.length || little64(raw, 2) !== state.origin ||
      BigInt(raw[2448]) !== state.asset || !equal(raw.subarray(2449, 2481), state.mint) ||
      !equal(raw.subarray(2481, 2513), state.vault) || field(raw, 110) !== state.noteRoot ||
      field(raw, 78) !== state.approvedRoot || Boolean(raw[1]) !== state.paused) {
    throw new Error('History does not reconstruct current pool state');
  }
  return { ...state, signatures: signatures.length };
}

export async function restoreFromHistory(history, account) {
  const found = await recover(history.records, account, history.spent);
  return found.map(item => {
    const leaf = commitment(item.note);
    const index = history.leaves.findIndex(value => value === leaf);
    if (index < 0) throw new Error('Recovered note absent from history tree');
    const witness = history.tree?.path(index) ?? notePath(history.leaves, index);
    if (witness.root !== history.noteRoot) throw new Error('Witness root mismatch');
    return { ...item, index, witness, nullifier: item.spendable ? nullifier(item.note, account.spendSecret) : undefined };
  });
}
