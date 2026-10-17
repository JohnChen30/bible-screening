/**
 * use-highlights-store — 单节高亮 / 下划线（临时态，按面板隔离）
 *
 * key: `${versionCode}:${bookId}:${chapter}:${verse}`
 *
 * 用户反馈：高亮与下划线「只在单一面板上生效，不是永久保存」。因此：
 *   - 按面板隔离：每个面板一份独立的高亮，切换面板自动切到该面板自己的高亮，
 *     不会把A 面板的标注带到 B 面板；
 *   - 不持久化：整个 store 不接persist，刷新 / 重启应用后一律清空，
 *     属于「本次演示临时标注」，不是永久数据；
 *   - 投影窗经 payload 只接收「当前活动面板」的高亮，保证三屏所见一致。
 *
 * 未激活任何面板时（activePanelId 为 null）落到 __none__ 桶，
 * 这样自由选区（非面板）下也能正常标注。
 */

import { create } from 'zustand';
import type { TextHighlight } from '@/lib/types';

/** 未归属面板时的桶 key */
export const NO_PANEL = '__none__';

/** 面板 →（verseKey → 高亮列表） */
type HighlightsByPanel = Record<string, Record<string, TextHighlight[]>>;

interface HighlightsState {
  byPanel: HighlightsByPanel;
  add: (panelId: string, key: string, h: Omit<TextHighlight, 'id'>) => void;
  update: (panelId: string, key: string, id: string, patch: Partial<Omit<TextHighlight, 'id'>>) => void;
  remove: (panelId: string, key: string, id: string) => void;
  clear: (panelId: string, key: string) => void;
  /** 清空某面板桶内的全部高亮 / 下划线（「清除此页所有格式」用） */
  clearPanel: (panelId: string) => void;
  /** 以主控台广播的快照整体替换到指定面板桶（投影窗口 hydration，保证三屏一致） */
  replaceAll: (panelId: string | null, highlights: Record<string, TextHighlight[]>) => void;
}

export const verseKey = (versionCode: string, bookId: number, chapter: number, verse: number) =>
  `${versionCode}:${bookId}:${chapter}:${verse}`;

/** 取某面板的高亮映射（无则空对象） */
export const highlightsOf = (byPanel: HighlightsByPanel, panelId: string | null) =>
  byPanel[panelId ?? NO_PANEL] ?? {};

const patchList = (
  byPanel: HighlightsByPanel,
  panelId: string,
  key: string,
  fn: (list: TextHighlight[]) => TextHighlight[],
): HighlightsByPanel => ({
  ...byPanel,
  [panelId]: { ...(byPanel[panelId] ?? {}), [key]: fn(byPanel[panelId]?.[key] ?? []) },
});

export const useHighlightsStore = create<HighlightsState>((set) => ({
  byPanel: {},
  add: (panelId, key, h) =>
    set((s) => ({
      byPanel: patchList(s.byPanel, panelId, key, (l) => [
        ...l,
        { ...h, id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` },
      ]),
    })),
  update: (panelId, key, id, patch) =>
    set((s) => ({
      byPanel: patchList(s.byPanel, panelId, key, (l) => l.map((h) => (h.id === id ? { ...h, ...patch } : h))),
    })),
  remove: (panelId, key, id) =>
    set((s) => ({
      byPanel: patchList(s.byPanel, panelId, key, (l) => l.filter((h) => h.id !== id)),
    })),
  clear: (panelId, key) =>
    set((s) => {
      const bucket = { ...(s.byPanel[panelId] ?? {}) };
      delete bucket[key];
      return { byPanel: { ...s.byPanel, [panelId]: bucket } };
    }),
  clearPanel: (panelId) =>
    set((s) => {
      const next = { ...s.byPanel };
      delete next[panelId];
      return { byPanel: next };
    }),
  replaceAll: (panelId, highlights) => set({ byPanel: { [panelId ?? NO_PANEL]: highlights } }),
}));