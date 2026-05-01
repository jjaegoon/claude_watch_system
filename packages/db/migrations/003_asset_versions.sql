-- T-20: asset_versions 스냅샷 (INSERT/UPDATE 시 tx-coupled 즉시 기록)
CREATE TABLE IF NOT EXISTS asset_versions (
  id          TEXT    PRIMARY KEY NOT NULL,
  asset_id    TEXT    NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version     TEXT    NOT NULL,
  snapshot    TEXT    NOT NULL,
  changed_by  TEXT    REFERENCES users(id),
  change_note TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_versions_asset_created ON asset_versions (asset_id, created_at);
