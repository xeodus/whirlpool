import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
import {
  getPoolErrorMessage,
  POOL_ERROR__DEPOSIT_TOO_SMALL,
  POOL_ERROR__INSUFFICIENT_VAULT_BALANCE,
  POOL_ERROR__INVALID_ROOT,
  POOL_ERROR__INVALID_VERIFIER,
  POOL_ERROR__NULLIFIER_SET_FULL,
  POOL_ERROR__NULLIFIER_USED,
  POOL_ERROR__RECIPIENT_MISMATCH,
  POOL_ERROR__TREE_FULL,
  type PoolError,
} from "../generated/pool";

const POOL_ERROR_CODES: Record<number, PoolError> = {
  [POOL_ERROR__TREE_FULL]: POOL_ERROR__TREE_FULL,
  [POOL_ERROR__INVALID_ROOT]: POOL_ERROR__INVALID_ROOT,
  [POOL_ERROR__NULLIFIER_USED]: POOL_ERROR__NULLIFIER_USED,
  [POOL_ERROR__DEPOSIT_TOO_SMALL]: POOL_ERROR__DEPOSIT_TOO_SMALL,
  [POOL_ERROR__NULLIFIER_SET_FULL]: POOL_ERROR__NULLIFIER_SET_FULL,
  [POOL_ERROR__RECIPIENT_MISMATCH]: POOL_ERROR__RECIPIENT_MISMATCH,
  [POOL_ERROR__INVALID_VERIFIER]: POOL_ERROR__INVALID_VERIFIER,
  [POOL_ERROR__INSUFFICIENT_VAULT_BALANCE]:
    POOL_ERROR__INSUFFICIENT_VAULT_BALANCE,
};

export function parseTransactionError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }

  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const poolError = POOL_ERROR_CODES[err.context.code];
    if (poolError !== undefined) {
      return getPoolErrorMessage(poolError);
    }
  }

  const message = getDeepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) {
      deepest = current.message;
    }
  }

  return deepest;
}
