#!/usr/bin/env node
/**
 * import-bible.mjs — 本地圣经数据导入 CLI（Tauri 后端导入模块的 Node 实现）
 *
 * 用法：
 *   node import-bible.mjs [--data <数据目录>] [--db <输出库>] [--only cuv,kjv]
 *                         [--report <json路径>] [--clean] [--help]
 *
 * 流程：扫描数据源 → 格式探测 → 解析（隔离错误）→ 校验（去重/越界/缺失卷）
 *       → 事务批量落库 → 写入 import_runs 日志 → 输出摘要。
 *
 * 幂等性：同一 version code 重复导入 = 先删旧数据再全量写入，可安全重跑。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';

import { discoverSources } from './lib/detect.mjs';
import { ImportReport } from './lib/report.mjs';
import { parseCuv } from './parsers/cuv-parser.mjs';
import { parseBookJson } from './parsers/book-json-parser.mjs';
import { parseUsfm } from './parsers/usfm-parser.mjs';
import { ALL_OSIS, BOOK_BY_OSIS } from './lib/books.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const PARSERS = {
  'cuv': parseCuv,
  'book-json': parseBookJson,
  'usfm': parseUsfm,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    data: path.join(PROJECT_ROOT, 'bible_vasion'),
    db: path.join(PROJECT_ROOT, 'resources', 'bible.db'),
    userDb: false,
    only: null,
    report: null,
    clean: false,
    sample: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--data': opts.data = path.resolve(argv[++i]); break;
      case '--db': opts.db = path.resolve(argv[++i]); opts.userDb = true; break;
      case '--only': opts.only = new Set(argv[++i].split(',').map((s) => s.trim().toLowerCase())); break;
      case '--report': opts.report = path.resolve(argv[++i]); break;
      case '--clean': opts.clean = true; break;
      case '--sample': opts.sample = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`未知参数: ${a}`);
    }
  }
  return opts;
}

/** 样本模式配置：仅导入和合本 + 当代译本的创世记第 1 章，用于快速验证解压/解析规则 */
const SAMPLE_VERSION_CODES = ['cuv', 'ccb'];
const SAMPLE_BOOK = 'Gen';
const SAMPLE_CHAPTER = 1;
const SAMPLE_DB = path.join(PROJECT_ROOT, 'resources', 'bible-sample.db');

const HELP = `
圣经数据导入模块 (Bible Screening · Import)
────────────────────────────────────────────
  node import-bible.mjs [选项]

选项：
  --data <目录>    数据根目录（默认: <项目根>/bible_vasion）
  --db <文件>      输出 SQLite 路径（默认: <项目根>/resources/bible.db）
  --only <codes>   只导入指定译本，逗号分隔（如 cuv,kjv）
  --report <路径>  导出机器可读 JSON 报告
  --clean          导入前清空整个数据库（默认按译本幂等替换）
  -h, --help       显示帮助
`;

// ---------------------------------------------------------------------------
// 数据库
// ---------------------------------------------------------------------------

function openDatabase(dbPath, clean) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  if (clean) {
    db.exec('DELETE FROM verses; DELETE FROM versions; DELETE FROM import_runs;');
    console.log('  · 已按 --clean 清空旧数据');
  }
  return db;
}

/** 66 卷规范表 upsert（id 固定 1..66，保证跨译本引用稳定） */
function upsertBooks(db) {
  const stmt = db.prepare(`
    INSERT INTO books (id, osis, name_cn, name_cn_tw, name_en, abbreviation, testament, sort_order)
    VALUES (@id, @osis, @nameCn, @nameCnTw, @nameEn, @abbr, @testament, @sortOrder)
    ON CONFLICT(osis) DO UPDATE SET
      name_cn = excluded.name_cn, name_cn_tw = excluded.name_cn_tw,
      name_en = excluded.name_en, abbreviation = excluded.abbreviation,
      testament = excluded.testament, sort_order = excluded.sort_order
  `);
  const rows = [...BOOK_BY_OSIS.values()]
    .sort((a, b) => a.id - b.id)
    .map((b) => ({
      id: b.id, osis: b.osis, nameCn: b.nameCn, nameCnTw: b.nameCnTw,
      nameEn: b.nameEn, abbr: b.abbr, testament: b.testament, sortOrder: b.id,
    }));
  const tx = db.transaction(() => { for (const r of rows) stmt.run(r); });
  tx();
  return rows.length;
}

// ---------------------------------------------------------------------------
// 单数据源导入
// ---------------------------------------------------------------------------

/**
 * 导入单个数据源：解析 → 校验 → 事务落库 → 日志。
 * @returns {Promise<{versionId:number, books:number, chapters:number, verses:number, ms:number, report:ImportReport}>}
 */
