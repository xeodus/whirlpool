//! Candidate Devnet SOL pool. Test proving keys; no production asset custody.
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
use solana_poseidon::{hashv, Endianness, Parameters};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    hash::hash,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};

mod keys {
    pub mod shield {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../spikes/v1-feasibility/candidate-circuits/generated/shield_verifying_key.rs"
        ));
    }
    pub mod transfer_one {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../spikes/v1-feasibility/candidate-circuits/generated/transfer_one_verifying_key.rs"
        ));
    }
    pub mod transfer_two {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../spikes/v1-feasibility/candidate-circuits/generated/transfer_two_verifying_key.rs"
        ));
    }
    pub mod withdraw_one {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../spikes/v1-feasibility/candidate-circuits/generated/withdraw_one_verifying_key.rs"
        ));
    }
    pub mod withdraw_two {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../spikes/v1-feasibility/candidate-circuits/generated/withdraw_two_verifying_key.rs"
        ));
    }
    pub mod public_exit {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../spikes/v1-feasibility/candidate-circuits/generated/public_exit_verifying_key.rs"
        ));
    }
}

const DEPTH: usize = 20;
const HISTORY: usize = 32;
const FIRST_ORIGIN: u64 = 55; // candidate setup compatibility; origins still increment on each shield
const MAGIC: u8 = 0x57;
const PAUSE: usize = 1;
const ORIGIN: usize = 2; // u64, next program-assigned deposit origin
const LEAF_COUNT: usize = 10; // u32
const ASP: usize = 14;
const GUARDIAN: usize = 46;
const APPROVED_ROOT: usize = 78;
const NOTE_ROOT: usize = 110;
const ZERO: usize = 142;
const FRONTIER: usize = ZERO + 32 * DEPTH;
const ROOTS: usize = FRONTIER + 32 * DEPTH;
const ROOT_COUNT: usize = ROOTS + 32 * HISTORY;
const ROOT_CURSOR: usize = ROOT_COUNT + 1;
const ASSET: usize = ROOT_CURSOR + 1;
const MINT: usize = ASSET + 1;
const VAULT: usize = MINT + 32;
pub const POOL_SIZE: usize = VAULT + 32;

// Custom errors are deliberately simple; this is not a production IDL.
const BAD_STATE: ProgramError = ProgramError::Custom(1);
const BAD_AUTH: ProgramError = ProgramError::Custom(2);
const BAD_BINDING: ProgramError = ProgramError::Custom(3);
const UNKNOWN_ROOT: ProgramError = ProgramError::Custom(4);
const PAUSED: ProgramError = ProgramError::Custom(5);
const TREE_FULL: ProgramError = ProgramError::Custom(6);

entrypoint!(process_instruction);

