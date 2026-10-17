-- ============================================================================
-- Bible Screening · SQLite 表结构
-- 适用：SQLite 3.35+（Tauri tauri-plugin-sql / better-sqlite3 均兼容）
-- 设计原则：
--   1. books 为 66 卷规范表，跨译本共享，保证“对照阅读”按同一书卷对齐；
--   2. verses 采用 WITHOUT ROWID 复合主键，(version_id, book_id, chapter, verse)
--      天然唯一、按章节连续存储，范围查询走聚簇索引；
--   3. 原文 text 只存“干净文本”，神/上帝称呼互换等渲染层逻辑不落库。
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 译本表：和合本 / KJV / NIV / 当代译本 / （预留：新译本、简繁体变体……）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS versions (
  id          INTEGER PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,            -- 机器码：cuv / kjv / niv / ccb / cnv …
  name        TEXT    NOT NULL,                   -- 显示名：和合本
  name_en     TEXT    NOT NULL DEFAULT '',        -- 英文显示名：Chinese Union Version
  language    TEXT    NOT NULL DEFAULT 'zh-Hans', -- zh-Hans | zh-Hant | en
  god_term    TEXT    NOT NULL DEFAULT '神',       -- 该译本的神称呼（渲染层互换开关的数据依据）
  source_dir  TEXT    NOT NULL DEFAULT '',        -- 数据来源目录 / 压缩包
  imported_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ----------------------------------------------------------------------------
-- 书卷表：66 卷规范定义（跨译本共享）
--   osis         —— OSIS 标准书卷码（Gen / 1Sam / Rev …），与 USFM \id 对齐
--   name_cn/_tw  —— 简 / 繁中文名
--   abbreviation —— 缩写（创 / 撒上 / 林前 …），用于 Miller Columns 窄列展示
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
  id           INTEGER PRIMARY KEY,
  osis         TEXT    NOT NULL UNIQUE,
  name_cn      TEXT    NOT NULL,
  name_cn_tw   TEXT    NOT NULL DEFAULT '',
  name_en      TEXT    NOT NULL,
  abbreviation TEXT    NOT NULL,
  testament    TEXT    NOT NULL CHECK (testament IN ('old', 'new')),
  sort_order   INTEGER NOT NULL UNIQUE           -- 1..66 正典顺序
);

-- ----------------------------------------------------------------------------
-- 经文表：一个译本 · 一卷书 · 一章 · 一节 → 一行
--   CHECK 约束兜底脏数据；text 非空（trim 后）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verses (
  version_id  INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id),
  chapter     INTEGER NOT NULL CHECK (chapter BETWEEN 1 AND 200),
  verse       INTEGER NOT NULL CHECK (verse BETWEEN 1 AND 200),
  text        TEXT    NOT NULL CHECK (length(trim(text)) > 0),
  PRIMARY KEY (version_id, book_id, chapter, verse)
) WITHOUT ROWID;

-- 对照阅读常用路径：给定书卷+章，取所有译本
CREATE INDEX IF NOT EXISTS idx_verses_book_chapter
  ON verses (book_id, chapter, version_id);

-- ----------------------------------------------------------------------------
-- 导入运行日志：每次导入留痕，便于审计与排障
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_runs (
  id           INTEGER PRIMARY KEY,
  version_code TEXT    NOT NULL,
  started_at   TEXT    NOT NULL,
  finished_at  TEXT    NOT NULL,
  books        INTEGER NOT NULL DEFAULT 0,
  chapters     INTEGER NOT NULL DEFAULT 0,
  verses       INTEGER NOT NULL DEFAULT 0,
  warnings     INTEGER NOT NULL DEFAULT 0,
  errors       INTEGER NOT NULL DEFAULT 0,
  detail_json  TEXT    NOT NULL DEFAULT '[]'     -- 结构化明细（截断到 500 条）
);
