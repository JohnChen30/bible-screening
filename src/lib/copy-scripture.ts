/**
 * copy-scripture — 把「选中的经文」拼成可复制文本
 *
 * 关键要求（用户）：
 *   1. 复制**选中**的经文，**统一每节一行**（无论面板是逐节还是段落排版），行首带节号；
 *   2. 复制结果**带标题**，且标题是这份经文的「专属标题」——内容对应所选节范围：
 *      · 选中的节连号（如 3,4,5）→ 区间「创世记 第1章 3-5节」；
 *      · 选中的节不连号但同章（如 3,5,7）→ 逗号「创世记 第1章 3,5,7节」；
 *      · 只选一节 → 「创世记 第1章 3节」；
 *      （reference 格式同理：「创世记 1:3-5」「创世记 1:3,5,7」）
 *
 * 选区来源有两类：
 *   · 拖选文字 → use-text-selection-store 的 PendingRange（每节一段字符区间）；
 *   · 单击整节（可多选）→ usePanelsStore 的 highlightedVerses（整节全文，start=0/end=∞）。
 * 这里把两类合并后，按译本 → 书:章 分组，逐节从数据缓存取原文并按偏移切出选中部分，
 * 每节一行拼装，最后附上专属标题。
 */

import type { BookMeta, VersionData } from '@/lib/types';
import type { PendingRange } from '@/stores/use-text-selection-store';

/** 单击选中的整节（整节全文参与复制） */
export interface WholeVerse {
  versionCode: string;
  bookId: number;
  chapter: number;
  verse: number;
}

export interface CopyScriptureOptions {
  /** 书卷元数据（取 nameCn / osis） */
  books: BookMeta[];
  /** 经文数据缓存：code -> osis -> chapter -> verse -> text */
  dataCache: Record<string, VersionData>;
  /** 是否显示节号 */
  showVerseNumber: boolean;
  /** 标题格式：第X章 / 章:节区间 */
  titleFormat: 'chapterCn' | 'reference';
  /** 译本 code → 展示名（多译本同时选中时用于区分区块） */
  versionName: (code: string) => string;
  /** 译本 code → 语言（如 'en' / 'zh-Hans'）：英文译本标题使用英文格式 */
  versionLanguage?: (code: string) => string;
  /** 面板译本顺序（左 / 上在前）：双译本时决定区块先后 */
  versionOrder?: string[];
  /** 单击选中的整节（整节全文参与复制，作为 start=0/end=∞ 的整段区间） */
  wholeVerses?: WholeVerse[];
}

function getVerseText(
  dataCache: Record<string, VersionData>,
  code: string,
  osis: string,
  chapter: number,
  verse: number,
): string | null {
  const data = dataCache[code];
  if (!data) return null;
  const ch = data[osis]?.[String(chapter)];
  if (!ch) return null;
  const t = ch[String(verse)];
  return typeof t === 'string' ? t : null;
}

/**
 * 按字符偏移合并同一节的多段选区（去掉重叠 / 间隙），还原该节被选中部分的纯文本。
 * 通常一次拖选同一节只会得到一段区间；此处仍做合并以兼容极端的多次选区。
 */
function sliceVerseText(full: string, ranges: PendingRange[]): string {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const r of sorted) {
    const s = Math.max(r.start, cursor);
    if (r.end <= s) continue;
    out += full.slice(s, r.end);
    cursor = r.end;
  }
  return out;
}

/**
 * 生成与面板一致的「专属标题」——只对应这份选区的节范围。
 * 连号 → 区间；不连号但同章 → 逗号分隔节号；单节 → 单节号。
 */
