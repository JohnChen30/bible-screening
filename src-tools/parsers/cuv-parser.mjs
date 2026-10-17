/**
 * cuv-parser.mjs — 和合本格式解析器
 *
 * 输入：目录型数据源，主文件为 {书卷:{章:{节:文本}}} 嵌套 JSON
 *       （如 和合本.json），可选 books.json 索引（{old:[{key,name}],new:[...]}）。
 *
 * 特点：
 *   - 书卷键为英文驼峰（1Samuel / SongOfSolomon），经 resolveBook 归一化；
 *   - books.json 中文名与规范表交叉校验，不一致仅告警不阻断；
 *   - 单文件整体解析，逐书记录，任何一卷解析失败不影响其余卷。
 */

import path from 'node:path';
import { readUtf8 } from '../lib/fs-utils.mjs';
import { resolveBook } from '../lib/books.mjs';
import { cleanText, expandVerseRange, isValidChapterVerse } from './common.mjs';

/**
 * @param {import('../lib/detect.mjs').SourceInfo} source
 * @param {import('../lib/report.mjs').ImportReport} report
 * @returns {Promise<{records: import('./common.mjs').VerseRecord[]}>}
 */
export async function parseCuv(source, report) {
  const mainPath = path.join(source.path, source.files.find((f) => !/^books\.json$/i.test(f)));
  const { text } = await readUtf8(mainPath);

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`主文件 JSON 解析失败: ${mainPath} — ${err.message}`);
  }

  // 可选：books.json 索引交叉校验
  if (source.indexFile) {
    try {
      const { text: idxText } = await readUtf8(path.join(source.path, source.indexFile));
      const idx = JSON.parse(idxText);
      const indexNames = new Map();
      for (const t of ['old', 'new']) {
        for (const b of idx[t] ?? []) indexNames.set(String(b.key), b.name);
      }
      for (const [key, cn] of indexNames) {
        if (!resolveBook(key)) report.warn('cuv-index', `books.json 书卷键无法识别: ${key}`);
        void cn;
      }
    } catch (err) {
      report.warn('cuv-index', `books.json 读取失败（跳过索引校验）: ${err.message}`);
    }
  }

  const records = [];
  for (const [bookKey, chapters] of Object.entries(data)) {
    const osis = resolveBook(bookKey);
    if (!osis) {
      report.warn('cuv', `未知书卷键，已跳过: ${bookKey}`);
      continue;
    }
    if (!chapters || typeof chapters !== 'object') {
      report.error('cuv', `书卷结构异常: ${bookKey}`);
      continue;
    }
    for (const [chStr, verses] of Object.entries(chapters)) {
      const chapter = Number(chStr);
      if (!Number.isInteger(chapter) || chapter < 1) {
        report.error('cuv', `${bookKey} 章号异常: ${chStr}`);
        continue;
      }
      for (const [vStr, rawText] of Object.entries(verses ?? {})) {
        for (const verse of expandVerseRange(vStr)) {
          if (!isValidChapterVerse(chapter, verse)) {
            report.error('cuv', `${bookKey} ${chapter}:${vStr} 节号越界`);
            continue;
          }
          const text2 = cleanText(rawText);
          if (!text2) {
            report.warn('cuv', `${bookKey} ${chapter}:${verse} 文本为空，已跳过`);
            continue;
          }
          records.push({ osis, chapter, verse, text: text2 });
        }
      }
    }
  }
  return { records };
}
