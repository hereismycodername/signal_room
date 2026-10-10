use anchor_lang::prelude::*;

declare_id!("DHuk5kiCXXBAcMLNUsQjn6i7yTnrrVMMY3SAmQv45udt");

#[program]
pub mod signal_room {
    use super::*;

    pub fn create_room(
        ctx: Context<CreateRoom>,
        room_id: [u8; 16],
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        let room = &mut ctx.accounts.room;
        room.version = 1;
        room.authority = ctx.accounts.authority.key();
        room.room_id = room_id;
        room.metadata_hash = metadata_hash;
        room.question_count = 0;
        room.created_at = Clock::get()?.unix_timestamp;
        room.bump = ctx.bumps.room;
        Ok(())
    }

    pub fn create_question(
        ctx: Context<CreateQuestion>,
        question_index: u32,
        metadata_hash: [u8; 32],
        closes_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(closes_at > now, SignalRoomError::DeadlineNotFuture);

        let room = &mut ctx.accounts.room;
        require_eq!(
            question_index,
            room.question_count,
            SignalRoomError::QuestionIndexMismatch
        );
        room.question_count = room
            .question_count
            .checked_add(1)
            .ok_or(SignalRoomError::QuestionLimitReached)?;

        let question = &mut ctx.accounts.question;
        question.room = room.key();
        question.question_index = question_index;
        question.metadata_hash = metadata_hash;
        question.closes_at = closes_at;
        question.status = QuestionStatus::Open;
        question.commitment_count = 0;
        question.commitments_root = [0; 32];
        question.outcome = None;
        question.results_root = [0; 32];
        question.evidence_hash = [0; 32];
        question.sealed_at = 0;
        question.resolved_at = 0;
        question.bump = ctx.bumps.question;
        Ok(())
    }

    pub fn seal_question(
        ctx: Context<ManageQuestion>,
        commitments_root: [u8; 32],
        commitment_count: u32,
    ) -> Result<()> {
        let question = &mut ctx.accounts.question;
        question.seal(
            Clock::get()?.unix_timestamp,
            commitments_root,
            commitment_count,
        )
    }

    pub fn resolve_question(
        ctx: Context<ManageQuestion>,
        outcome: u8,
        results_root: [u8; 32],
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        let question = &mut ctx.accounts.question;
        question.resolve(
            Clock::get()?.unix_timestamp,
            outcome,
            results_root,
            evidence_hash,
        )
    }
}

#[derive(Accounts)]
#[instruction(room_id: [u8; 16])]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Room::INIT_SPACE,
        seeds = [b"room", authority.key().as_ref(), room_id.as_ref()],
        bump
    )]
    pub room: Account<'info, Room>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(question_index: u32)]
pub struct CreateQuestion<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ SignalRoomError::Unauthorized,
        seeds = [b"room", authority.key().as_ref(), room.room_id.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, Room>,
    #[account(
        init,
        payer = authority,
        space = 8 + Question::INIT_SPACE,
        seeds = [b"question", room.key().as_ref(), &question_index.to_le_bytes()],
        bump
    )]
    pub question: Account<'info, Question>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageQuestion<'info> {
    pub authority: Signer<'info>,
    #[account(
        has_one = authority @ SignalRoomError::Unauthorized,
        seeds = [b"room", authority.key().as_ref(), room.room_id.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, Room>,
    #[account(
        mut,
        has_one = room @ SignalRoomError::WrongRoom,
        seeds = [b"question", room.key().as_ref(), &question.question_index.to_le_bytes()],
        bump = question.bump
    )]
    pub question: Account<'info, Question>,
}

