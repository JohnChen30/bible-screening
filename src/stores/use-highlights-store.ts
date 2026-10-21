/**
 * use-highlights-store — 单节高亮 / 下划线（按面板隔离）
 *
 * key: `${versionCode}:${bookId}:${chapter}:${verse}`
 *
 * 用户反馈：高亮与下划线「只在单一面板上生效，不是永久保存」。因此：
 *   - 按面板隔离：每个面板一份独立的高亮，切换面板自动切到该面板自己的高亮；
 *   - 普通面板不持久化：属于「本次演示临时标注」，刷新 / 重启后清空；
 *   - **例外：固定「圣经」面板（BIBLE_PANEL_ID）** —— 它的标注单独写入 localStorage，
 *     只要用户没有手动清除就一直保留（重启软件也在）。见 saveFixedBucket。
 *   - 投影窗经 payload 只接收「当前活动面板」的高亮，保证三屏所见一致。
 *
 * 未激活任何面板时（activePanelId 为 null）落到 __none__ 桶，
 * 这样自由选区（非面板）下也能正常标注。
 */

import { create } from 'zustand';
import { BIBLE_PANEL_ID, type TextHighlight } from '@/lib/types';

/** 未归属面板时的桶 key */
export const NO_PANEL = '__none__';

/** 面板 →（verseKey → 高亮列表） */
type HighlightsByPanel = Record<string, Record<string, TextHighlight[]>>;

/** 固定「圣经」面板标注的持久化 key（只存这一个面板） */
const FIXED_HL_KEY = 'bible-fixed-highlights';

function loadFixedBucket(): Record<string, TextHighlight[]> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(FIXED_HL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, TextHighlight[]>) : {};
  } catch {
    return {};
  }
}

function saveFixedBucket(bucket: Record<string, TextHighlight[]> | undefined): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FIXED_HL_KEY, JSON.stringify(bucket ?? {}));
  } catch {
    /* 隐私模式 / 配额满：忽略 */
  }
}

/** 本次变更若作用于固定面板，把它的整桶写回 localStorage（长期保留） */
function persistIfFixed(panelId: string, byPanel: HighlightsByPanel): void {
  if (panelId === BIBLE_PANEL_ID) saveFixedBucket(byPanel[BIBLE_PANEL_ID]);
}

interface HighlightsState {
  byPanel: HighlightsByPanel;
  add: (panelId: string, key: string, h: Omit<TextHighlight, 'id'>) => void;
  update: (panelId: string, key: string, id: string, patch: Partial<Omit<TextHighlight, 'id'>>) => void;
  remove: (panelId: string, key: string, id: string) => void;
  clear: (panelId: string, key: string) => void;
  /** 清空某面板桶内的全部高亮 / 下划线（「清除此页所有格式」用） */
  clearPanel: (panelId: string) => void;
  /** 以主控台广播的快照合并到指定面板桶（投影窗口 hydration，保证三屏一致） */
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
  // 启动即恢复固定面板的持久标注（其它面板为空 → 临时）
  byPanel: { [BIBLE_PANEL_ID]: loadFixedBucket() },

  add: (panelId, key, h) =>
    set((s) => {
      const byPanel = patchList(s.byPanel, panelId, key, (l) => [
        ...l,
        { ...h, id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` },
      ]);
      persistIfFixed(panelId, byPanel);
      return { byPanel };
    }),

  update: (panelId, key, id, patch) =>
    set((s) => {
      const byPanel = patchList(s.byPanel, panelId, key, (l) =>
        l.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      );
      persistIfFixed(panelId, byPanel);
      return { byPanel };
    }),

  remove: (panelId, key, id) =>
    set((s) => {
      const byPanel = patchList(s.byPanel, panelId, key, (l) => l.filter((h) => h.id !== id));
      persistIfFixed(panelId, byPanel);
      return { byPanel };
    }),

  clear: (panelId, key) =>
    set((s) => {
      const bucket = { ...(s.byPanel[panelId] ?? {}) };
      delete bucket[key];
      const byPanel = { ...s.byPanel, [panelId]: bucket };
      persistIfFixed(panelId, byPanel);
      return { byPanel };
    }),

  clearPanel: (panelId) =>
    set((s) => {
      const next = { ...s.byPanel };
      delete next[panelId];
      persistIfFixed(panelId, next);
      return { byPanel: next };
    }),

  replaceAll: (panelId, highlights) =>
    set((s) => {
      const pid = panelId ?? NO_PANEL;
      // 合并而不是整体替换：避免投影窗广播「其它面板」时把固定面板的持久桶冲掉
      const byPanel = { ...s.byPanel, [pid]: highlights };
      if (pid === BIBLE_PANEL_ID) saveFixedBucket(highlights);
      return { byPanel };
    }),
}));
