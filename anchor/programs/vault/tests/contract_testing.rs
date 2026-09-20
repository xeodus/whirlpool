use litesvm::LiteSVM;
use solana_sdk::{signature::Keypair, signer::Signer};

#[test]
fn create_account() {
    let mut svm = LiteSVM::new();
    let user = Keypair::new();

    svm.airdrop(&user.pubkey(), 1_000_000_000).unwrap();
    let balance = svm.get_balance(&user.pubkey()).unwrap();
    assert_eq!(balance, 1_000_000_000);

    println!("Account created with {} SOL", balance as f64 / 1e9);
}

#[test]
fn testing_deposits() {
    let mut svm = LiteSVM::new();
    let depositor = Keypair::new();
    let pool_vault = Keypair::new();

    svm.airdrop(&depositor.pubkey(), 1_000_000_000).unwrap();
    let balance = svm.get_balance(&depositor.pubkey()).unwrap();
    assert_eq!(balance, 1_000_000_000);
 
}
