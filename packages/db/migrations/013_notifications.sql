-- notifications: 인앱 알림 테이블 (U-Mj-2, D-7 정합 — 이메일 Phase 2 보류)
CREATE TABLE IF NOT EXISTS notifications (
  id         text    PRIMARY KEY NOT NULL,
  user_id    text    NOT NULL REFERENCES users(id),
  event_type text    NOT NULL CHECK (event_type IN ('review_approved', 'review_rejected', 'asset_published')),
  asset_id   text    REFERENCES assets(id),
  metadata   text    NOT NULL DEFAULT '{}',  -- JSON: { actor_id, reason_code }
  read_at    integer,
  created_at integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
-- partial index: 미읽은 알림만 인덱스 (C-1 RBAC 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