#[account]
#[derive(InitSpace)]
pub struct Room {
    pub version: u8,
    pub authority: Pubkey,
    pub room_id: [u8; 16],
    pub metadata_hash: [u8; 32],
    pub question_count: u32,
    pub created_at: i64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct Question {
    pub room: Pubkey,
    pub question_index: u32,
    pub metadata_hash: [u8; 32],
    pub closes_at: i64,
    pub status: QuestionStatus,
    pub commitment_count: u32,
    pub commitments_root: [u8; 32],
    pub outcome: Option<u8>,
    pub results_root: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub sealed_at: i64,
    pub resolved_at: i64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl Question {
    fn seal(&mut self, now: i64, root: [u8; 32], count: u32) -> Result<()> {
        require!(
            self.status == QuestionStatus::Open,
            SignalRoomError::InvalidTransition
        );
        require!(now >= self.closes_at, SignalRoomError::DeadlineNotReached);
        require!(root != [0; 32], SignalRoomError::EmptyRoot);
        self.status = QuestionStatus::Sealed;
        self.commitments_root = root;
        self.commitment_count = count;
        self.sealed_at = now;
        Ok(())
    }

    fn resolve(
        &mut self,
        now: i64,
        outcome: u8,
        root: [u8; 32],
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            self.status == QuestionStatus::Sealed,
            SignalRoomError::InvalidTransition
        );
        require!(outcome <= 1, SignalRoomError::InvalidOutcome);
        require!(root != [0; 32], SignalRoomError::EmptyRoot);
        require!(evidence_hash != [0; 32], SignalRoomError::EmptyEvidenceHash);
        self.status = QuestionStatus::Resolved;
        self.outcome = Some(outcome);
        self.results_root = root;
        self.evidence_hash = evidence_hash;
        self.resolved_at = now;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum QuestionStatus {
    Open,
    Sealed,
    Resolved,
}

#[error_code]
pub enum SignalRoomError {
    #[msg("Only the room authority may perform this action.")]
    Unauthorized,
    #[msg("The question belongs to another room.")]
    WrongRoom,
    #[msg("The question deadline must be in the future.")]
    DeadlineNotFuture,
    #[msg("Question indexes must be consecutive.")]
    QuestionIndexMismatch,
    #[msg("The room cannot hold more questions.")]
    QuestionLimitReached,
    #[msg("This lifecycle transition is not allowed.")]
    InvalidTransition,
    #[msg("The question deadline has not passed.")]
    DeadlineNotReached,
    #[msg("A Merkle root cannot be all zero bytes.")]
    EmptyRoot,
    #[msg("The outcome must be 0 or 1.")]
    InvalidOutcome,
    #[msg("The evidence hash cannot be all zero bytes.")]
    EmptyEvidenceHash,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_question() -> Question {
        Question {
            room: Pubkey::default(),
            question_index: 0,
            metadata_hash: [0; 32],
            closes_at: 100,
            status: QuestionStatus::Open,
            commitment_count: 0,
            commitments_root: [0; 32],
            outcome: None,
            results_root: [0; 32],
            evidence_hash: [0; 32],
            sealed_at: 0,
            resolved_at: 0,
            bump: 0,
            reserved: [0; 32],
        }
    }

    #[test]
    fn seal_requires_deadline_and_cannot_repeat() {
        let mut question = fresh_question();
        assert!(question.seal(99, [1; 32], 2).is_err());
        assert_eq!(question.status, QuestionStatus::Open);
        assert!(question.seal(100, [1; 32], 2).is_ok());
        assert_eq!(question.commitment_count, 2);
        assert_eq!(question.commitments_root, [1; 32]);
        assert!(question.seal(101, [2; 32], 3).is_err());
        assert_eq!(question.commitments_root, [1; 32]);
    }

    #[test]
    fn resolve_requires_seal_and_cannot_repeat() {
        let mut question = fresh_question();
        assert!(question.resolve(100, 1, [2; 32], [3; 32]).is_err());
        question.seal(100, [1; 32], 1).unwrap();
        assert!(question.resolve(101, 2, [2; 32], [3; 32]).is_err());
        assert!(question.resolve(101, 1, [2; 32], [0; 32]).is_err());
        assert!(question.resolve(101, 1, [2; 32], [3; 32]).is_ok());
        assert_eq!(question.outcome, Some(1));
        assert_eq!(question.evidence_hash, [3; 32]);
        assert!(question.resolve(102, 0, [3; 32], [4; 32]).is_err());
        assert_eq!(question.results_root, [2; 32]);
    }
}
