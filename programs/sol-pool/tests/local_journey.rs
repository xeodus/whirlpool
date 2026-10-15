use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::{v1, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use std::{env, fs, path::PathBuf};
use whirlpool_devnet_sol_pool::POOL_SIZE;

fn meta(key: Address, signer: bool, writable: bool) -> AccountMeta {
    if writable {
        AccountMeta::new(key, signer)
    } else {
        AccountMeta::new_readonly(key, signer)
    }
}
fn instruction(program: Address, accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: program,
        accounts,
        data,
    }
}
fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ix: Instruction,
    others: &[&Keypair],
) -> Result<(), String> {
    svm.expire_blockhash();
    let config = v1::TransactionConfig::empty()
        .with_compute_unit_limit(1_400_000)
        .with_loaded_accounts_data_size_limit(64 * 1024 * 1024);
    let message = v1::Message::try_compile_with_config(
        &payer.pubkey(),
        &[ix],
        svm.latest_blockhash(),
        config,
    )
    .map_err(|error| format!("compile: {error:?}"))?;
    let mut signers = vec![payer];
    signers.extend_from_slice(others);
    let transaction = VersionedTransaction::try_new(VersionedMessage::V1(message), &signers)
        .map_err(|error| format!("sign: {error:?}"))?;
    svm.send_transaction(transaction)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}
fn signal(data: &[u8], index: usize) -> [u8; 32] {
    data[257 + index * 32..289 + index * 32].try_into().unwrap()
}
fn recipient(data: &[u8], lo: usize, hi: usize) -> Address {
    let mut bytes = [0; 32];
    bytes[..16].copy_from_slice(&signal(data, lo)[16..]);
    bytes[16..].copy_from_slice(&signal(data, hi)[16..]);
    Address::new_from_array(bytes)
}
fn marker(program: &Address, pool: &Address, nf: &[u8; 32]) -> Address {
    Address::find_program_address(&[b"nf", pool.as_ref(), nf], program).0
}

#[test]
#[ignore = "run the local-journey proof script and set WHIRLPOOL_LOCAL_JOURNEY_OUTPUT"]
fn two_origin_sol_custody_and_exit() {
    let output =
        PathBuf::from(env::var("WHIRLPOOL_LOCAL_JOURNEY_OUTPUT").expect("set output path"));
    let actions: Vec<Vec<u8>> = (0..10)
        .map(|index| fs::read(output.join(format!("{index:02}.bin"))).unwrap())
        .collect();
    let mut svm = LiteSVM::new();
    let program = Address::new_unique();
    let pool = Address::new_unique();
    let admin = Keypair::new();
    let depositor_b = Keypair::new();
    let relayer = Keypair::new();
    let asp = Keypair::new();
    let guardian = Keypair::new();
    svm.add_program_from_file(program, "target/deploy/whirlpool_devnet_sol_pool.so")
        .unwrap();
    for signer in [&admin, &depositor_b, &relayer, &asp, &guardian] {
        svm.airdrop(&signer.pubkey(), 1_000_000_000).unwrap();
    }
    let reserve = svm.minimum_balance_for_rent_exemption(POOL_SIZE);
    svm.set_account(
        pool,
        Account {
            lamports: reserve,
            data: vec![0; POOL_SIZE],
            owner: program,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
    send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(asp.pubkey(), true, false),
                meta(guardian.pubkey(), true, false),
            ],
            actions[0].clone(),
        ),
        &[&asp, &guardian],
    )
    .unwrap();

    send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(admin.pubkey(), true, true),
                meta(Address::default(), false, false),
            ],
            actions[1].clone(),
        ),
        &[],
    )
    .unwrap();
    send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(depositor_b.pubkey(), true, true),
                meta(Address::default(), false, false),
            ],
            actions[2].clone(),
        ),
        &[&depositor_b],
    )
    .unwrap();
    assert_eq!(svm.get_balance(&pool).unwrap() - reserve, 19_000_000);

    for index in [3, 4] {
        send(
            &mut svm,
            &admin,
            instruction(
                program,
                vec![meta(pool, false, true), meta(asp.pubkey(), true, false)],
                actions[index].clone(),
            ),
            &[&asp],
        )
        .unwrap();
    }
    let transfer_marker = marker(&program, &pool, &signal(&actions[5], 3));
    send(
        &mut svm,
        &relayer,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(relayer.pubkey(), true, true),
                meta(transfer_marker, false, true),
                meta(Address::default(), false, false),
            ],
            actions[5].clone(),
        ),
        &[],
    )
    .unwrap();
    assert_eq!(svm.get_balance(&pool).unwrap() - reserve, 18_000_000);

    let payout = recipient(&actions[6], 7, 8);
    svm.airdrop(&payout, 1_000_000).unwrap();
    let withdrawal_marker = marker(&program, &pool, &signal(&actions[6], 3));
    send(
        &mut svm,
        &relayer,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(relayer.pubkey(), true, true),
                meta(payout, false, true),
                meta(withdrawal_marker, false, true),
                meta(Address::default(), false, false),
            ],
            actions[6].clone(),
        ),
        &[],
    )
    .unwrap();
    assert_eq!(svm.get_balance(&payout).unwrap(), 4_000_000);
    assert_eq!(svm.get_balance(&pool).unwrap() - reserve, 14_000_000);

    send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![meta(pool, false, true), meta(asp.pubkey(), true, false)],
            actions[7].clone(),
        ),
        &[&asp],
    )
    .unwrap();
    send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(guardian.pubkey(), true, false),
            ],
            actions[8].clone(),
        ),
        &[&guardian],
    )
    .unwrap();
    assert!(send(
        &mut svm,
        &relayer,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(relayer.pubkey(), true, true),
                meta(transfer_marker, false, true),
                meta(Address::default(), false, false)
            ],
            actions[5].clone()
        ),
        &[]
    )
    .is_err());
    let exit_marker = marker(&program, &pool, &signal(&actions[9], 2));
    send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(admin.pubkey(), true, true),
                meta(payout, false, true),
                meta(exit_marker, false, true),
                meta(Address::default(), false, false),
            ],
            actions[9].clone(),
        ),
        &[],
    )
    .unwrap();
    assert_eq!(svm.get_balance(&payout).unwrap(), 6_000_000);
    assert_eq!(svm.get_balance(&pool).unwrap() - reserve, 12_000_000);
    assert!(send(
        &mut svm,
        &admin,
        instruction(
            program,
            vec![
                meta(pool, false, true),
                meta(admin.pubkey(), true, true),
                meta(payout, false, true),
                meta(exit_marker, false, true),
                meta(Address::default(), false, false)
            ],
            actions[9].clone()
        ),
        &[]
    )
    .is_err());
}
