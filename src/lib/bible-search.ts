/**
 * bible-search — 经文全文检索
 *
 * 能力：
 *   1. 关键词检索：空格分隔多关键词（AND），大小写不敏感，返回带高亮位置的片段；
 *   2. 结果按书卷顺序 → 章 → 节排序（与圣经次序一致）。
 *
 * 索引按译本懒构建并缓存：以 dataCache 的引用作为失效依据（数据加载后不变更）。
 */

import type { BookMeta, VersionData } from '@/lib/types';

export interface SearchHit {
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  /** 上下文片段（含关键词） */
  snippet: string;
  /** 片段内待高亮区间（相对 snippet 起点） */
  matches: [number, number][];
}

interface IndexEntry {
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  lower: string;
}

interface Index {
  data: VersionData;
  entries: IndexEntry[];
}

const indexCache = new Map<string, Index>();
/** 片段上下文长度（关键词前后各取一部分） */
const SNIPPET_BEFORE = 18;
const SNIPPET_AFTER = 42;
/** 原始命中上限（避免单字查询把全本捞出来排序） */
const RAW_LIMIT = 600;

/** 取（或构建）某译本的扁平索引 */
function getEntries(code: string, data: VersionData | undefined, books: BookMeta[]): IndexEntry[] {
  if (!data) return [];
  const cached = indexCache.get(code);
  if (cached && cached.data === data) return cached.entries;

  const byOsis = new Map(books.map((b) => [b.osis, b]));
  const entries: IndexEntry[] = [];
  for (const [osis, chapters] of Object.entries(data)) {
    const book = byOsis.get(osis);
    if (!book) continue;
    for (const [ch, verses] of Object.entries(chapters)) {
      const chapter = Number(ch);
      if (!Number.isFinite(chapter)) continue;
      for (const [v, text] of Object.entries(verses)) {
        const verse = Number(v);
        if (!Number.isFinite(verse) || !text) continue;
        entries.push({ bookId: book.id, bookName: book.nameCn, chapter, verse, text, lower: text.toLowerCase() });
      }
    }
  }
  indexCache.set(code, { data, entries });
  return entries;
}

/** 取片段：以首个关键词为中心截取上下文 */
function buildSnippet(text: string, terms: string[]): { snippet: string; offset: number } | null {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return null;
  const start = Math.max(0, pos - SNIPPET_BEFORE);
  const end = Math.min(text.length, start + SNIPPET_BEFORE + SNIPPET_AFTER);
  const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  // '…' 占位使片段内偏移与原文对齐
  return { snippet, offset: start - (start > 0 ? 1 : 0) };
}

/** 片段内所有关键词的出现区间（合并重叠） */
function matchesIn(snippet: string, terms: string[]): [number, number][] {
  const lower = snippet.toLowerCase();
  const raw: [number, number][] = [];
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(t, from);
      if (i < 0) break;
      raw.push([i, i + t.length]);
      from = i + t.length;
    }
  }
  if (!raw.length) return raw;
  raw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [raw[0]];
  for (const [s, e] of raw.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/**
 * 全文检索（多译本去重：同一节只保留首个命中的译本）
 * @param limit 返回条数上限
 */
export function searchBible({
  codes,
  dataCache,
  books,
  query,
  limit = 40,
}: {
  codes: string[];
  dataCache: Record<string, VersionData>;
  books: BookMeta[];
  query: string;
  limit?: number;
}): SearchHit[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (!terms.length) return [];

  const order = new Map(books.map((b, i) => [b.id, i]));
  const seen = new Set<string>();
  const raw: SearchHit[] = [];

  for (const code of codes) {
    const entries = getEntries(code, dataCache[code], books);
    for (const e of entries) {
      if (raw.length >= RAW_LIMIT) break;
      const key = `${e.bookId}:${e.chapter}:${e.verse}`;
      if (seen.has(key)) continue;
      if (!terms.every((t) => e.lower.includes(t))) continue;
      seen.add(key);
      const sn = buildSnippet(e.text, terms);
      if (!sn) continue;
      raw.push({
        bookId: e.bookId,
        bookName: e.bookName,
        chapter: e.chapter,
        verse: e.verse,
        snippet: sn.snippet,
        matches: matchesIn(sn.snippet, terms),
      });
    }
    if (raw.length >= RAW_LIMIT) break;
  }

  raw.sort((a, b) => {
    const ob = (order.get(a.bookId) ?? 0) - (order.get(b.bookId) ?? 0);
    if (ob !== 0) return ob;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });
  return raw.slice(0, limit);
}
