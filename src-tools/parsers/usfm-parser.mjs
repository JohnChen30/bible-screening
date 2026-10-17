/**
 * usfm-parser.mjs — USFM 格式解析器（当代译本 CCB 及标准 USFM 数据源）
 *
 * USFM 标记处理规则：
 *   \id XXX      → 书卷码（经 USFM_ALIASES → OSIS）
 *   \c N         → 章
 *   \v N[文本]   → 节（支持 \v 3-4 范围节号，展开为多节同文本）
 *   \v N-M       → 范围节号
 *   \p \q1 \b \m \s1 \h \toc* \mt*  → 段落 / 标题类标记，忽略
 *   \f ...\f*    → 脚注：连同内容整体剔除（不落入经文）
 *   \x ...\x*    → 交叉引用：连同内容整体剔除
 *   \pn..\pn* \w..\w* \nd..\nd* 等成对字符标记 → 去标记、留内容
 *   行尾续行     → 并入当前节文本
 */

import path from 'node:path';
import { readZipText, readUtf8 } from '../lib/fs-utils.mjs';
import { resolveBook } from '../lib/books.mjs';
import { cleanText, expandVerseRange, isValidChapterVerse } from './common.mjs';

/** 连同内容一起剔除的成对标记（脚注 / 交叉引用） */
const REMOVE_WITH_CONTENT = ['f', 'fe', 'x', 'ex', 'fig', 'xt'];

/** 去标记留内容的成对字符标记 */
const KEEP_CONTENT_PAIRED = [
  'pn', 'w', 'nd', 'sc', 'k', 'add', 'bk', 'dc', 'ior', 'qt', 'sig', 'tl',
  'wa', 'wb', 'wg', 'wh', 'wj', 'wr', 'xs', 'pro', 'rb', 'jmp', 'ord', 'periph',
].join('|');

/** 清理行内 USFM 标记 */
export function stripUsfmInline(text) {
  let t = text;
  // 1. 脚注 / 交叉引用：整段删除（\f + \fr 1:5 \ft ...\f*）
  //    注意：必须用捕获组，\1 反向引用才能回指标记名
  const removeRe = new RegExp(`\\\\(${REMOVE_WITH_CONTENT.join('|')})[+-]?\\s[\\s\\S]*?\\\\\\1\\*`, 'g');
  t = t.replace(removeRe, '');
  // 2. 成对字符标记：保留内容
  const keepRe = new RegExp(`\\\\(${KEEP_CONTENT_PAIRED})\\b[^*]*?\\\\\\1\\*`, 'g');
  t = t.replace(keepRe, '');
  // 3. 兜底：移除任何残留标记（\marker 或 \marker*）
  t = t.replace(/\\[a-zA-Z]+\d*\*?/g, '');
  return t;
}

/**
 * @param {import('../lib/detect.mjs').SourceInfo} source
 * @param {import('../lib/report.mjs').ImportReport} report
 * @returns {Promise<{records: import('./common.mjs').VerseRecord[]}>}
 */
export async function parseUsfm(source, report) {
  const records = [];

  for (const file of source.files) {
    let text;
    try {
      text = source.kind === 'zip'
        ? readZipText(source.path, file)
        : (await readUtf8(path.join(source.path, file))).text;
    } catch (err) {
      report.error('usfm', `文件读取失败，已跳过: ${file} — ${err.message}`);
      continue;
    }

    const lines = text.split(/\r?\n/);
    let osis = null;
    let bookToc3 = null;   // \toc3 短名（如“创”），可作为缩写补充
    let chapter = 0;
    let curVerse = null;   // {verse, parts:[]}

    const flushVerse = () => {
      if (!curVerse) return;
      const text2 = cleanText(stripUsfmInline(curVerse.parts.join(' ')));
      if (text2 && osis) {
        records.push({ osis, chapter, verse: curVerse.verse, text: text2 });
      } else if (osis) {
        report.warn('usfm', `${file} ${chapter}:${curVerse.verse} 清洗后为空，已跳过`);
      }
      curVerse = null;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let m;
      if ((m = /^\\id\s+(\S+)/.exec(line))) {
        flushVerse();
        osis = resolveBook(m[1]);
        if (!osis) report.error('usfm', `${file} 未知书卷码: ${m[1]}`);
        continue;
      }
      if ((m = /^\\toc3\s+(.+)$/.exec(line))) {
        bookToc3 = cleanText(m[1]);
        continue;
      }
      if ((m = /^\\c\s+(\d+)/.exec(line))) {
        flushVerse();
        chapter = Number(m[1]);
        continue;
      }
      if ((m = /^\\v\s+(\d+(?:-\d+)?)\s*(.*)$/.exec(line))) {
        flushVerse();
        const verseNums = expandVerseRange(m[1]);
        if (!verseNums.length) {
          report.error('usfm', `${file} 节号异常: ${m[1]}`);
          continue;
        }
        // 范围节号（\v 3-4）：展开为多节，共用同一文本
        for (const v of verseNums) {
          if (!isValidChapterVerse(chapter, v)) {
            report.error('usfm', `${file} ${chapter}:${v} 节号越界`);
            continue;
          }
          if (v === verseNums[0]) {
            curVerse = { verse: v, parts: [m[2] ?? ''] };
          } else if (osis) {
            const rangeText = cleanText(stripUsfmInline(m[2] ?? ''));
            if (rangeText) {
              records.push({ osis, chapter, verse: v, text: rangeText });
            } else {
              report.warn('usfm', `${file} ${chapter}:${v} 范围节文本为空，已跳过`);
            }
          }
        }
        continue;
      }
      // 其余行首标记（\p \q1 \s1 \b \m \h \toc* \mt* …）：忽略
      if (/^\\/.test(line)) continue;
      // 续行：并入当前节
      if (curVerse) curVerse.parts.push(line);
    }
    flushVerse();

    if (!osis) {
      report.error('usfm', `${file} 未找到 \\id 书卷码，整文件跳过`);
      continue;
    }
    void bookToc3; // 预留：可写入 books.abbreviation 增强
  }
  return { records };
}
