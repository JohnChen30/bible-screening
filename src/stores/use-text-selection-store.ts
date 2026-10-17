/**
 * use-text-selection-store — 光标「拖选文字」临时态（不持久化）
 *
 * 只承载一类选区：**拖选文字**（ranges）——用户拖选一段经文文字，解析成若干字符区间，
 * 供底部控件条（高亮 / 下划线）只作用于这些区间，也是「复制经文」的来源之一。
 *
 * 「单击整节（可多选）」不走本 store，而是用 use-panels-store 的 highlightedVerses
 * （整节强调色集合）——它本身就是多选集合，复制时按整节全文参与，复制后一并清空，
 * 见 SelectionCopyBar / copy-scripture。
 *
 * 快照在拖选时更新；点击高亮 / 下划线后仍保留（以便同一选区连续加高亮 + 下划线）；
 * 用户重新拖选会覆盖；可点 ✕ 手动清除。
 */

import { create } from 'zustand';

/** 一个字符区间（相对某节某译本的纯经文文本） */
export interface PendingRange {
  versionCode: string;
  bookId: number;
  chapter: number;
  verse: number;
  start: number;
  end: number;
}

interface TextSelectionState {
  /** 拖选解析出的字符区间（可能跨多节 / 多译本） */
  ranges: PendingRange[];
  setRanges: (r: PendingRange[]) => void;
  clear: () => void;
}

/** 点击「复制经文」按钮时短暂抑制选区守卫：按钮点击会让文字选区折叠、触发 selectionchange
 *  误清空本 store（导致 copy 时 ranges 已空）。按钮 onMouseDown 置真，300ms 后复位。 */
export const selectionFlags = { suppressClear: false };
export function suppressSelectionClearFor() {
  selectionFlags.suppressClear = true;
  window.setTimeout(() => {
    selectionFlags.suppressClear = false;
  }, 300);
}

export const useTextSelectionStore = create<TextSelectionState>((set) => ({
  ranges: [],
  setRanges: (r) => set({ ranges: r }),
  clear: () => set({ ranges: [] }),
}));
