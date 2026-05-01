-- T-23·T-29: usage_events (100ms flush, 50-event tx; T-29 보너스 필드는 metadata JSON)
CREATE TABLE IF NOT EXISTS usage_events (
  id         TEXT    PRIMARY KEY NOT NULL,
  user_id    TEXT    NOT NULL,
  session_id TEXT,
  event_type TEXT    NOT NULL
             CHECK (event_type IN (
               'session_start', 'session_end', 'tool_call',
               'file_edit', 'skill_trigger', 'asset_view', 'asset_install'
             )),
  asset_id   TEXT    REFERENCES assets(id),
  tool_name  TEXT,
  file_path  TEXT,
  ts         INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata   TEXT    NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON usage_events (ts);
CREATE INDEX IF NOT EXISTS idx_events_asset_type_ts ON usage_events (asset_id, event_type, ts);
CREATE INDEX IF NOT EXISTS idx_events_user_ts ON usage_events (user_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON usage_events (event_type, ts);
