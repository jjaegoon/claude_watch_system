-- T-19: assets 테이블 (FTS5 가상 테이블은 008에서)
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT    PRIMARY KEY NOT NULL,
  type        TEXT    NOT NULL CHECK (type IN ('skill', 'prompt', 'command', 'mcp')),
  name        TEXT    NOT NULL,
  description TEXT,
  tags        TEXT    NOT NULL DEFAULT '[]',
  author_id   TEXT    REFERENCES users(id),
  version     TEXT    NOT NULL DEFAULT '1.0.0',
  status      TEXT    NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'in_review', 'approved', 'deprecated')),
  source_path TEXT,
  type_fields TEXT    NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_name_version ON assets (name, version);
CREATE INDEX IF NOT EXISTS idx_assets_type_status ON assets (type, status);
CREATE INDEX IF NOT EXISTS idx_assets_author ON assets (author_id);
CREATE INDEX IF NOT EXISTS idx_assets_updated ON assets (updated_at);
