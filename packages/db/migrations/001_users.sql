-- T-16·T-34: users 테이블 (system_user 역할 + isBot 컬럼 포함)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  local_id      TEXT    NOT NULL UNIQUE,
  role          TEXT    NOT NULL DEFAULT 'member'
                        CHECK (role IN ('member', 'reviewer', 'admin', 'system_user')),
  password_hash TEXT    NOT NULL,
  is_bot        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
