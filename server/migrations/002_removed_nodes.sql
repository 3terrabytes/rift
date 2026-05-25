-- Adds the removed_nodes overlay column for the infinite-world refactor.
ALTER TABLE world_state ADD COLUMN IF NOT EXISTS removed_nodes JSONB NOT NULL DEFAULT '[]'::jsonb;
