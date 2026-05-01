-- T-15: webhook_jobs 영속 큐 (schema only — 워커 폴링은 M2에서)
CREATE TABLE IF NOT EXISTS webhook_jobs (
  id           TEXT    PRIMARY KEY NOT NULL,
  source       TEXT    NOT NULL CHECK (source IN ('github_pr_merge')),
  payload      TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  retry_count  INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at   INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status ON webhook_jobs (status, created_at);
