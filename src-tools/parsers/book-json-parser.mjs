/**
 * book-json-parser.mjs — 分卷 JSON 解析器（KJV / NIV 及同结构数据源）
 *
 * 输入：目录或 zip，每卷一文件：
 *   { "book": "1 Samuel", "chapters": [ { "chapter": "1",
 *       "verses": [ { "verse": "1", "text": "..." } ] } ] }
 *
 * 特点：
 *   - 自动跳过 Books.json 等卷名索引文件（顶层为数组或无 chapters）；
 *   - 书卷名取自 JSON 内 book 字段（兼容带空格写法）；
 *   - 单文件失败隔离：记录错误后继续处理其余卷。
 */

import path from 'node:path';
import { readZipBuffer, readUtf8 } from '../lib/fs-utils.mjs';
import { resolveBook } from '../lib/books.mjs';
import { cleanText, expandVerseRange, isValidChapterVerse } from './common.mjs';

/**
 * @param {import('../lib/detect.mjs').SourceInfo} source
 * @param {import('../lib/report.mjs').ImportReport} report
 * @returns {Promise<{records: import('./common.mjs').VerseRecord[]}>}
 */
export async function parseBookJson(source, report) {
  const records = [];

  for (const file of source.files) {
    // 跳过索引文件
    if (/books\.json$/i.test(path.basename(file))) continue;

    let data;
    try {
      const buf = source.kind === 'zip'
        ? readZipBuffer(source.path, file)
        : await readUtf8(path.join(source.path, file)).then((r) => Buffer.from(r.text, 'utf8'));
      data = JSON.parse(buf.toString('utf8'));
    } catch (err) {
      report.error('book-json', `文件解析失败，已跳过: ${file} — ${err.message}`);
      continue;
    }

    if (!data || typeof data !== 'object' || !Array.isArray(data.chapters)) {
      report.warn('book-json', `文件结构不符，已跳过: ${file}`);
      continue;
    }

    const osis = resolveBook(data.book ?? path.basename(file, '.json'));
    if (!osis) {
      report.error('book-json', `未知书卷，已跳过: ${file}（book=${data.book}）`);
      continue;
    }

    for (const ch of data.chapters) {
      const chapter = Number(ch?.chapter);
      if (!Number.isInteger(chapter) || chapter < 1) {
        report.error('book-json', `${file} 章号异常: ${ch?.chapter}`);
        continue;
      }
      for (const v of ch.verses ?? []) {
        for (const verse of expandVerseRange(v?.verse)) {
          if (!isValidChapterVerse(chapter, verse)) {
            report.error('book-json', `${file} ${chapter}:${v?.verse} 节号越界`);
            continue;
          }
          const text = cleanText(v?.text);
          if (!text) {
            report.warn('book-json', `${file} ${chapter}:${verse} 文本为空，已跳过`);
            continue;
          }
          records.push({ osis, chapter, verse, text });
        }
      }
    }
  }
  return { records };
}
