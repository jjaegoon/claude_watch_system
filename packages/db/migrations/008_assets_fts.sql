-- T-19 V3: FTS5 가상 테이블 + json_each 트리거 (unicode61, 한국어 기본 지원)
-- 재실행 안전: 트리거 먼저 DROP → 테이블 DROP → 재생성
DROP TRIGGER IF EXISTS assets_ai;
DROP TRIGGER IF EXISTS assets_au;
DROP TRIGGER IF EXISTS assets_ad;
DROP TABLE IF EXISTS assets_fts;

CREATE VIRTUAL TABLE assets_fts USING fts5(
  asset_id UNINDEXED,
  name,
  description,
  tags,
  tokenize = 'unicode61 remove_diacritics 1'
);

CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts (asset_id, name, description, tags)
  VALUES (
    new.id,
    new.name,
    COALESCE(new.description, ''),
    (SELECT COALESCE(GROUP_CONCAT(value, ' '), '') FROM json_each(new.tags))
  );
END;

CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
  UPDATE assets_fts
  SET name        = new.name,
      description = COALESCE(new.description, ''),
      tags        = (SELECT COALESCE(GROUP_CONCAT(value, ' '), '') FROM json_each(new.tags))
  WHERE asset_id = new.id;
END;

CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  DELETE FROM assets_fts WHERE asset_id = old.id;
END;
