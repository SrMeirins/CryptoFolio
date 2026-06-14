-- B5: STAKING_UNLOCK + linked_tx_id para relacionar cada redemption con su purchase
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_tx_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'STAKING_UNLOCK' AFTER 'STAKING_LOCK';
