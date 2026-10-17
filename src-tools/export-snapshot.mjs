#!/usr/bin/env node
/**
 * export-snapshot.mjs — 将 SQLite 全量库导出为前端数据快照
 *
 * 产物（public/data/）：
 *   versions.json          译本元数据 [{code,name,nameEn,language,godTerm}]
 *   books.json             66 卷规范表 [{id,osis,nameCn,nameCnTw,nameEn,abbr,testament}]
 *   <code>.json            按译本的文件：{ osis: { chapter: { verse: text } } }
 *
 * 用途：
 *   1. 浏览器开发预览（Vite dev，无 Tauri/SQLite 环境）——前端 bible-api 直接 fetch；
 *   2. 生产环境亦可作首屏离线包（桌面端仍优先走 Tauri SQL）。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(PROJECT_ROOT, 'resources', 'bible.db');
const OUT_DIR = path.join(PROJECT_ROOT, 'public', 'data');

const db = new Database(DB_PATH, { readonly: true });

mkdirSync(OUT_DIR, { recursive: true });

// 1) 元数据（键名与前端 BookMeta / VersionMeta 对齐：驼峰）
const versions = db.prepare('SELECT code, name, name_en, language, god_term FROM versions ORDER BY id').all();
const books = db.prepare('SELECT id, osis, name_cn, name_cn_tw, name_en, abbreviation, testament FROM books ORDER BY sort_order').all();
writeFileSync(path.join(OUT_DIR, 'versions.json'), JSON.stringify(versions.map((v) => ({
  code: v.code, name: v.name, nameEn: v.name_en, language: v.language, godTerm: v.god_term,
}))));
writeFileSync(path.join(OUT_DIR, 'books.json'), JSON.stringify(books.map((b) => ({
  id: b.id, osis: b.osis, nameCn: b.name_cn, nameCnTw: b.name_cn_tw, nameEn: b.name_en, abbr: b.abbreviation, testament: b.testament,
}))));

// 2) 各译本经文
const stmt = db.prepare(`
  SELECT v.code AS code, b.osis AS osis, x.chapter AS chapter, x.verse AS verse, x.text AS text
  FROM verses x JOIN versions v ON v.id = x.version_id JOIN books b ON b.id = x.book_id
  ORDER BY v.code, b.sort_order, x.chapter, x.verse
`);

let current = null; // { code, data }
let count = 0;
const flush = () => {
  if (!current) return;
  const file = path.join(OUT_DIR, `${current.code}.json`);
  writeFileSync(file, JSON.stringify(current.data));
  console.log(`  ✓ ${current.code}.json  ${count.toLocaleString()} 节  (${(Buffer.byteLength(JSON.stringify(current.data)) / 1024 / 1024).toFixed(1)} MB)`);
};

for (const row of stmt.iterate()) {
  if (!current || current.code !== row.code) {
    flush();
    current = { code: row.code, data: {} };
    count = 0;
  }
  const book = (current.data[row.osis] ??= {});
  const chapter = (book[row.chapter] ??= {});
  chapter[row.verse] = row.text;
  count++;
}
flush();

db.close();
console.log(`\n快照已导出到 ${OUT_DIR}`);
