-- T-42: FTS5 한국어 토크나이저 unicode61 → trigram (한국어 부분 매칭 + 붙여쓰기 매칭)
-- Opt α: external content (content='assets', content_rowid='rowid') + new.rowid 명시
--
-- gotcha #14: spec의 "WHERE rowid = new.id" 는 UUID TEXT→INTEGER type affinity 버그.
--   new.rowid (SQLite 내부 INTEGER rowid) 명시로 자율 수정.
--
-- gotcha #13: FTS5 external content 삭제는 `DELETE FROM fts WHERE rowid=X` 가 아니라
--   특수 'delete' INSERT 명령 필요:
--   INSERT INTO assets_fts(assets_fts, rowid, col...) VALUES('delete', old.rowid, old.col...)
--   표준 DELETE는 shadow table을 직접 건드려 index가 갱신되지 않음.
--
-- 멱등 실행 안전: 트리거 DROP → 테이블 DROP → 재생성

DROP TRIGGER IF EXISTS assets_ai;
DROP TRIGGER IF EXISTS assets_au;
DROP TRIGGER IF EXISTS assets_ad;
DROP TABLE IF EXISTS assets_fts;

CREATE VIRTUAL TABLE assets_fts USING fts5(
  name,
  description,
  content='assets',
  content_rowid='rowid',
  tokenize='trigram'
);

-- INSERT 트리거
CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description, ''));
END;

-- UPDATE 트리거: FTS5 external content — 'delete' 명령으로 구항목 제거 후 신항목 삽입
CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description)
  VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
  INSERT INTO assets_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description, ''));
END;

-- DELETE 트리거: FTS5 external content — 'delete' 명령 사용 (gotcha #13)
CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description)
  VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
END;
