import { FIRST_ORIGIN, rootFromWitness } from '@whirlpool/approval-tree/src/index.js';

const U64 = (1n << 64n) - 1n;
const be32 = value => Uint8Array.from(BigInt(value).toString(16).padStart(64, '0').match(/../g),
  pair => parseInt(pair, 16));

// Build from independent finalized-history replay, never an opaque ASP root.
// The operator must re-read state and simulate immediately before signing.
export function prepareApprovalUpdate(state, originValue, approved) {
  const origin = BigInt(originValue);
  if (typeof approved !== 'boolean' || origin < FIRST_ORIGIN || origin > U64 ||
      typeof state?.origin !== 'bigint' || origin >= state.origin)
    throw new Error('Invalid issued origin or approval status');
  if (!state.approvalTree || state.approvalTree.root !== state.approvedRoot)
    throw new Error('Approval replay does not match authenticated pool');
  if (state.approvalTree.isApproved(origin) === approved)
    throw new Error('Approval status unchanged');
  const witness = state.approvalTree.witness(origin);
  if (rootFromWitness(origin, !approved, witness.siblings) !== state.approvedRoot)
    throw new Error('Approval witness does not match current root');
  const data = new Uint8Array(650);
  data[0] = 1;
  new DataView(data.buffer).setBigUint64(1, origin, true);
  data[9] = Number(approved);
  witness.siblings.forEach((sibling, index) => data.set(be32(sibling), 10 + index * 32));
  return { data, origin, approved, currentRoot: state.approvedRoot };
}

export function prepareGuardianPause(state, paused) {
  if (typeof paused !== 'boolean' || typeof state?.paused !== 'boolean' || state.paused === paused)
    throw new Error('Pause state unchanged or unavailable');
  return { data: Uint8Array.of(2, Number(paused)), paused };
}
