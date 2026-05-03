-- feedback v2: 005_feedback.sql (immutable, GR-1) → M6 스키마 재구성 (D-8, D-9 정합)
-- 005 schema: asset_id NOT NULL, rating INTEGER, comment — M6 요구: nullable asset_id, feedback_type, content, status
-- table recreation 패턴 (migration 011 정합)

CREATE TABLE IF NOT EXISTS feedback_new (
  id            text PRIMARY KEY NOT NULL,
  user_id       text NOT NULL REFERENCES users(id),
  asset_id      text REFERENCES assets(id),  -- nullable: S10 시스템 수준 피드백
  feedback_type text NOT NULL CHECK (feedback_type IN ('bug_report', 'improvement', 'system_feedback')),
  content       text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wontfix')),
  created_at    integer NOT NULL DEFAULT (unixepoch())
);

-- 기존 feedback 테이블 교체 (005의 데이터는 dev 환경 미보존 — schema 비호환)
DROP TABLE IF EXISTS feedback;
ALTER TABLE feedback_new RENAME TO feedback;

CREATE INDEX IF NOT EXISTS idx_feedback_user    ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_asset   ON feedback(asset_id, created_at DESC) WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_status  ON feedback(status, created_at DESC);
