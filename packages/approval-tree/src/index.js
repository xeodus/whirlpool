import { poseidon2 } from 'poseidon-lite';

// Candidate-circuit-compatible test tree. A leaf is either zero or the
// domain-separated hash of its program-assigned origin. The index is origin.
export const DEPTH = 20;
export const MAX_ORIGIN = 1 << DEPTH;
export const FIRST_ORIGIN = 55n; // candidate proof fixture compatibility
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const hash = (left, right) => poseidon2([left, right]);
export const EMPTY = [0n];
for (let level = 0; level < DEPTH; level++) EMPTY.push(hash(EMPTY[level], EMPTY[level]));

export function originIndex(origin) {
  const value = typeof origin === 'bigint' ? origin : BigInt(origin);
  if (value < FIRST_ORIGIN || value >= FIRST_ORIGIN + BigInt(MAX_ORIGIN))
    throw new RangeError('Origin outside approval tree');
  return Number(value - FIRST_ORIGIN);
}

export function approvalLeaf(origin, approved) {
  originIndex(origin);
  return approved ? hash(104n, BigInt(origin)) : 0n;
}

export function rootFromWitness(origin, approved, siblings) {
  let position = originIndex(origin);
  if (!Array.isArray(siblings) || siblings.length !== DEPTH) throw new Error('Invalid approval path');
  let node = approvalLeaf(origin, approved);
  for (const rawSibling of siblings) {
    const sibling = BigInt(rawSibling);
    if (sibling < 0n || sibling >= FIELD) throw new Error('Noncanonical approval sibling');
    node = position & 1 ? hash(sibling, node) : hash(node, sibling);
    position >>= 1;
  }
  return node;
}

export class ApprovalTree {
  #levels = Array.from({ length: DEPTH + 1 }, () => new Map());
  #approved = new Set();

  get root() { return this.#levels[DEPTH].get(0) ?? EMPTY[DEPTH]; }

  isApproved(origin) { return this.#approved.has(originIndex(origin)); }

  witness(origin) {
    let position = originIndex(origin);
    const siblings = [];
    for (let level = 0; level < DEPTH; level++) {
      siblings.push(this.#levels[level].get(position ^ 1) ?? EMPTY[level]);
      position >>= 1;
    }
    return { siblings, bits: Array.from({ length: DEPTH }, (_, level) => BigInt((originIndex(origin) >> level) & 1)), root: this.root };
  }

  // Replaying ordered finalized updates yields the same current root as the
  // program. Callers must compare it with the authenticated pool account.
  set(origin, approved) {
    if (typeof approved !== 'boolean') throw new TypeError('Approval must be boolean');
    const index = originIndex(origin);
    if (this.#approved.has(index) === approved) throw new Error('Approval status unchanged');
    const oldRoot = this.root;
    const path = this.witness(origin);
    if (rootFromWitness(origin, !approved, path.siblings) !== oldRoot)
      throw new Error('Approval tree witness mismatch');
    if (approved) this.#approved.add(index); else this.#approved.delete(index);
    let position = index;
    let node = approvalLeaf(origin, approved);
    if (node === EMPTY[0]) this.#levels[0].delete(position);
    else this.#levels[0].set(position, node);
    for (let level = 0; level < DEPTH; level++) {
      const pair = this.#levels[level];
      const left = pair.get(position & ~1) ?? EMPTY[level];
      const right = pair.get(position | 1) ?? EMPTY[level];
      position >>= 1;
      node = hash(left, right);
      if (node === EMPTY[level + 1]) this.#levels[level + 1].delete(position);
      else this.#levels[level + 1].set(position, node);
    }
    return { origin: BigInt(origin), approved, oldRoot, newRoot: this.root, siblings: path.siblings };
  }
}
