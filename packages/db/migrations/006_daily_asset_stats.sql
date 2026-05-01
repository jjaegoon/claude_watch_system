-- T-26: daily_asset_stats (avg_rating_x100: rating × 100 정수 저장, utils.toRating으로 변환)
CREATE TABLE IF NOT EXISTS daily_asset_stats (
  id              TEXT    PRIMARY KEY NOT NULL,
  asset_id        TEXT    NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  stat_date       TEXT    NOT NULL,
  view_count      INTEGER NOT NULL DEFAULT 0,
  install_count   INTEGER NOT NULL DEFAULT 0,
  trigger_count   INTEGER NOT NULL DEFAULT 0,
  feedback_count  INTEGER NOT NULL DEFAULT 0,
  avg_rating_x100 INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_stats ON daily_asset_stats (asset_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_asset_stats (stat_date);
