pragma circom 2.1.6;
include "action.circom";
component main {public [asset, noteRoot, approvedRoot, nullifier, paymentCommitment, changeCommitment, payoutAmount, recipientLo, recipientHi, fee, payloadDigest, payloadTag]} = PrivateAction(1, 0, 20, 20);
