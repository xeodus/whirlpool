use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_poseidon::{hashv, Endianness, Parameters};
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::fs;
use whirlpool_devnet_sol_pool::POOL_SIZE;

fn meta(key: Address, signer: bool, writable: bool) -> AccountMeta {
    if writable {
        AccountMeta::new(key, signer)
    } else {
        AccountMeta::new_readonly(key, signer)
    }
}
fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ix: Instruction,
    others: &[&Keypair],
) -> Result<(), String> {
    svm.expire_blockhash();
    let message = Message::new(&[ix], Some(&payer.pubkey()));
    let mut signers = vec![payer];
    signers.extend_from_slice(others);
    let tx = Transaction::new(&signers, message, svm.latest_blockhash());
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}
fn approval_update(origin: u64, approved: bool) -> Vec<u8> {
    let mut data = vec![1];
    data.extend(origin.to_le_bytes());
    data.push(u8::from(approved));
    let mut zero = [0u8; 32];
    for _ in 0..20 {
        data.extend(zero);
        zero = hashv(Parameters::Bn254X5, Endianness::BigEndian, &[&zero, &zero])
            .unwrap()
            .to_bytes();
    }
    data
}
fn candidate(name: &str) -> Vec<u8> {
    fs::read(format!(
        "../../spikes/v1-feasibility/candidate-circuits/generated/{name}"
    ))
    .unwrap()
}

#[test]
fn asp_updates_are_authenticated_and_replayable_after_shield() {
    let mut svm = LiteSVM::new();
    let program = Address::new_unique();
    let pool = Address::new_unique();
    let payer = Keypair::new();
    let asp = Keypair::new();
    let guardian = Keypair::new();
    svm.add_program_from_file(program, "target/deploy/whirlpool_devnet_sol_pool.so")
        .unwrap();
    for key in [&payer, &asp, &guardian] {
        svm.airdrop(&key.pubkey(), 1_000_000_000).unwrap();
    }
    let rent = svm.minimum_balance_for_rent_exemption(POOL_SIZE);
    svm.set_account(
        pool,
        Account {
            lamports: rent,
            data: vec![0; POOL_SIZE],
            owner: program,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
    let ix = |accounts, data| Instruction {
        program_id: program,
        accounts,
        data,
    };
    send(
        &mut svm,
        &payer,
        ix(
            vec![
                meta(pool, false, true),
                meta(asp.pubkey(), true, false),
                meta(guardian.pubkey(), true, false),
            ],
            vec![0],
        ),
        &[&asp, &guardian],
    )
    .unwrap();

    let accounts = vec![meta(pool, false, true), meta(asp.pubkey(), true, false)];
    assert!(send(
        &mut svm,
        &payer,
        ix(accounts.clone(), approval_update(55, true)),
        &[&asp]
    )
    .is_err());

    let proof = candidate("shield_instruction.bin");
    let payload = candidate("shield_payload.bin");
    let mut shield = vec![3];
    shield.extend(proof);
    shield.extend((payload.len() as u16).to_le_bytes());
    shield.extend(payload);
    send(
        &mut svm,
        &payer,
        ix(
            vec![
                meta(pool, false, true),
                meta(payer.pubkey(), true, true),
                meta(Address::default(), false, false),
            ],
            shield,
        ),
        &[],
    )
    .unwrap();

    let malformed = vec![1; 33];
    assert!(send(&mut svm, &payer, ix(accounts.clone(), malformed), &[&asp]).is_err());
    let mut bad_path = approval_update(55, true);
    bad_path[10] ^= 1;
    assert!(send(&mut svm, &payer, ix(accounts.clone(), bad_path), &[&asp]).is_err());
    let wrong_accounts = vec![
        meta(pool, false, true),
        meta(guardian.pubkey(), true, false),
    ];
    assert!(send(
        &mut svm,
        &payer,
        ix(wrong_accounts, approval_update(55, true)),
        &[&guardian]
    )
    .is_err());
    send(
        &mut svm,
        &payer,
        ix(accounts.clone(), approval_update(55, true)),
        &[&asp],
    )
    .unwrap();
    let approved_root: [u8; 32] = svm.get_account(&pool).unwrap().data[78..110]
        .try_into()
        .unwrap();
    assert_ne!(approved_root, [0; 32]);
    assert!(send(
        &mut svm,
        &payer,
        ix(accounts.clone(), approval_update(55, true)),
        &[&asp]
    )
    .is_err());
    send(
        &mut svm,
        &payer,
        ix(accounts, approval_update(55, false)),
        &[&asp],
    )
    .unwrap();
    let revoked_root: [u8; 32] = svm.get_account(&pool).unwrap().data[78..110]
        .try_into()
        .unwrap();
    assert_ne!(approved_root, revoked_root);
}
