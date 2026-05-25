-- Rift initial schema. All queries in the codebase are parameterized.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  reset_token   TEXT,
  reset_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS characters (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appearance  JSONB NOT NULL DEFAULT '{"skin":"light-brown","eyes":"blue"}'::jsonb,
  last_x      REAL NOT NULL DEFAULT 0,
  last_y      REAL NOT NULL DEFAULT 0,
  last_world  BIGINT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS worlds (
  id          BIGSERIAL PRIMARY KEY,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  seed        BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worlds_owner ON worlds(owner_id);

CREATE TABLE IF NOT EXISTS world_state (
  world_id    BIGINT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  terrain     JSONB NOT NULL DEFAULT '{}'::jsonb,
  placed      JSONB NOT NULL DEFAULT '[]'::jsonb,
  puzzles     JSONB NOT NULL DEFAULT '{}'::jsonb,
  shrines     JSONB NOT NULL DEFAULT '{}'::jsonb,
  unlocks     JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS world_permissions (
  id         BIGSERIAL PRIMARY KEY,
  world_id   BIGINT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','guest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, user_id)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id        BIGSERIAL PRIMARY KEY,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key  TEXT NOT NULL,
  quantity  INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, item_key)
);

CREATE TABLE IF NOT EXISTS crafted_items (
  id        BIGSERIAL PRIMARY KEY,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key  TEXT NOT NULL,
  data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
