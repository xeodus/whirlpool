use litesvm::LiteSVM;
use solana_address::Address;
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::fs;

fn submit(svm: &mut LiteSVM, payer: &Keypair, program_id: Address, data: Vec<u8>) -> Option<u64> {
    let ix = Instruction {
        program_id,
        accounts: vec![],
        data,
    };
    let budget = ComputeBudgetInstruction::set_compute_unit_limit(1_400_000);
    let msg = Message::new(&[budget, ix], Some(&payer.pubkey()));
    let tx = Transaction::new(&[payer], msg, svm.latest_blockhash());
    println!(
        "legacy_wire_bytes={}",
        wincode::serialize(&tx).unwrap().len()
    );
    svm.send_transaction(tx)
        .ok()
        .map(|meta| meta.compute_units_consumed)
}

#[test]
fn full_transfer_proof_verifies_and_tampering_fails() {
    let mut svm = LiteSVM::new();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    let program_id = Address::new_unique();
    svm.add_program_from_file(
        program_id,
        "target/deploy/whirlpool_candidate_transfer_verifier.so",
    )
    .expect("run NO_DNA=1 cargo build-sbf first");

    let node = fs::read("../generated/transfer_one_instruction.bin").unwrap();
    let browser = fs::read("../generated/transfer_one_browser_instruction.bin").unwrap();
    assert_eq!(node.len(), 640);
    assert_eq!(browser.len(), 640);
    println!(
        "node_cu={}",
        submit(&mut svm, &payer, program_id, node.clone()).unwrap()
    );
    println!(
        "browser_cu={}",
        submit(&mut svm, &payer, program_id, browser).unwrap()
    );

    let mut wrong_public = node.clone();
    wrong_public[639] ^= 1;
    assert!(submit(&mut svm, &payer, program_id, wrong_public).is_none());
    let mut wrong_proof = node.clone();
    wrong_proof[0] ^= 1;
    assert!(submit(&mut svm, &payer, program_id, wrong_proof).is_none());
    let mut extra = node.clone();
    extra.push(0);
    assert!(submit(&mut svm, &payer, program_id, extra).is_none());

    // Same public-input count, different statement and VK.
    let withdraw = fs::read("../generated/withdraw_one_instruction.bin").unwrap();
    assert_eq!(withdraw.len(), 640);
    assert!(submit(&mut svm, &payer, program_id, withdraw).is_none());
}