fn field(data: &[u8], offset: usize) -> [u8; 32] {
    data[offset..offset + 32].try_into().unwrap()
}
fn put(data: &mut [u8], offset: usize, value: &[u8; 32]) {
    data[offset..offset + 32].copy_from_slice(value);
}
fn u64_field(value: u64) -> [u8; 32] {
    let mut out = [0; 32];
    out[24..].copy_from_slice(&value.to_be_bytes());
    out
}
fn as_u64(value: &[u8; 32]) -> Result<u64, ProgramError> {
    if value[..24] != [0; 24] {
        return Err(BAD_BINDING);
    }
    Ok(u64::from_be_bytes(value[24..].try_into().unwrap()))
}
fn hash2(a: &[u8; 32], b: &[u8; 32]) -> Result<[u8; 32], ProgramError> {
    hashv(Parameters::Bn254X5, Endianness::BigEndian, &[a, b])
        .map(|h| h.to_bytes())
        .map_err(|_| BAD_BINDING)
}
fn expected_empty_root() -> Result<([u8; 32], [[u8; 32]; DEPTH]), ProgramError> {
    let mut zeros = [[0; 32]; DEPTH];
    for i in 1..DEPTH {
        zeros[i] = hash2(&zeros[i - 1], &zeros[i - 1])?;
    }
    let root = hash2(&zeros[DEPTH - 1], &zeros[DEPTH - 1])?;
    Ok((root, zeros))
}
fn approval_path_root(
    origin: u64,
    approved: bool,
    siblings: &[[u8; 32]; DEPTH],
) -> Result<[u8; 32], ProgramError> {
    let index = origin.checked_sub(FIRST_ORIGIN).ok_or(BAD_BINDING)?;
    if index >= 1 << DEPTH {
        return Err(TREE_FULL);
    }
    let mut node = if approved {
        hash2(&u64_field(104), &u64_field(origin))?
    } else {
        [0; 32]
    };
    for (level, sibling) in siblings.iter().enumerate() {
        node = if (index >> level) & 1 == 0 {
            hash2(&node, sibling)?
        } else {
            hash2(sibling, &node)?
        };
    }
    Ok(node)
}
fn push_root(data: &mut [u8], root: &[u8; 32]) {
    let cursor = data[ROOT_CURSOR] as usize;
    put(data, ROOTS + cursor * 32, root);
    data[ROOT_CURSOR] = ((cursor + 1) % HISTORY) as u8;
    data[ROOT_COUNT] = (usize::from(data[ROOT_COUNT]) + 1).min(HISTORY) as u8;
}
fn has_root(data: &[u8], root: &[u8; 32]) -> bool {
    (0..usize::from(data[ROOT_COUNT])).any(|i| &data[ROOTS + i * 32..ROOTS + (i + 1) * 32] == root)
}
fn append(data: &mut [u8], leaf: &[u8; 32]) -> ProgramResult {
    let index = u32::from_le_bytes(data[LEAF_COUNT..LEAF_COUNT + 4].try_into().unwrap());
    if index >= 1 << DEPTH {
        return Err(TREE_FULL);
    }
    let mut node = *leaf;
    for level in 0..DEPTH {
        let previous = field(data, FRONTIER + level * 32);
        if (index >> level) & 1 == 0 {
            put(data, FRONTIER + level * 32, &node);
            let zero = field(data, ZERO + level * 32);
            node = hash2(&node, &zero)?;
        } else {
            node = hash2(&previous, &node)?;
        }
    }
    data[LEAF_COUNT..LEAF_COUNT + 4].copy_from_slice(&(index + 1).to_le_bytes());
    put(data, NOTE_ROOT, &node);
    push_root(data, &node);
    Ok(())
}
fn verify<const N: usize>(
    data: &[u8],
    key: &Groth16Verifyingkey,
) -> Result<[[u8; 32]; N], ProgramError> {
    if data.len() < 256 + 32 * N {
        return Err(ProgramError::InvalidInstructionData);
    }
    let a: &[u8; 64] = data[..64].try_into().map_err(|_| BAD_BINDING)?;
    let b: &[u8; 128] = data[64..192].try_into().map_err(|_| BAD_BINDING)?;
    let c: &[u8; 64] = data[192..256].try_into().map_err(|_| BAD_BINDING)?;
    let mut signals = [[0; 32]; N];
    for (i, signal) in signals.iter_mut().enumerate() {
        *signal = data[256 + i * 32..256 + (i + 1) * 32].try_into().unwrap();
    }
    let mut verifier = Groth16Verifier::new(a, b, c, &signals, key).map_err(|_| BAD_BINDING)?;
    verifier.verify().map_err(|_| BAD_BINDING)?;
    Ok(signals)
}
fn check_payload(data: &[u8], proof_len: usize) -> Result<[u8; 32], ProgramError> {
    let tail = data
        .get(proof_len..)
        .ok_or(ProgramError::InvalidInstructionData)?;
    if tail.len() < 2 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let len = u16::from_le_bytes(tail[..2].try_into().unwrap()) as usize;
    if len < 32 || len > 1024 || tail.len() != len + 2 {
        return Err(ProgramError::InvalidInstructionData);
    }
    // Use 248 bits of SHA-256 so the digest is a canonical BN254 field element.
    let full_digest = hash(tail).to_bytes();
    let mut digest_field = [0; 32];
    digest_field[1..].copy_from_slice(&full_digest[..31]);
    Ok(digest_field)
}
fn check_output_records(data: &[u8], proof_len: usize, commitments: &[[u8; 32]]) -> ProgramResult {
    let tail = data
        .get(proof_len..)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let payload = tail.get(2..).ok_or(ProgramError::InvalidInstructionData)?;
    if commitments.is_empty()
        || commitments.len() > 2
        || payload.len() != 1 + commitments.len() * 294
        || payload[0] != commitments.len() as u8
    {
        return Err(BAD_BINDING);
    }
    for (index, commitment) in commitments.iter().enumerate() {
        let start = 1 + index * 294;
        if payload[start..start + 32] != *commitment
            || payload[start + 64..start + 66] != [97, 0]
            || payload[start + 195..start + 197] != [97, 0]
        {
            return Err(BAD_BINDING);
        }
    }
    Ok(())
}
fn check_pool(pool: &AccountInfo, program_id: &Pubkey) -> ProgramResult {
    if pool.owner != program_id || pool.data_len() != POOL_SIZE {
        return Err(BAD_STATE);
    }
    if pool.try_borrow_data()?[0] != MAGIC {
        return Err(BAD_STATE);
    }
    Ok(())
}
fn require_signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}
fn require_system(account: &AccountInfo) -> ProgramResult {
    if *account.key != system_program::id() {
        return Err(BAD_BINDING);
    }
    Ok(())
}
fn pubkey_from_limbs(lo: &[u8; 32], hi: &[u8; 32]) -> Result<Pubkey, ProgramError> {
    if lo[..16] != [0; 16] || hi[..16] != [0; 16] {
        return Err(BAD_BINDING);
    }
    let mut bytes = [0; 32];
    bytes[..16].copy_from_slice(&lo[16..]);
    bytes[16..].copy_from_slice(&hi[16..]);
    Ok(Pubkey::new_from_array(bytes))
}
fn create_nullifier<'a>(
    program_id: &Pubkey,
    pool: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    marker: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    nf: &[u8; 32],
) -> ProgramResult {
    let (expected, bump) =
        Pubkey::find_program_address(&[b"nf", pool.key.as_ref(), nf], program_id);
    if *marker.key != expected || marker.data_len() != 0 || *marker.owner != system_program::id() {
        return Err(BAD_BINDING);
    }
    let rent = Rent::get()?.minimum_balance(1);
    let ix = system_instruction::create_account(payer.key, marker.key, rent, 1, program_id);
    invoke_signed(
        &ix,
        &[payer.clone(), marker.clone(), system.clone()],
        &[&[b"nf", pool.key.as_ref(), nf, &[bump]]],
    )
}
fn pay(pool: &AccountInfo, destination: &AccountInfo, amount: u64) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    if pool.key == destination.key {
        return Err(BAD_BINDING);
    }
    let remaining = pool
        .lamports()
        .checked_sub(amount)
        .ok_or(ProgramError::InsufficientFunds)?;
    if remaining < Rent::get()?.minimum_balance(POOL_SIZE) {
        return Err(ProgramError::InsufficientFunds);
    }
    let credited = destination
        .lamports()
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    **pool.try_borrow_mut_lamports()? = remaining;
    **destination.try_borrow_mut_lamports()? = credited;
    Ok(())
}
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let (&tag, body) = data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    let mut iter = accounts.iter();
    let pool = next_account_info(&mut iter)?;
    if pool.owner != program_id || pool.data_len() != POOL_SIZE {
        return Err(BAD_STATE);
    }
    if tag == 0 {
        let asp = next_account_info(&mut iter)?;
        let guardian = next_account_info(&mut iter)?;
        require_signer(asp)?;
        require_signer(guardian)?;
        if accounts.len() != 3 || !body.is_empty() {
            return Err(ProgramError::InvalidInstructionData);
        }
        let mut state = pool.try_borrow_mut_data()?;
        if state.iter().any(|byte| *byte != 0) {
            return Err(BAD_STATE);
        }
        let (empty, zeros) = expected_empty_root()?;
        state[0] = MAGIC;
        // This deployment is SOL-only. Token custody requires a separate
        // reviewed release and cannot be activated through initialization.
        state[ORIGIN..ORIGIN + 8].copy_from_slice(&FIRST_ORIGIN.to_le_bytes());
        state[ASP..ASP + 32].copy_from_slice(asp.key.as_ref());
        state[GUARDIAN..GUARDIAN + 32].copy_from_slice(guardian.key.as_ref());
        put(&mut state, NOTE_ROOT, &empty);
        put(&mut state, APPROVED_ROOT, &empty);
        for (i, zero) in zeros.iter().enumerate() {
            put(&mut state, ZERO + i * 32, zero);
        }
        push_root(&mut state, &empty);
        return Ok(());
    }
    check_pool(pool, program_id)?;
    match tag {
        1 => {
            // ASP proves one leaf transition against the current approval root.
            // The full instruction publicly identifies the origin and change so
            // an independent reader can rebuild witnesses from finalized history.
            let asp = next_account_info(&mut iter)?;
            require_signer(asp)?;
            if asp.key.as_ref() != &pool.try_borrow_data()?[ASP..ASP + 32]
                || body.len() != 8 + 1 + DEPTH * 32
                || accounts.len() != 2
            {
                return Err(BAD_AUTH);
            }
            let origin = u64::from_le_bytes(body[..8].try_into().unwrap());
            let approved = match body[8] {
                0 => false,
                1 => true,
                _ => return Err(BAD_BINDING),
            };
            let mut siblings = [[0; 32]; DEPTH];
            for (level, sibling) in siblings.iter_mut().enumerate() {
                *sibling = body[9 + level * 32..9 + (level + 1) * 32]
                    .try_into()
                    .unwrap();
            }
            let mut state = pool.try_borrow_mut_data()?;
            let next_origin = u64::from_le_bytes(state[ORIGIN..ORIGIN + 8].try_into().unwrap());
            if origin < FIRST_ORIGIN || origin >= next_origin {
                return Err(BAD_BINDING);
            }
            let old_root = approval_path_root(origin, !approved, &siblings)?;
            if old_root != field(&state, APPROVED_ROOT) {
                return Err(UNKNOWN_ROOT);
            }
            let new_root = approval_path_root(origin, approved, &siblings)?;
            put(&mut state, APPROVED_ROOT, &new_root);
            Ok(())
        }
        2 => {
            let guardian = next_account_info(&mut iter)?;
            require_signer(guardian)?;
            if guardian.key.as_ref() != &pool.try_borrow_data()?[GUARDIAN..GUARDIAN + 32]
                || body.len() != 1
                || body[0] > 1
                || accounts.len() != 2
            {
                return Err(BAD_AUTH);
            }
            pool.try_borrow_mut_data()?[PAUSE] = body[0];
            Ok(())
        }
        3 => {
            // SOL shield: [pool,depositor,system]
            let depositor = next_account_info(&mut iter)?;
            require_signer(depositor)?;
            let payload_digest = check_payload(body, 256 + 6 * 32)?;
            let signals = verify::<6>(body, &keys::shield::VERIFYING_KEY)?;
            if signals[4] != payload_digest {
                return Err(BAD_BINDING);
            }
            check_output_records(body, 256 + 6 * 32, &signals[3..4])?;
            let amount = as_u64(&signals[1])?;
            let state = pool.try_borrow_data()?;
            let origin = u64::from_le_bytes(state[ORIGIN..ORIGIN + 8].try_into().unwrap());
            if state[PAUSE] != 0
                || signals[0] != u64_field(0)
                || amount == 0
                || signals[2] != u64_field(origin)
            {
                return Err(BAD_BINDING);
            }
            drop(state);
            let system = next_account_info(&mut iter)?;
            require_system(system)?;
            if iter.next().is_some() {
                return Err(BAD_BINDING);
            }
            invoke(
                &system_instruction::transfer(depositor.key, pool.key, amount),
                &[depositor.clone(), pool.clone(), system.clone()],
            )?;
            let mut state = pool.try_borrow_mut_data()?;
            append(&mut state, &signals[3])?;
            state[ORIGIN..ORIGIN + 8]
                .copy_from_slice(&origin.checked_add(1).ok_or(TREE_FULL)?.to_le_bytes());
            Ok(())
        }
        4..=7 => {
            // private transfer/withdrawal; submitter funds nullifier rent
            let submitter = next_account_info(&mut iter)?;
            require_signer(submitter)?;
            let two = tag == 5 || tag == 7;
            let withdrawal = tag == 6 || tag == 7;
            let proof_len = 256 + if two { 13 * 32 } else { 12 * 32 };
            let payload_digest = check_payload(body, proof_len)?;
            let signals: Vec<[u8; 32]> = match tag {
                4 => verify::<12>(body, &keys::transfer_one::VERIFYING_KEY)?.to_vec(),
                5 => verify::<13>(body, &keys::transfer_two::VERIFYING_KEY)?.to_vec(),
                6 => verify::<12>(body, &keys::withdraw_one::VERIFYING_KEY)?.to_vec(),
                _ => verify::<13>(body, &keys::withdraw_two::VERIFYING_KEY)?.to_vec(),
            };
            if signals[signals.len() - 2] != payload_digest {
                return Err(BAD_BINDING);
            }
            let nullifier_count = if two { 2 } else { 1 };
            let commitment_base = 3 + nullifier_count;
            let recipient_base = commitment_base + 3;
            let fee_index = recipient_base + 2;
            if withdrawal {
                check_output_records(
                    body,
                    proof_len,
                    &signals[commitment_base + 1..commitment_base + 2],
                )?;
            } else {
                check_output_records(
                    body,
                    proof_len,
                    &signals[commitment_base..commitment_base + 2],
                )?;
            }
            let state = pool.try_borrow_data()?;
            if state[PAUSE] != 0 {
                return Err(PAUSED);
            }
            if signals[0] != u64_field(0)
                || !has_root(&state, &signals[1])
                || signals[2] != field(&state, APPROVED_ROOT)
            {
                return Err(UNKNOWN_ROOT);
            }
            drop(state);
            let fee = as_u64(&signals[fee_index])?;
            let payout = as_u64(&signals[commitment_base + 2])?;
            if withdrawal != (payout > 0) {
                return Err(BAD_BINDING);
            }
            let recipient = if withdrawal {
                Some(next_account_info(&mut iter)?)
            } else {
                None
            };
            if let Some(recipient) = recipient {
                if *recipient.key
                    != pubkey_from_limbs(&signals[recipient_base], &signals[recipient_base + 1])?
                {
                    return Err(BAD_BINDING);
                }
            }
            let mut markers = Vec::with_capacity(nullifier_count);
            for _ in 0..nullifier_count {
                markers.push(next_account_info(&mut iter)?);
            }
            let system = next_account_info(&mut iter)?;
            require_system(system)?;
            if iter.next().is_some() {
                return Err(BAD_BINDING);
            }
            for (i, marker) in markers.iter().enumerate() {
                create_nullifier(program_id, pool, submitter, marker, system, &signals[3 + i])?;
            }
            pay(pool, submitter, fee)?;
            if let Some(recipient) = recipient {
                pay(pool, recipient, payout)?;
            }
            let mut state = pool.try_borrow_mut_data()?;
            if !withdrawal {
                append(&mut state, &signals[commitment_base])?;
            }
            append(&mut state, &signals[commitment_base + 1])?;
            Ok(())
        }
        8 => {
            // exit has no ASP or pause check
            if body.len() != 256 + 7 * 32 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let submitter = next_account_info(&mut iter)?;
            let recipient = next_account_info(&mut iter)?;
            let marker = next_account_info(&mut iter)?;
            let system = next_account_info(&mut iter)?;
            require_signer(submitter)?;
            require_system(system)?;
            if iter.next().is_some() {
                return Err(BAD_BINDING);
            }
            let signals = verify::<7>(body, &keys::public_exit::VERIFYING_KEY)?;
            let state = pool.try_borrow_data()?;
            if signals[0] != u64_field(0) || !has_root(&state, &signals[1]) {
                return Err(UNKNOWN_ROOT);
            }
            drop(state);
            if *recipient.key != pubkey_from_limbs(&signals[5], &signals[6])? {
                return Err(BAD_BINDING);
            }
            let amount = as_u64(&signals[4])?;
            if amount == 0 {
                return Err(BAD_BINDING);
            }
            create_nullifier(program_id, pool, submitter, marker, system, &signals[2])?;
            pay(pool, recipient, amount)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_leaf_transition_matches_empty_tree() {
        let (empty, siblings) = expected_empty_root().unwrap();
        let expected_empty = "2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e";
        let expected_approved = "0599a1711939f0946798eca9a762c41783457375e825761d29e3df9c26556acd";
        let to_hex = |bytes: [u8; 32]| {
            bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        };
        assert_eq!(to_hex(empty), expected_empty);
        assert_eq!(
            approval_path_root(FIRST_ORIGIN, false, &siblings).unwrap(),
            empty
        );
        let approved = approval_path_root(FIRST_ORIGIN, true, &siblings).unwrap();
        assert_eq!(to_hex(approved), expected_approved);
        assert_ne!(approved, empty);
        assert_eq!(
            approval_path_root(FIRST_ORIGIN, false, &siblings).unwrap(),
            empty
        );
        assert!(approval_path_root(FIRST_ORIGIN - 1, true, &siblings).is_err());
        assert!(approval_path_root(FIRST_ORIGIN + (1 << DEPTH), true, &siblings).is_err());
    }
}