async function importSource(db, source, recordFilter = null, isSample = false) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const report = new ImportReport(source.version.code);

  // 1) 解析（parser 内部对单文件错误隔离，不中断整源）
  const parser = PARSERS[source.format];
  if (!parser) throw new Error(`不支持的格式: ${source.format}`);
  const { records: allRecords } = await parser(source, report);

  // 1b) 样本模式过滤（如仅创世记第 1 章）
  const records = recordFilter ? allRecords.filter(recordFilter) : allRecords;
  if (recordFilter && !records.length) {
    throw new Error(`样本过滤后无记录（${source.version.code}）`);
  }

  // 2) 校验：去重 / 缺失卷
  const seen = new Set();
  const deduped = [];
  for (const r of records) {
    const key = `${r.osis}:${r.chapter}:${r.verse}`;
    if (seen.has(key)) {
      report.warn('dedup', `重复节次已跳过: ${source.version.code} ${r.osis} ${r.chapter}:${r.verse}`);
      continue;
    }
    seen.add(key);
    deduped.push(r);
  }

  const foundOsis = new Set(records.map((r) => r.osis));
  const missing = [...ALL_OSIS].filter((o) => !foundOsis.has(o));
  if (missing.length && !isSample) {
    report.warn('coverage', `缺失 ${missing.length} 卷: ${missing.map((o) => BOOK_BY_OSIS.get(o)?.nameCn ?? o).join('、')}`);
  }

  const chapters = new Set(records.map((r) => `${r.osis}:${r.chapter}`)).size;

  // 3) 落库（幂等替换 + 单事务原子性）
  const versionId = db.transaction(() => {
    db.prepare('DELETE FROM verses WHERE version_id = (SELECT id FROM versions WHERE code = ?)')
      .run(source.version.code);
    db.prepare('DELETE FROM versions WHERE code = ?').run(source.version.code);
    const info = db.prepare(`
      INSERT INTO versions (code, name, name_en, language, god_term, source_dir)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      source.version.code, source.version.name, source.version.nameEn,
      source.version.language, source.version.godTerm, source.version.sourceDir,
    );
    const vid = Number(info.lastInsertRowid);
    const insert = db.prepare(
      'INSERT INTO verses (version_id, book_id, chapter, verse, text) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of deduped) {
      insert.run(vid, BOOK_BY_OSIS.get(r.osis).id, r.chapter, r.verse, r.text);
    }
    return vid;
  })();

  // 4) 运行日志
  db.prepare(`
    INSERT INTO import_runs (version_code, started_at, finished_at, books, chapters, verses, warnings, errors, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source.version.code, startedAt, new Date().toISOString(),
    foundOsis.size, chapters, deduped.length,
    report.warnings.length, report.errors.length, report.toDetailJson(),
  );

  return {
    versionId, books: foundOsis.size, chapters, verses: deduped.length,
    ms: Date.now() - t0, report,
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`参数错误: ${err.message}\n${HELP}`);
    process.exit(2);
  }
  if (opts.help) { console.log(HELP); return; }

  const t0 = Date.now();
  console.log('══════════════════════════════════════════════');
  console.log(' 圣经投影软件 · 本地经文导入模块');
  console.log('══════════════════════════════════════════════');
  console.log(` 数据目录: ${opts.data}`);
  console.log(` 输出数据库: ${opts.db}`);

  // 1) 发现数据源
  const sources = await discoverSources(opts.data);
  if (!sources.length) {
    console.error(`未在 ${opts.data} 发现可识别的圣经数据源（目录需含 JSON，或 *.zip）`);
    process.exit(2);
  }
  console.log(`\n 发现 ${sources.length} 个数据源：`);
  for (const s of sources) {
    console.log(`   · ${s.label}  [${s.kind === 'zip' ? 'ZIP' : 'DIR'}] → 格式 ${s.format} → 译本 ${s.version.code}（${s.version.name}）`);
  }

  const selected = opts.only ? sources.filter((s) => opts.only.has(s.version.code)) : sources;
  if (!selected.length) {
    console.error(`--only 过滤后无匹配数据源（可用: ${sources.map((s) => s.version.code).join(', ')}）`);
    process.exit(2);
  }

  // 样本模式：仅 和合本 + 当代译本 的 创世记第 1 章，写入独立样本库（不覆盖全量库）
  let recordFilter = null;
  if (opts.sample) {
    if (!opts.userDb) opts.db = SAMPLE_DB;
    opts.clean = true; // 样本库每次全新写入
    recordFilter = (r) => r.osis === SAMPLE_BOOK && r.chapter === SAMPLE_CHAPTER;
    const kept = sources.filter((s) => SAMPLE_VERSION_CODES.includes(s.version.code));
    selected.length = 0;
    selected.push(...kept);
    console.log(`\n ▸ 样本模式：仅解析 ${SAMPLE_VERSION_CODES.join(' + ')} 的 ${SAMPLE_BOOK} 第 ${SAMPLE_CHAPTER} 章`);
    console.log(`   样本库: ${opts.db}（全量库不受影响）`);
    if (!selected.length) {
      console.error('样本模式：未找到 和合本 / 当代译本 数据源');
      process.exit(2);
    }
  }

  // 2) 建库 + 规范书卷表
  const db = openDatabase(opts.db, opts.clean);
  const bookCount = upsertBooks(db);
  console.log(`\n 规范书卷表就绪（${bookCount} 卷）`);

  // 3) 逐源导入
  const results = [];
  for (const source of selected) {
    process.stdout.write(`\n ▶ 导入 ${source.version.name}（${source.label} / ${source.format}）… `);
    try {
      const r = await importSource(db, source, recordFilter, opts.sample);
      console.log(`${r.books} 卷 / ${r.chapters} 章 / ${r.verses} 节  (${r.ms}ms)`);
      console.log(r.report.printSummary());
      results.push({ source, ok: r.report.errors.length === 0, ...r });
    } catch (err) {
      console.log('失败');
      console.error(`   ✗ ${err.message}`);
      results.push({ source, ok: false, fatal: err.message });
    }
  }

  // 4) 总览
  console.log('\n══════════════════════════════════════════════');
  console.log(' 导入总览');
  console.log('══════════════════════════════════════════════');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(` ${pad('译本', 8)}${pad('卷', 5)}${pad('章', 6)}${pad('节', 8)}${pad('警告', 6)}${pad('错误', 6)}状态`);
  for (const r of results) {
    if (r.fatal) {
      console.log(` ${pad(r.source.version.code, 8)}${pad('-', 5)}${pad('-', 6)}${pad('-', 8)}${pad('-', 6)}${pad('-', 6)}✗ ${r.fatal}`);
    } else {
      console.log(` ${pad(r.source.version.code, 8)}${pad(r.books, 5)}${pad(r.chapters, 6)}${pad(r.verses, 8)}${pad(r.report.warnings.length, 6)}${pad(r.report.errors.length, 6)}${r.ok ? '✓' : '✗'}`);
    }
  }
  const totalVerses = results.reduce((sum, r) => sum + (r.verses ?? 0), 0);
  console.log(`\n 合计 ${totalVerses.toLocaleString()} 节经文 · 总耗时 ${Date.now() - t0}ms · 数据库: ${opts.db}`);

  // 4b) 样本模式：从 SQLite 读回创世记 1:1-1:5，双译本并排打印，验证无错位
  if (opts.sample) {
    console.log('\n══════════════════════════════════════════════');
    console.log(` 样本验证 · ${SAMPLE_BOOK} 1:1 - 1:5（从 SQLite 读回）`);
    console.log('══════════════════════════════════════════════');
    const codes = results.filter((r) => !r.fatal).map((r) => r.source.version.code);
    for (const v of [1, 2, 3, 4, 5]) {
      const row = {};
      for (const code of codes) {
        row[code] = db.prepare(`
          SELECT x.text FROM verses x
          JOIN versions ver ON ver.id = x.version_id
          JOIN books b ON b.id = x.book_id
          WHERE ver.code = ? AND b.osis = ? AND x.chapter = ? AND x.verse = ?
        `).get(code, SAMPLE_BOOK, SAMPLE_CHAPTER, v)?.text ?? '（缺失）';
      }
      console.log(`\n  【创 1:${v}】`);
      for (const code of codes) {
        const name = results.find((r) => r.source.version.code === code).source.version.name;
        console.log(`   ${name.padEnd(5)}｜ ${row[code]}`);
      }
    }
    const cnt = db.prepare('SELECT COUNT(*) n FROM verses').get();
    console.log(`\n 样本库共 ${cnt.n} 节 · 路径 ${opts.db}`);
  }

  // 5) JSON 报告（可选）
  if (opts.report) {
    const payload = {
      dataRoot: opts.data, db: opts.db,
      startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(),
      versions: results.map((r) => ({
        code: r.source.version.code, name: r.source.version.name,
        format: r.source.format, ok: r.ok,
        books: r.books ?? 0, chapters: r.chapters ?? 0, verses: r.verses ?? 0,
        fatal: r.fatal ?? null,
        entries: r.report ? r.report.entries : [],
      })),
    };
    writeFileSync(opts.report, JSON.stringify(payload, null, 2), 'utf8');
    console.log(` JSON 报告已写入: ${opts.report}`);
  }

  db.close();
  if (results.some((r) => !r.ok)) {
    console.log('\n 存在错误（详见上方报告），退出码 1');
    process.exit(1);
  }
  console.log('\n ✓ 全部完成');
}

main().catch((err) => {
  console.error(`\n导入器致命错误: ${err.stack ?? err.message}`);
  process.exit(2);
});
