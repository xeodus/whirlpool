use litesvm::LiteSVM;
use solana_address::Address;
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::fs;

fn submit(svm: &mut LiteSVM, payer: &Keypair, program_id: Address, data: Vec<u8>) -> bool {
    let ix = Instruction {
        program_id,
        accounts: vec![],
        data,
    };
    let budget = ComputeBudgetInstruction::set_compute_unit_limit(1_400_000);
    let msg = Message::new(&[budget, ix], Some(&payer.pubkey()));
    let tx = Transaction::new(&[payer], msg, svm.latest_blockhash());
    match svm.send_transaction(tx) {
        Ok(meta) => {
            println!("verified_cu={}", meta.compute_units_consumed);
            true
        }
        Err(error) => {
            println!("rejected={error:?}");
            false
        }
    }
}

#[test]
fn browser_compatible_proof_and_tampering() {
    let mut svm = LiteSVM::new();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    let program_id = Address::new_unique();
    svm.add_program_from_file(program_id, "target/deploy/whirlpool_gate_01_verifier.so")
        .expect("build with NO_DNA=1 cargo build-sbf first");

    let bytes = fs::read("../generated/node-instruction.bin").expect("npm run encode first");
    assert_eq!(bytes.len(), 288);
    assert!(submit(&mut svm, &payer, program_id, bytes.clone()));

    let mut wrong_input = bytes.clone();
    wrong_input[287] ^= 1;
    assert!(!submit(&mut svm, &payer, program_id, wrong_input));

    let mut wrong_proof = bytes.clone();
    wrong_proof[0] ^= 1;
    assert!(!submit(&mut svm, &payer, program_id, wrong_proof));

    let mut extra = bytes.clone();
    extra.push(0);
    assert!(!submit(&mut svm, &payer, program_id, extra));

    let browser_fixture = fs::read("../generated/browser-instruction.bin");
    if std::env::var_os("REQUIRE_BROWSER_FIXTURE").is_some() {
        assert!(submit(
            &mut svm,
            &payer,
            program_id,
            browser_fixture.expect(
                "run npm run serve, prove in a browser, then node scripts/encode.mjs browser"
            )
        ));
    } else if let Ok(browser_bytes) = browser_fixture {
        assert!(submit(&mut svm, &payer, program_id, browser_bytes));
    }
}
