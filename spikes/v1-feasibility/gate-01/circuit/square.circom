pragma circom 2.1.6;

// Interoperability smoke test only. This does not encode a Whirlpool note.
template Square() {
    signal input secret;
    signal output square;
    square <== secret * secret;
}

component main = Square();
