pragma circom 2.1.6;

include "common.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// mode=0: private transfer (payment plus optional change).
// mode=1: private withdrawal (public payout plus optional change).
// N is fixed at compile time, so 1 and 2 inputs are measured separately.
template PrivateAction(N, mode, noteDepth, approvalDepth) {
    signal input asset;
    signal input noteRoot;
    signal input approvedRoot;
    signal input nullifier[N];
    signal input paymentCommitment;
    signal input changeCommitment;
    signal input payoutAmount;
    signal input recipientLo;
    signal input recipientHi;
    signal input fee;
    // Truncated SHA-256 of the exact instruction payload, bound to the
    // spending witness so an untrusted relayer cannot replace ciphertext.
    signal input payloadDigest;
    signal input payloadTag;

    signal input origin;
    signal input amount[N];
    signal input ownerSecret[N];
    signal input rho[N];
    signal input noteSiblings[N][noteDepth];
    signal input noteBits[N][noteDepth];
    signal input approvalSiblings[approvalDepth];
    signal input approvalBits[approvalDepth];
    signal input paymentAmount;
    signal input paymentOwner;
    signal input paymentRho;
    signal input changeAmount;
    signal input changeOwner;
    signal input changeRho;

    asset * (asset - 1) === 0;
    component spends[N];
    component nonzeroInputs[N];
    signal sum[N + 1];
    sum[0] <== 0;
    for (var i = 0; i < N; i++) {
        spends[i] = NoteSpend(noteDepth);
        spends[i].asset <== asset;
        spends[i].amount <== amount[i];
        spends[i].ownerSecret <== ownerSecret[i];
        spends[i].origin <== origin;
        spends[i].rho <== rho[i];
        for (var j = 0; j < noteDepth; j++) {
            spends[i].siblings[j] <== noteSiblings[i][j];
            spends[i].bits[j] <== noteBits[i][j];
        }
        spends[i].root === noteRoot;
        spends[i].nullifier === nullifier[i];
        nonzeroInputs[i] = IsZero();
        nonzeroInputs[i].in <== amount[i];
        nonzeroInputs[i].out === 0;
        sum[i + 1] <== sum[i] + amount[i];
    }
    if (N == 2) {
        component distinctNullifiers = IsZero();
        distinctNullifiers.in <== nullifier[0] - nullifier[1];
        distinctNullifiers.out === 0;
    }
    component payloadAuth = Poseidon(4);
    payloadAuth.inputs[0] <== 105;
    payloadAuth.inputs[1] <== ownerSecret[0];
    payloadAuth.inputs[2] <== payloadDigest;
    payloadAuth.inputs[3] <== nullifier[0];
    payloadAuth.out === payloadTag;

    component approval = ApprovedOrigin(approvalDepth);
    approval.origin <== origin;
    for (var i = 0; i < approvalDepth; i++) {
        approval.siblings[i] <== approvalSiblings[i];
        approval.bits[i] <== approvalBits[i];
    }
    approval.root === approvedRoot;

    component feeBits = Num2Bits(64);
    component paymentBits = Num2Bits(64);
    component changeBits = Num2Bits(64);
    component payoutBits = Num2Bits(64);
    component recipientLoBits = Num2Bits(128);
    component recipientHiBits = Num2Bits(128);
    feeBits.in <== fee;
    paymentBits.in <== paymentAmount;
    changeBits.in <== changeAmount;
    payoutBits.in <== payoutAmount;
    recipientLoBits.in <== recipientLo;
    recipientHiBits.in <== recipientHi;
    sum[N] === paymentAmount + changeAmount + payoutAmount + fee;

    component payment = NoteCommitment();
    payment.asset <== asset;
    payment.amount <== paymentAmount;
    payment.owner <== paymentOwner;
    payment.origin <== origin;
    payment.rho <== paymentRho;
    component change = NoteCommitment();
    change.asset <== asset;
    change.amount <== changeAmount;
    change.owner <== changeOwner;
    change.origin <== origin;
    change.rho <== changeRho;
    change.out === changeCommitment;

    if (mode == 0) {
        payoutAmount === 0;
        recipientLo === 0;
        recipientHi === 0;
        payment.out === paymentCommitment;
        component paymentNonzero = IsZero();
        paymentNonzero.in <== paymentAmount;
        paymentNonzero.out === 0;
    } else {
        paymentAmount === 0;
        paymentCommitment === 0;
        component payoutNonzero = IsZero();
        payoutNonzero.in <== payoutAmount;
        payoutNonzero.out === 0;
    }
}
