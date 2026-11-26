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
  'qs', 'q', 'fq', 'em', 'bd', 'it', 'bdit', 'no', 'sup',
].join('|');

/**
 * 结构 / 标题类标记：整行忽略（即使后面带文字）。
 * 段落与诗体标记（p / q1 / q2 / m / li1 / d / sp / pr …）后面若有文字，
 * 属于经文续行，必须并入当前节，不能整行丢弃。
 */
const STRUCTURE_LINE_MARKERS = new Set([
  'id', 'h', 'toc1', 'toc2', 'toc3', 'mt1', 'mt2', 'mt3',
  's1', 's2', 's3', 's4', 's5', 'ms1', 'ms2', 'mr', 'sr', 'r', 'cl',
  'b', 'cp', 'ca', 'vp', 'rem', 'restore', 'stu',
]);

/** 清理行内 USFM 标记 */
export function stripUsfmInline(text) {
  let t = text;
  // 1. 脚注 / 交叉引用：整段删除（\f + \fr 1:5 \ft ...\f*）
  //    注意：必须用捕获组，\1 反向引用才能回指标记名
  const removeRe = new RegExp(`\\\\(${REMOVE_WITH_CONTENT.join('|')})[+-]?\\s[\\s\\S]*?\\\\\\1\\*`, 'g');
  t = t.replace(removeRe, '');
  // 2. 成对字符标记：只去标记、保留内容（\pn 伊甸\pn* → 伊甸）
  const keepRe = new RegExp(`\\\\(${KEEP_CONTENT_PAIRED})\\s*([^*]*?)\\\\\\1\\*`, 'g');
  t = t.replace(keepRe, (_m, _marker, content) => content.trim());
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
    let curVerse = null;   // {verses:[节号...], parts:[]} —— 范围节号共用同一段完整文本

    const flushVerse = () => {
      if (!curVerse) return;
      const text2 = cleanText(stripUsfmInline(curVerse.parts.join(' ')));
      if (text2 && osis) {
        // 范围节号（如 \v 1-2）后续诗体续行属于整段，所有节均应得到完整文本
        for (const v of curVerse.verses) {
          records.push({ osis, chapter, verse: v, text: text2 });
        }
      } else if (osis) {
        report.warn('usfm', `${file} ${chapter}:${curVerse.verses.join('-')} 清洗后为空，已跳过`);
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
        const verseNums = expandVerseRange(m[1]).filter((v) => {
          if (isValidChapterVerse(chapter, v)) return true;
          report.error('usfm', `${file} ${chapter}:${v} 节号越界`);
          return false;
        });
        if (!verseNums.length) {
          report.error('usfm', `${file} 节号异常: ${m[1]}`);
          continue;
        }
        curVerse = { verses: verseNums, parts: [m[2] ?? ''] };
        continue;
      }
      // 行首标记：结构 / 标题类整行忽略；段落 / 诗体类标记后的文字属于经文续行
      const markerMatch = /^\\([a-zA-Z]+\d*)\s*(.*)$/.exec(line);
      if (markerMatch) {
        if (STRUCTURE_LINE_MARKERS.has(markerMatch[1])) continue;
        // 脚注跨行续行（本项目数据源均为单行脚注，此处仅作防御）
        if (/^(f|fe|x|ex|fig|xt)$/.test(markerMatch[1])) continue;
        const rest = markerMatch[2];
        if (rest.trim() && curVerse) curVerse.parts.push(rest);
        continue;
      }
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
