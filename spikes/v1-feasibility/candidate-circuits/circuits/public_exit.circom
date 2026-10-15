pragma circom 2.1.6;
include "common.circom";

template PublicExit(depth) {
    signal input asset;
    signal input noteRoot;
    signal input nullifier;
    signal input origin;
    signal input exitAmount;
    signal input recipientLo;
    signal input recipientHi;
    signal input ownerSecret;
    signal input rho;
    signal input siblings[depth];
    signal input bits[depth];

    asset * (asset - 1) === 0;
    component loBits = Num2Bits(128);
    component hiBits = Num2Bits(128);
    loBits.in <== recipientLo;
    hiBits.in <== recipientHi;

    component spend = NoteSpend(depth);
    spend.asset <== asset;
    spend.amount <== exitAmount;
    spend.ownerSecret <== ownerSecret;
    spend.origin <== origin;
    spend.rho <== rho;
    for (var i = 0; i < depth; i++) {
        spend.siblings[i] <== siblings[i];
        spend.bits[i] <== bits[i];
    }
    spend.root === noteRoot;
    spend.nullifier === nullifier;
}

component main {public [asset, noteRoot, nullifier, origin, exitAmount, recipientLo, recipientHi]} = PublicExit(20);
