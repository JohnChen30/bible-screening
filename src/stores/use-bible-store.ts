/**
 * use-bible-store — 圣经数据与选区状态（核心 Store）
 *
 * 职责：
 *   - 启动时加载译本元数据 + 66 卷书卷表 + 默认译本数据；
 *   - 维护 Miller Columns 的选区（书卷 / 章 / 起始节 / 结束节）；
 *   - 维护对照模式与激活译本顺序（顺序即可拖拽调整的对照版本列表）；
 *   - 提供按需加载与读取经文的派生方法。
 */

import { create } from 'zustand';
import { chapterCount, fetchBooks, fetchVersions, loadVersionData, verseCount } from '@/lib/bible-api';
import type { BookMeta, CompareMode, Selection, VersionData, VersionMeta } from '@/lib/types';

interface BibleState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  books: BookMeta[];
  versions: VersionMeta[];
  /** 激活中的译本（对照顺序 = 数组顺序，可拖拽调整） */
  activeVersionIds: string[];
  /** 已加载数据的缓存 code → VersionData */
  dataCache: Record<string, VersionData>;

  selection: Selection;
  compareMode: CompareMode;
  /** 神/上帝称呼互换（渲染层动态替换） */
  godTermSwap: boolean;

  loadBible: () => Promise<void>;
  ensureVersion: (code: string) => Promise<void>;
  setSelection: (patch: Partial<Selection>) => void;
  setActiveVersionIds: (ids: string[]) => void;
  toggleVersion: (code: string) => void;
  setCompareMode: (mode: CompareMode) => void;
  setGodTermSwap: (on: boolean) => void;

  /* ---- 派生读取 ---- */
  getVersionMeta: (code: string) => VersionMeta | undefined;
  getChapterCount: (bookId: number | null) => number;
  getVerseCount: (bookId: number | null, chapter: number | null) => number;
}

export const useBibleStore = create<BibleState>((set, get) => ({
  status: 'idle',
  error: null,
  books: [],
  versions: [],
  activeVersionIds: [],
  dataCache: {},
  selection: { bookId: null, chapter: null, startVerse: null, endVerse: null },
  compareMode: 'single',
  godTermSwap: false,

  loadBible: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const [versions, books] = await Promise.all([fetchVersions(), fetchBooks()]);
      // 默认激活：和合本 + 当代译本（中文优先，保证开箱即有对照数据）
      const preferred = ['cuv', 'ccb'].filter((c) => versions.some((v) => v.code === c));
      const active = preferred.length ? preferred : versions.slice(0, 1).map((v) => v.code);
      set({ versions, books, activeVersionIds: active, status: 'ready' });

      await Promise.all(active.map((code) => get().ensureVersion(code)));

      // 默认选区：创世记第 1 章
      const genesis = books.find((b) => b.osis === 'Gen');
      if (genesis) set({ selection: { bookId: genesis.id, chapter: 1, startVerse: null, endVerse: null } });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  ensureVersion: async (code) => {
    if (get().dataCache[code]) return;
    const data = await loadVersionData(code);
    set((s) => ({ dataCache: { ...s.dataCache, [code]: data } }));
  },

  setSelection: (patch) => set((s) => ({ selection: { ...s.selection, ...patch } })),

  setActiveVersionIds: (ids) => {
    // 最多同时启用 2 个译本（对照只支持两版）
    const next = ids.slice(0, 2);
    set((s) => ({
      activeVersionIds: next,
      // 不足 2 个译本时，对照模式自动退回单版
      ...(next.length < 2 && s.compareMode !== 'single' ? { compareMode: 'single' as CompareMode } : {}),
    }));
    void Promise.all(next.map((code) => get().ensureVersion(code)));
  },

  /**
   * 切换某个译本的激活状态。
   * 关键：加入译本后必须把它的经文数据加载进 dataCache —— 否则对照视图
   * （逐节 / 分屏）里该译本没有经文可渲染，看上去就像「只有第一个译本显示」。
   */
  toggleVersion: (code) => {
    set((s) => {
      const has = s.activeVersionIds.includes(code);
      if (has) {
        if (s.activeVersionIds.length <= 1) return s; // 至少保留一个译本
        const next = s.activeVersionIds.filter((c) => c !== code);
        return {
          activeVersionIds: next,
          // 只剩 1 个译本时，对照模式自动退回单版
          ...(next.length < 2 && s.compareMode !== 'single' ? { compareMode: 'single' as CompareMode } : {}),
        };
      }
      if (s.activeVersionIds.length >= 2) return s; // 最多 2 个译本
      return { activeVersionIds: [...s.activeVersionIds, code] };
    });
    void get().ensureVersion(code);
  },

  setCompareMode: (mode) => set({ compareMode: mode }),
  setGodTermSwap: (on) => set({ godTermSwap: on }),

  /* ---- 派生 ---- */
  getVersionMeta: (code) => get().versions.find((v) => v.code === code),

  getChapterCount: (bookId) => {
    const { books, dataCache, activeVersionIds } = get();
    const book = books.find((b) => b.id === bookId);
    if (!book) return 0;
    const code = activeVersionIds.find((c) => dataCache[c]) ?? Object.keys(dataCache)[0];
    if (!code) return 0;
    return chapterCount(dataCache[code], book.osis);
  },

  getVerseCount: (bookId, chapter) => {
    const { books, dataCache, activeVersionIds } = get();
    const book = books.find((b) => b.id === bookId);
    if (!book || chapter == null) return 0;
    const code = activeVersionIds.find((c) => dataCache[c]) ?? Object.keys(dataCache)[0];
    if (!code) return 0;
    return verseCount(dataCache[code], book.osis, chapter);
  },
}));
