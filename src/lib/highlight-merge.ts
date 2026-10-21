/**
 * highlight-merge — 跨译本合并同一节的高亮 / 下划线
 *
 * 背景：高亮按 `${versionCode}:${bookId}:${chapter}:${verse}` 存储。分屏对照 / 逐节对照
 * 下，同一面板的同一节会渲染在多个译本上；若各窗格只查自己版本的 key，标注就不同步。
 *
 * 这里在渲染时把「同一节在所有相关译本上的标注」合并到当前译本：
 * 其它译本的字符区间按「源节长度 → 目标节长度」等比映射，整节高亮（0..len）自然映射为整节。
 * 并按「颜色|下划线|区间」去重，避免多译本写入同一标注时重复渲染（双重着色）。
 */

import type { TextHighlight } from '@/lib/types';
import { useBibleStore } from '@/stores/use-bible-store';
import { verseKey } from '@/stores/use-highlights-store';

/** 某译本某节的纯文本长度（用于跨译本区间映射） */
export function verseTextLength(versionCode: string, bookId: number, chapter: number, verse: number): number {
  const { dataCache, books } = useBibleStore.getState();
  const data = dataCache[versionCode];
  const osis = books.find((b) => b.id === bookId)?.osis;
  if (!data || !osis) return 0;
  return data[osis]?.[String(chapter)]?.[String(verse)]?.length ?? 0;
}

/**
 * 合并同一节在多个译本上的高亮，映射到 targetCode 的字符区间。
 * codes 只含 targetCode 时等价于原来的按版本查找。
 */
export function mergeHighlightsAcrossVersions(
  map: Record<string, TextHighlight[]>,
  codes: string[],
  targetCode: string,
  bookId: number,
  chapter: number,
  verse: number,
): TextHighlight[] {
  const tgtLen = verseTextLength(targetCode, bookId, chapter, verse);
  const out: TextHighlight[] = [];
  const seen = new Set<string>();

  for (const code of codes) {
    const list = map[verseKey(code, bookId, chapter, verse)];
    if (!list || list.length === 0) continue;
    const srcLen = verseTextLength(code, bookId, chapter, verse) || tgtLen;

    for (const h of list) {
      let start = h.start;
      let end = h.end;
      // 跨译本：按长度比例映射（整节 0..srcLen → 0..tgtLen）
      if (code !== targetCode && srcLen > 0 && tgtLen > 0 && srcLen !== tgtLen) {
        start = Math.round((h.start / srcLen) * tgtLen);
        end = Math.round((h.end / srcLen) * tgtLen);
      }
      start = Math.max(0, Math.min(start, tgtLen));
      end = Math.max(start, Math.min(end, tgtLen));

      const sig = `${h.color ?? ''}|${h.underline ? 1 : 0}|${start}|${end}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ ...h, start, end });
    }
  }
  return out;
}
