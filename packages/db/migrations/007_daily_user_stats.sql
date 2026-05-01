-- T-26: daily_user_stats (일별 사용자 활동 집계)
CREATE TABLE IF NOT EXISTS daily_user_stats (
  id              TEXT    PRIMARY KEY NOT NULL,
  user_id         TEXT    NOT NULL,
  stat_date       TEXT    NOT NULL,
  session_count   INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  active_minutes  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_user_stats ON daily_user_stats (user_id, stat_date);
