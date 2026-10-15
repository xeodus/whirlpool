use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::{v1, Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::{versioned::VersionedTransaction, Transaction};
use std::fs;
use whirlpool_feasibility_pool::POOL_SIZE;

struct Fixture {
    svm: LiteSVM,
    program: Address,
    pool: Address,
    payer: Keypair,
    asp: Keypair,
    guardian: Keypair,
    reserve: u64,
    token: Option<TokenFixture>,
}
struct TokenFixture {
    mint: Address,
    source: Address,
    vault: Address,
    fee_account: Address,
    authority: Address,
}
const TOKEN_PROGRAM: Address = Address::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);

fn meta(key: Address, signer: bool, writable: bool) -> AccountMeta {
    if writable {
        AccountMeta::new(key, signer)
    } else {
        AccountMeta::new_readonly(key, signer)
    }
}
fn proof(name: &str) -> Vec<u8> {
    fs::read(format!(
        "../candidate-circuits/generated/{name}_instruction.bin"
    ))
    .unwrap()
}
fn token_account(mint: Address, owner: Address, amount: u64, rent: u64) -> Account {
    let mut data = vec![0; 165];
    data[..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1;
    Account {
        lamports: rent,
        data,
        owner: TOKEN_PROGRAM,
        executable: false,
        rent_epoch: 0,
    }
}
fn signal(proof: &[u8], index: usize) -> [u8; 32] {
    proof[256 + 32 * index..256 + 32 * (index + 1)]
        .try_into()
        .unwrap()
}
fn recipient(lo: [u8; 32], hi: [u8; 32]) -> Address {
    let mut out = [0; 32];
    out[..16].copy_from_slice(&lo[16..]);
    out[16..].copy_from_slice(&hi[16..]);
    Address::new_from_array(out)
}
fn marker(program: &Address, pool: &Address, nf: &[u8; 32]) -> Address {
    Address::find_program_address(&[b"nf", pool.as_ref(), nf], program).0
}
fn payload(name: &str) -> Vec<u8> {
    fs::read(format!("../candidate-circuits/generated/{name}_payload.bin")).unwrap()
}
fn data(tag: u8, proof: Vec<u8>, payload: &[u8]) -> Vec<u8> {
    let mut bytes = vec![tag];
    bytes.extend(proof);
    if !payload.is_empty() {
        bytes.extend((payload.len() as u16).to_le_bytes());
        bytes.extend(payload);
    }
    bytes
}
impl Fixture {
    fn new() -> Self {
        Self::new_asset(false)
    }
    fn new_asset1() -> Self {
        Self::new_asset(true)
    }
    fn name(&self, name: &str) -> String {
        format!(
            "{name}{}",
            if self.token.is_some() { "_asset1" } else { "" }
        )
    }
    fn new_asset(asset1: bool) -> Self {
        let mut svm = LiteSVM::new();
        let program = Address::new_unique();
        let pool = Address::new_unique();
        let payer = Keypair::new();
        let asp = Keypair::new();
        let guardian = Keypair::new();
        svm.add_program_from_file(program, "target/deploy/whirlpool_feasibility_pool.so")
            .expect("run NO_DNA=1 cargo build-sbf first");
        for key in [&payer, &asp, &guardian] {
            svm.airdrop(&key.pubkey(), 1_000_000_000).unwrap();
        }
        // Solana rejects a newly credited zero-data account below rent minimum.
        // Seed the public payout address so these tiny fixture amounts can test
        // proof/account binding and pool conservation without a rent side effect.
        let withdrawal = proof(if asset1 {
            "withdraw_one_asset1"
        } else {
            "withdraw_one"
        });
        let payout_address = recipient(signal(&withdrawal, 7), signal(&withdrawal, 8));
        let token = if asset1 {
            let mint = Address::new_unique();
            let source = Address::new_unique();
            let vault = Address::new_unique();
            let fee_account = Address::new_unique();
            let authority = Address::find_program_address(&[b"vault", pool.as_ref()], &program).0;
            let mint_rent = svm.minimum_balance_for_rent_exemption(82);
            let token_rent = svm.minimum_balance_for_rent_exemption(165);
            let mut mint_data = vec![0; 82];
            mint_data[36..44].copy_from_slice(&100u64.to_le_bytes());
            mint_data[44] = 6;
            mint_data[45] = 1;
            svm.set_account(
                mint,
                Account {
                    lamports: mint_rent,
                    data: mint_data,
                    owner: TOKEN_PROGRAM,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .unwrap();
            for (address, owner, amount) in [
                (source, payer.pubkey(), 100),
                (vault, authority, 0),
                (fee_account, payer.pubkey(), 0),
                (payout_address, payer.pubkey(), 0),
            ] {
                svm.set_account(address, token_account(mint, owner, amount, token_rent))
                    .unwrap();
            }
            Some(TokenFixture {
                mint,
                source,
                vault,
                fee_account,
                authority,
            })
        } else {
            svm.airdrop(&payout_address, 1_000_000).unwrap();
            None
        };
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
        let mut fixture = Self {
            svm,
            program,
            pool,
            payer,
            asp,
            guardian,
            reserve,
            token,
        };
        let mut init_data = vec![0];
        if let Some(token) = &fixture.token {
            init_data.push(1);
            init_data.extend(token.mint.as_ref());
            init_data.extend(token.vault.as_ref());
        }
        let ix = fixture.ix(
            vec![
                meta(pool, false, true),
                meta(fixture.asp.pubkey(), true, false),
                meta(fixture.guardian.pubkey(), true, false),
            ],
            init_data,
        );
        let asp_signer = Keypair::try_from(fixture.asp.to_bytes().as_slice()).unwrap();
        let guardian_signer = Keypair::try_from(fixture.guardian.to_bytes().as_slice()).unwrap();
        fixture.send(ix, &[&asp_signer, &guardian_signer]).unwrap();
        fixture
    }
    fn ix(&self, accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
        Instruction {
            program_id: self.program,
            accounts,
            data,
        }
    }
    fn send(&mut self, ix: Instruction, other_signers: &[&Keypair]) -> Result<u64, String> {
        // LiteSVM records failed signatures too. Give each attempted action a
        // fresh blockhash so a retry checks program state, not AlreadyProcessed.
        self.svm.expire_blockhash();
        let budget = ComputeBudgetInstruction::set_compute_unit_limit(1_400_000);
        let msg = Message::new(&[budget, ix], Some(&self.payer.pubkey()));
        let mut signers = vec![&self.payer];
        signers.extend_from_slice(other_signers);
        let tx = Transaction::new(&signers, msg, self.svm.latest_blockhash());
        let wire = wincode::serialize(&tx).unwrap().len();
        self.svm
            .send_transaction(tx)
            .map(|meta| {
                println!("wire_bytes={wire} cu={}", meta.compute_units_consumed);
                meta.compute_units_consumed
            })
            .map_err(|e| format!("{e:?}"))
    }
    fn send_v1(&mut self, ix: Instruction) -> Result<(usize, u64), String> {
        self.svm.expire_blockhash();
        let config = v1::TransactionConfig::empty()
            .with_compute_unit_limit(1_400_000)
            .with_loaded_accounts_data_size_limit(64 * 1024 * 1024);
        let message = v1::Message::try_compile_with_config(
            &self.payer.pubkey(),
            &[ix],
            self.svm.latest_blockhash(),
            config,
        )
        .map_err(|e| format!("compile: {e:?}"))?;
        let tx = VersionedTransaction::try_new(VersionedMessage::V1(message), &[&self.payer])
            .map_err(|e| format!("sign: {e:?}"))?;
        let wire = wincode::serialize(&tx).unwrap().len();
        self.svm
            .send_transaction(tx)
            .map(|meta| {
                println!("v1_wire_bytes={wire} cu={}", meta.compute_units_consumed);
                (wire, meta.compute_units_consumed)
            })
            .map_err(|e| format!("{e:?}"))
    }
    fn root(&self) -> [u8; 32] {
        self.svm.get_account(&self.pool).unwrap().data[110..142]
            .try_into()
            .unwrap()
    }
    fn balance(&self) -> u64 {
        if let Some(token) = &self.token {
            let account = self.svm.get_account(&token.vault).unwrap();
            u64::from_le_bytes(account.data[64..72].try_into().unwrap())
        } else {
            self.svm.get_balance(&self.pool).unwrap() - self.reserve
        }
    }
    fn set_approval(&mut self, root: [u8; 32]) {
        let mut bytes = vec![1];
        bytes.extend(root);
        let ix = self.ix(
            vec![
                meta(self.pool, false, true),
                meta(self.asp.pubkey(), true, false),
            ],
            bytes,
        );
        // Keep the ASP signer alive outside the mutable borrow of the fixture.
        let signer = Keypair::try_from(self.asp.to_bytes().as_slice()).unwrap();
        self.send(ix, &[&signer]).unwrap();
    }
    fn pause(&mut self, paused: bool) {
        let ix = self.ix(
            vec![
                meta(self.pool, false, true),
                meta(self.guardian.pubkey(), true, false),
            ],
            vec![2, paused as u8],
        );
        let signer = Keypair::try_from(self.guardian.to_bytes().as_slice()).unwrap();
        self.send(ix, &[&signer]).unwrap();
    }
    fn shield(&mut self) {
        let mut accounts = vec![
            meta(self.pool, false, true),
            meta(self.payer.pubkey(), true, true),
        ];
        if let Some(token) = &self.token {
            accounts.extend([
                meta(token.source, false, true),
                meta(token.mint, false, false),
                meta(token.vault, false, true),
                meta(TOKEN_PROGRAM, false, false),
            ]);
        } else {
            accounts.push(meta(Address::default(), false, false));
        }
        let name = self.name("shield");
        let ix = self.ix(accounts, data(3, proof(&name), &payload(&name)));
        self.send(ix, &[]).unwrap();
    }
    fn private(&mut self, name: &str, tag: u8) -> Result<u64, String> {
        self.private_with_fee(name, tag, None)
    }
    fn private_with_fee(
        &mut self,
        name: &str,
        tag: u8,
        fee_override: Option<Address>,
    ) -> Result<u64, String> {
        self.private_full(name, tag, fee_override, 32, false, false, None)
            .map(|(_, cu)| cu)
    }
    fn private_full(
        &mut self,
        name: &str,
        tag: u8,
        fee_override: Option<Address>,
        payload_len: usize,
        v1: bool,
        corrupt_payload: bool,
        payload_override: Option<&[u8]>,
    ) -> Result<(usize, u64), String> {
        let p = proof(&self.name(name));
        let two = tag == 5 || tag == 7;
        let withdrawal = tag == 6 || tag == 7;
        let nf_count = if two { 2 } else { 1 };
        let mut accounts = vec![
            meta(self.pool, false, true),
            meta(self.payer.pubkey(), true, true),
        ];
        if let Some(token) = &self.token {
            accounts.push(meta(fee_override.unwrap_or(token.fee_account), false, true));
        }
        if withdrawal {
            let base = 3 + nf_count + 3;
            accounts.push(meta(
                recipient(signal(&p, base), signal(&p, base + 1)),
                false,
                true,
            ));
        }
        for i in 0..nf_count {
            accounts.push(meta(
                marker(&self.program, &self.pool, &signal(&p, 3 + i)),
                false,
                true,
            ));
        }
        accounts.push(meta(Address::default(), false, false));
        if let Some(token) = &self.token {
            accounts.extend([
                meta(token.vault, false, true),
                meta(token.mint, false, false),
                meta(token.authority, false, false),
                meta(TOKEN_PROGRAM, false, false),
            ]);
        }
        let output_payload = if let Some(override_bytes) = payload_override {
            if override_bytes.len() != payload_len {
                return Err("Payload fixture length mismatch".into());
            }
            override_bytes.to_vec()
        } else if payload_len == 32 {
            payload(&self.name(name))
        } else {
            vec![0xA5; payload_len] // explicitly malformed legacy size fixture
        };
        let mut instruction_data = data(tag, p, &output_payload);
        if corrupt_payload {
            *instruction_data.last_mut().unwrap() ^= 1;
        }
        let ix = self.ix(accounts, instruction_data);
        if v1 {
            self.send_v1(ix)
        } else {
            self.send(ix, &[]).map(|cu| (0, cu))
        }
    }
    fn exit(&mut self, recipient_override: Option<Address>) -> Result<u64, String> {
        self.exit_named("public_exit", recipient_override)
    }
    fn exit_named(
        &mut self,
        name: &str,
        recipient_override: Option<Address>,
    ) -> Result<u64, String> {
        let p = proof(&self.name(name));
        let recipient =
            recipient_override.unwrap_or_else(|| recipient(signal(&p, 5), signal(&p, 6)));
        let mut accounts = vec![
            meta(self.pool, false, true),
            meta(self.payer.pubkey(), true, true),
            meta(recipient, false, true),
            meta(
                marker(&self.program, &self.pool, &signal(&p, 2)),
                false,
                true,
            ),
            meta(Address::default(), false, false),
        ];
        if let Some(token) = &self.token {
            accounts.extend([
                meta(token.vault, false, true),
                meta(token.mint, false, false),
                meta(token.authority, false, false),
                meta(TOKEN_PROGRAM, false, false),
            ]);
        }
        let ix = self.ix(accounts, data(8, p, &[]));
        self.send(ix, &[])
    }
}

#[test]
fn denied_pending_deposit_can_exit_without_asp_for_both_assets() {
    for asset1 in [false, true] {
        let mut f = Fixture::new_asset(asset1);
        f.shield();
        assert_eq!(f.balance(), 100);
        f.pause(true);
        f.exit_named("public_exit_original", None).unwrap();
        assert_eq!(f.balance(), 0);
        assert!(f.exit_named("public_exit_original", None).is_err());
    }
}

#[test]
fn pending_revoked_and_paused_current_holder_exit() {
    let mut f = Fixture::new();
    f.shield();
    assert_eq!(f.balance(), 100);
    assert_eq!(f.root(), signal(&proof("transfer_one"), 1));
    assert!(
        f.private("transfer_one", 4).is_err(),
        "pending note privately spent"
    );
    assert_eq!(f.balance(), 100);
    f.set_approval(signal(&proof("transfer_one"), 2));
    f.private("transfer_one", 4).unwrap();
    assert_eq!(f.balance(), 98);
    assert!(
        f.private("transfer_one", 4).is_err(),
        "replayed nullifier accepted"
    );
    f.set_approval([0; 32]);
    assert!(
        f.private("transfer_two", 5).is_err(),
        "revoked private spend accepted"
    );
    f.set_approval(signal(&proof("transfer_two"), 2));
    f.pause(true);
    assert!(
        f.private("transfer_two", 5).is_err(),
        "paused private spend accepted"
    );
    f.set_approval([0; 32]);
    let wrong = Address::new_unique();
    assert!(
        f.exit(Some(wrong)).is_err(),
        "changed public exit recipient accepted"
    );
    assert_eq!(f.balance(), 98);
    f.exit(None).unwrap();
    assert_eq!(f.balance(), 38);
    assert!(f.exit(None).is_err(), "replayed exit accepted");
}

#[test]
fn phrase_restored_encrypted_journey_reaches_pool_and_exit() {
    // Generate these public research fixtures with
    // `node ../candidate-circuits/scripts/prove-restored-journey.mjs --emit`.
    let mut f = Fixture::new();
    let shield_payload =
        fs::read("../candidate-circuits/generated/shield_restored_payload.bin").unwrap();
    let shield_proof = proof("shield_restored");
    let mut shield_data = vec![3];
    shield_data.extend(shield_proof);
    shield_data.extend((shield_payload.len() as u16).to_le_bytes());
    shield_data.extend(&shield_payload);
    let shield_ix = f.ix(
        vec![
            meta(f.pool, false, true),
            meta(f.payer.pubkey(), true, true),
            meta(Address::default(), false, false),
        ],
        shield_data,
    );
    f.send(shield_ix, &[]).unwrap();
    assert_eq!(f.balance(), 100);
    f.set_approval(signal(&proof("transfer_one_restored"), 2));
    let transfer_payload =
        fs::read("../candidate-circuits/generated/transfer_one_restored_payload.bin").unwrap();
    let (wire, _) = f
        .private_full(
            "transfer_one_restored",
            4,
            None,
            transfer_payload.len(),
            true,
            false,
            Some(&transfer_payload),
        )
        .unwrap();
    assert!(wire > 1232 && wire <= 4096);
    assert_eq!(f.balance(), 98);
    f.set_approval([0; 32]);
    f.pause(true);
    let exit = proof("public_exit_restored");
    let payout = recipient(signal(&exit, 5), signal(&exit, 6));
    f.svm.airdrop(&payout, 1_000_000).unwrap();
    f.exit_named("public_exit_restored", None).unwrap();
    assert_eq!(f.balance(), 38);
    assert!(f.exit_named("public_exit_restored", None).is_err());
}

#[test]
fn phrase_restored_token_journey_reaches_pool_and_exit() {
    let mut f = Fixture::new_asset1();
    let token = f.token.as_ref().unwrap();
    let (source, mint, vault) = (token.source, token.mint, token.vault);
    let payload =
        fs::read("../candidate-circuits/generated/shield_restored_asset1_payload.bin").unwrap();
    let mut data = vec![3];
    data.extend(proof("shield_restored_asset1"));
    data.extend((payload.len() as u16).to_le_bytes());
    data.extend(payload);
    let ix = f.ix(
        vec![
            meta(f.pool, false, true),
            meta(f.payer.pubkey(), true, true),
            meta(source, false, true),
            meta(mint, false, false),
            meta(vault, false, true),
            meta(TOKEN_PROGRAM, false, false),
        ],
        data,
    );
    f.send(ix, &[]).unwrap();
    assert_eq!(f.balance(), 100);
    f.set_approval(signal(&proof("transfer_one_restored_asset1"), 2));
    let transfer_payload =
        fs::read("../candidate-circuits/generated/transfer_one_restored_asset1_payload.bin")
            .unwrap();
    let (wire, _) = f
        .private_full(
            "transfer_one_restored",
            4,
            None,
            transfer_payload.len(),
            true,
            false,
            Some(&transfer_payload),
        )
        .unwrap();
    assert!(wire > 1232 && wire <= 4096);
    assert_eq!(f.balance(), 98);
    f.set_approval([0; 32]);
    f.pause(true);
    f.exit_named("public_exit_restored", None).unwrap();
    assert_eq!(f.balance(), 38);
    assert!(f.exit_named("public_exit_restored", None).is_err());
}

#[test]
fn one_and_two_input_transfers_are_backed_and_conserve_sol() {
    let mut f = Fixture::new();
    f.shield();
    f.set_approval(signal(&proof("transfer_one"), 2));
    f.private("transfer_one", 4).unwrap();
    assert_eq!(f.root(), signal(&proof("transfer_two"), 1));
    f.private("transfer_two", 5).unwrap();
    assert_eq!(f.balance(), 96); // 100 deposited, 2 + 2 relayer fees
    assert!(f.private("transfer_two", 5).is_err());
}

#[test]
fn one_and_two_input_withdrawals_bind_payout_and_fee() {
    let mut one = Fixture::new();
    one.shield();
    one.set_approval(signal(&proof("withdraw_one"), 2));
    one.private("withdraw_one", 6).unwrap();
    assert_eq!(one.balance(), 38); // 100 - 60 payout - 2 fee

    let mut two = Fixture::new();
    two.shield();
    two.set_approval(signal(&proof("transfer_one"), 2));
    two.private("transfer_one", 4).unwrap();
    assert_eq!(two.root(), signal(&proof("withdraw_two"), 1));
    two.private("withdraw_two", 7).unwrap();
    assert_eq!(two.balance(), 38); // 100 - 2 transfer fee - 58 payout - 2 fee
}

#[test]
fn token_vault_enforces_exact_deposit_and_private_payouts() {
    let mut one = Fixture::new_asset1();
    one.shield();
    assert_eq!(one.balance(), 100);
    assert_eq!(one.root(), signal(&proof("transfer_one_asset1"), 1));
    assert!(
        one.private("withdraw_one", 6).is_err(),
        "pending token note privately spent"
    );
    one.set_approval(signal(&proof("withdraw_one_asset1"), 2));
    one.private("withdraw_one", 6).unwrap();
    assert_eq!(one.balance(), 38);
    assert!(
        one.private("withdraw_one", 6).is_err(),
        "token nullifier replay accepted"
    );

    let mut two = Fixture::new_asset1();
    two.shield();
    two.set_approval(signal(&proof("transfer_one_asset1"), 2));
    two.private("transfer_one", 4).unwrap();
    assert_eq!(two.root(), signal(&proof("withdraw_two_asset1"), 1));
    two.private("withdraw_two", 7).unwrap();
    assert_eq!(two.balance(), 38);
}

#[test]
fn token_current_holder_exits_after_revocation_and_pause() {
    let mut f = Fixture::new_asset1();
    f.shield();
    f.set_approval(signal(&proof("transfer_one_asset1"), 2));
    f.private("transfer_one", 4).unwrap();
    f.set_approval([0; 32]);
    assert!(
        f.private("transfer_two", 5).is_err(),
        "revoked token spend accepted"
    );
    f.set_approval(signal(&proof("transfer_two_asset1"), 2));
    f.pause(true);
    assert!(
        f.private("transfer_two", 5).is_err(),
        "paused token spend accepted"
    );
    f.set_approval([0; 32]);
    f.exit(None).unwrap();
    assert_eq!(f.balance(), 38);
    assert!(f.exit(None).is_err());
}

#[test]
fn token_account_substitution_fails_atomically() {
    let mut f = Fixture::new_asset1();
    let empty_root = f.root();
    let token = f.token.as_ref().unwrap();
    let bad_vault = Address::new_unique();
    let bad_shield = f.ix(
        vec![
            meta(f.pool, false, true),
            meta(f.payer.pubkey(), true, true),
            meta(token.source, false, true),
            meta(token.mint, false, false),
            meta(bad_vault, false, true),
            meta(TOKEN_PROGRAM, false, false),
        ],
        data(3, proof("shield_asset1"), &payload("shield_asset1")),
    );
    assert!(f.send(bad_shield, &[]).is_err());
    assert_eq!(f.balance(), 0);
    assert_eq!(f.root(), empty_root);

    f.shield();
    f.set_approval(signal(&proof("transfer_one_asset1"), 2));
    let bad_fee = Address::new_unique();
    let rent = f.svm.minimum_balance_for_rent_exemption(165);
    f.svm
        .set_account(
            bad_fee,
            token_account(Address::new_unique(), f.payer.pubkey(), 0, rent),
        )
        .unwrap();
    let proof = proof("transfer_one_asset1");
    let nf = marker(&f.program, &f.pool, &signal(&proof, 3));
    assert!(f
        .private_with_fee("transfer_one", 4, Some(bad_fee))
        .is_err());
    assert_eq!(f.balance(), 100);
    assert!(
        f.svm.get_account(&nf).is_none(),
        "failed action left a nullifier marker"
    );
    f.private("transfer_one", 4).unwrap();
    assert_eq!(f.balance(), 98);
}

#[test]
fn relayer_cannot_replace_encrypted_output_bytes() {
    for asset1 in [false, true] {
        let mut f = Fixture::new_asset(asset1);
        f.shield();
        let p = proof(&f.name("transfer_one"));
        f.set_approval(signal(&p, 2));
        let nf = marker(&f.program, &f.pool, &signal(&p, 3));
        assert!(f
            .private_full("transfer_one", 4, None, 32, false, true, None)
            .is_err());
        assert_eq!(f.balance(), 100);
        assert!(f.svm.get_account(&nf).is_none());
        f.private("transfer_one", 4).unwrap();
        assert_eq!(f.balance(), 98);
    }
}

#[test]
fn malformed_256_byte_withdrawal_payload_is_rejected() {
    let mut f = Fixture::new_asset1();
    f.shield();
    f.set_approval(signal(&proof("transfer_one_asset1"), 2));
    f.private("transfer_one", 4).unwrap();
    assert!(f
        .private_full("withdraw_two_payload256", 7, None, 256, true, false, None)
        .is_err());
    assert_eq!(f.balance(), 98);
}

#[test]
fn malformed_821_byte_transfer_payload_is_rejected() {
    let mut f = Fixture::new_asset1();
    f.shield();
    f.set_approval(signal(&proof("transfer_one_asset1"), 2));
    f.private("transfer_one", 4).unwrap();
    assert!(f
        .private_full("transfer_two_payload821", 5, None, 821, true, false, None)
        .is_err());
    assert_eq!(f.balance(), 98);
}

#[test]
fn encrypted_payment_and_change_bytes_are_proof_bound_in_pool() {
    let payload =
        fs::read("../candidate-circuits/generated/transfer_two_hpke_asset1_payload.bin").unwrap();
    assert_eq!(payload.len(), 589);
    let mut f = Fixture::new_asset1();
    f.shield();
    f.set_approval(signal(&proof("transfer_one_asset1"), 2));
    f.private("transfer_one", 4).unwrap();
    assert!(f
        .private_full(
            "transfer_two_hpke",
            5,
            None,
            payload.len(),
            true,
            true,
            Some(&payload),
        )
        .is_err());
    let (wire, cu) = f
        .private_full(
            "transfer_two_hpke",
            5,
            None,
            payload.len(),
            true,
            false,
            Some(&payload),
        )
        .unwrap();
    assert!(wire > 1232 && wire < 4096);
    assert!(cu < 1_400_000);
}
