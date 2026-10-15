// O7 — measure on-chain Groth16 verification compute units (LiteSVM 0.17).
//
// Loads the Sunspot verifier program built with our withdrawal VK, submits
// `proof || public_witness`, and prints the compute units consumed.
//
// Run: cargo run --quiet

use litesvm::LiteSVM;
use solana_address::Address;
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::fs;

fn main() {
    let mut svm = LiteSVM::new();

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let program_id = Address::new_unique();
    svm.add_program_from_file(program_id, "verifier_bin.so")
        .expect("load verifier_bin.so");

    let proof = fs::read("withdraw_feasibility.proof").expect("proof");
    let witness = fs::read("withdraw_feasibility.pw").expect("witness");
    println!("O7 proof_bytes={} witness_bytes={}", proof.len(), witness.len());

    let mut data = Vec::with_capacity(proof.len() + witness.len());
    data.extend_from_slice(&proof);
    data.extend_from_slice(&witness);

    let ix = Instruction { program_id, accounts: vec![], data };

    let cu = ComputeBudgetInstruction::set_compute_unit_limit(1_400_000);
    let msg = Message::new(&[cu, ix], Some(&payer.pubkey()));
    let tx = Transaction::new(&[&payer], msg, svm.latest_blockhash());

    match svm.send_transaction(tx) {
        Ok(meta) => {
            println!("O7_CU_CONSUMED={}", meta.compute_units_consumed);
            for l in &meta.logs {
                if l.contains("verified") || l.contains("Gnark") {
                    println!("O7_LOG: {l}");
                }
            }
        }
        Err(e) => println!("O7_FAILED={e:?}"),
    }
}
