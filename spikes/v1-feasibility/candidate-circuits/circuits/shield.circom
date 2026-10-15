pragma circom 2.1.6;
include "common.circom";

template Shield() {
    signal input asset;
    signal input amount;
    signal input origin;
    signal input commitment;
    signal input payloadDigest;
    signal input payloadTag;
    signal input owner;
    signal input rho;

    asset * (asset - 1) === 0;
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;
    component note = NoteCommitment();
    note.asset <== asset;
    note.amount <== amount;
    note.owner <== owner;
    note.origin <== origin;
    note.rho <== rho;
    note.out === commitment;
    component payloadAuth = Poseidon(4);
    payloadAuth.inputs[0] <== 105;
    payloadAuth.inputs[1] <== rho;
    payloadAuth.inputs[2] <== payloadDigest;
    payloadAuth.inputs[3] <== commitment;
    payloadAuth.out === payloadTag;
}

component main {public [asset, amount, origin, commitment, payloadDigest, payloadTag]} = Shield();
