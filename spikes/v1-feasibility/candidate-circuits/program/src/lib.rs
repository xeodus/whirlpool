use groth16_solana::groth16::Groth16Verifier;
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};

include!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../generated/transfer_one_verifying_key.rs"
));

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() != 256 + 12 * 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let proof_a: &[u8; 64] = data[0..64]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    let proof_b: &[u8; 128] = data[64..192]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    let proof_c: &[u8; 64] = data[192..256]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    let mut public_inputs = [[0u8; 32]; 12];
    for (i, input) in public_inputs.iter_mut().enumerate() {
        *input = data[256 + i * 32..256 + (i + 1) * 32]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?;
    }
    let mut verifier =
        Groth16Verifier::new(proof_a, proof_b, proof_c, &public_inputs, &VERIFYING_KEY)
            .map_err(|_| ProgramError::InvalidInstructionData)?;
    verifier
        .verify()
        .map_err(|_| ProgramError::InvalidInstructionData)
}