function buildTitle(
  book: BookMeta | undefined,
  chapter: number,
  verses: number[],
  titleFormat: 'chapterCn' | 'reference',
  isEn = false,
): string {
  if (!book || verses.length === 0) return '';
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const contig = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  const minV = sorted[0];
  const maxV = sorted[sorted.length - 1];

  // 英文译本：统一使用西式引用格式（Genesis 1:3-5 / Genesis 1:3,5,7）
  if (isEn) {
    if (sorted.length === 1) return `${book.nameEn} ${chapter}:${minV}`;
    if (contig) return `${book.nameEn} ${chapter}:${minV}-${maxV}`;
    return `${book.nameEn} ${chapter}:${sorted.join(',')}`;
  }

  if (titleFormat === 'reference') {
    if (sorted.length === 1) return `${book.nameCn} ${chapter}:${minV}`;
    if (contig) return `${book.nameCn} ${chapter}:${minV}-${maxV}`;
    return `${book.nameCn} ${chapter}:${sorted.join(',')}`;
  }
  if (sorted.length === 1) return `${book.nameCn} 第${chapter}章 ${minV}节`;
  if (contig) return `${book.nameCn} 第${chapter}章 ${minV}-${maxV}节`;
  return `${book.nameCn} 第${chapter}章 ${sorted.join(',')}节`;
}

/** 把选中的经文拼成可复制文本（含专属标题）；无选区返回 null */
export function buildScriptureCopyText(ranges: PendingRange[], opts: CopyScriptureOptions): string | null {
  // 合并拖选区间与「单击整节」选区（单击整节视作 start=0 / end=∞ 的整段区间）
  const all: PendingRange[] = [...ranges];
  if (opts.wholeVerses?.length) {
    for (const v of opts.wholeVerses) {
      all.push({
        versionCode: v.versionCode,
        bookId: v.bookId,
        chapter: v.chapter,
        verse: v.verse,
        start: 0,
        end: Number.MAX_SAFE_INTEGER,
      });
    }
  }
  if (!all.length) return null;
  const { books, dataCache, showVerseNumber, titleFormat, versionName } = opts;

  // 先按译本分组（保持选中出现的顺序）
  const byVersion = new Map<string, PendingRange[]>();
  for (const r of all) {
    if (!byVersion.has(r.versionCode)) byVersion.set(r.versionCode, []);
    byVersion.get(r.versionCode)!.push(r);
  }

  const blocks: string[] = [];
  const multiVersion = byVersion.size > 1;
  // 双译本时按面板顺序（左 / 上在前）输出区块，而不是按选区出现顺序
  const order = opts.versionOrder ?? [];
  const orderedCodes = [...byVersion.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
  });

  for (const code of orderedCodes) {
    const rs = byVersion.get(code)!;
    const isEn = (opts.versionLanguage?.(code) ?? 'zh-Hans').startsWith('en');
    // 再按 书:章 分段（跨章选区各自成块，各带自己的标题）
    const bySection = new Map<string, PendingRange[]>();
    for (const r of rs) {
      const key = `${r.bookId}:${r.chapter}`;
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(r);
    }

    const sectionBlocks: string[] = [];
    for (const [, sRanges] of bySection) {
      const first = sRanges[0];
      const bookId = first.bookId;
      const chapter = first.chapter;
      const book = books.find((b) => b.id === bookId);

      // 逐节收集选中区间
      const byVerse = new Map<number, PendingRange[]>();
      for (const r of sRanges) {
        if (!byVerse.has(r.verse)) byVerse.set(r.verse, []);
        byVerse.get(r.verse)!.push(r);
      }
      const verses = [...byVerse.keys()].sort((a, b) => a - b);

      // 统一每节一行（节号可配置），无论面板是逐节还是段落排版
      const lines: string[] = [];
      for (const v of verses) {
        const full = getVerseText(dataCache, code, book?.osis ?? '', chapter, v);
        const text = full ? sliceVerseText(full, byVerse.get(v)!) : '';
        lines.push(showVerseNumber ? `${v} ${text}` : text);
      }

      const title = buildTitle(book, chapter, verses, titleFormat, isEn);
      const head = multiVersion ? `${versionName(code)}\n${title}` : title;
      sectionBlocks.push(`${head}\n${lines.join('\n')}`);
    }
    blocks.push(sectionBlocks.join('\n\n'));
  }

  return blocks.join('\n\n');
}
