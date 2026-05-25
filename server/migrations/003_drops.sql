-- Items lying on the ground waiting to be picked up.
ALTER TABLE world_state ADD COLUMN IF NOT EXISTS drops JSONB NOT NULL DEFAULT '[]'::jsonb;
