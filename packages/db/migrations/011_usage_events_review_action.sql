-- D-B (T-31D): usage_events event_type에 'review_action' 추가 + review_metadata 컬럼 신설
-- 보강 #1: review_action 시 review_metadata NOT NULL CHECK 제약 (audit log 무결성)
-- SQLite는 CHECK 제약 수정 불가 → 테이블 재생성 패턴 사용

CREATE TABLE IF NOT EXISTS usage_events_new (
  id              TEXT    PRIMARY KEY NOT NULL,
  user_id         TEXT    NOT NULL,
  session_id      TEXT,
  event_type      TEXT    NOT NULL
                  CHECK (event_type IN (
                    'session_start', 'session_end', 'tool_call', 'file_edit',
                    'skill_trigger', 'asset_view', 'asset_install', 'review_action'
                  )),
  asset_id        TEXT    REFERENCES assets(id),
  tool_name       TEXT,
  file_path       TEXT,
  ts              INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata        TEXT    NOT NULL DEFAULT '{}',
  review_metadata TEXT,
  CHECK (
    (event_type = 'review_action' AND review_metadata IS NOT NULL) OR
    (event_type != 'review_action')
  )
);

INSERT INTO usage_events_new
  SELECT id, user_id, session_id, event_type, asset_id, tool_name, file_path, ts, metadata, NULL
  FROM usage_events;

DROP TABLE usage_events;
ALTER TABLE usage_events_new RENAME TO usage_events;

CREATE INDEX IF NOT EXISTS idx_events_ts ON usage_events (ts);
CREATE INDEX IF NOT EXISTS idx_events_asset_type_ts ON usage_events (asset_id, event_type, ts);
CREATE INDEX IF NOT EXISTS idx_events_user_ts ON usage_events (user_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON usage_events (event_type, ts);
