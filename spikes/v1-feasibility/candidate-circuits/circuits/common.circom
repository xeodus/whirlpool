pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Research domain tags only. These are not a frozen Whirlpool hash specification.
template NoteCommitment() {
    signal input asset;
    signal input amount;
    signal input owner;
    signal input origin;
    signal input rho;
    signal output out;

    component head = Poseidon(4);
    head.inputs[0] <== 101;
    head.inputs[1] <== asset;
    head.inputs[2] <== amount;
    head.inputs[3] <== owner;

    component tail = Poseidon(3);
    tail.inputs[0] <== head.out;
    tail.inputs[1] <== origin;
    tail.inputs[2] <== rho;
    out <== tail.out;
}

template MerklePath(depth) {
    signal input leaf;
    signal input siblings[depth];
    signal input bits[depth];
    signal output root;

    signal level[depth + 1];
    level[0] <== leaf;
    component hashes[depth];
    for (var i = 0; i < depth; i++) {
        bits[i] * (bits[i] - 1) === 0;
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== level[i] + bits[i] * (siblings[i] - level[i]);
        hashes[i].inputs[1] <== siblings[i] + bits[i] * (level[i] - siblings[i]);
        level[i + 1] <== hashes[i].out;
    }
    root <== level[depth];
}

template NoteSpend(depth) {
    signal input asset;
    signal input amount;
    signal input ownerSecret;
    signal input origin;
    signal input rho;
    signal input siblings[depth];
    signal input bits[depth];
    signal output root;
    signal output nullifier;

    component amountBits = Num2Bits(64);
    amountBits.in <== amount;

    component owner = Poseidon(2);
    owner.inputs[0] <== 102;
    owner.inputs[1] <== ownerSecret;

    component note = NoteCommitment();
    note.asset <== asset;
    note.amount <== amount;
    note.owner <== owner.out;
    note.origin <== origin;
    note.rho <== rho;

    component path = MerklePath(depth);
    path.leaf <== note.out;
    for (var i = 0; i < depth; i++) {
        path.siblings[i] <== siblings[i];
        path.bits[i] <== bits[i];
    }
    root <== path.root;

    component nf = Poseidon(4);
    nf.inputs[0] <== 103;
    nf.inputs[1] <== ownerSecret;
    nf.inputs[2] <== rho;
    nf.inputs[3] <== origin;
    nullifier <== nf.out;
}

template ApprovedOrigin(depth) {
    signal input origin;
    signal input siblings[depth];
    signal input bits[depth];
    signal output root;

    component leaf = Poseidon(2);
    leaf.inputs[0] <== 104;
    leaf.inputs[1] <== origin;

    component path = MerklePath(depth);
    path.leaf <== leaf.out;
    for (var i = 0; i < depth; i++) {
        path.siblings[i] <== siblings[i];
        path.bits[i] <== bits[i];
    }
    root <== path.root;
}
