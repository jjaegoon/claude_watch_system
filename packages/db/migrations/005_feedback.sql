-- feedback: 자산당 사용자 1건 (uq_feedback_user_asset); rating 범위 검증은 앱 레벨(Zod)
CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT    PRIMARY KEY NOT NULL,
  asset_id   TEXT    NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id    TEXT    NOT NULL,
  rating     INTEGER NOT NULL,
  comment    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_user_asset ON feedback (asset_id, user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_asset ON feedback (asset_id);
