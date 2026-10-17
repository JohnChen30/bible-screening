/**
 * use-panels-store — 投影控制与多面板系统
 *
 * 投影模型（v3，按反馈重构）：
 *   - 投影严格只能由「投影按钮」触发 / 退出；
 *   - 投影内容 = 阅读区当前视图的整页照搬（非单节）；
 *   - 跟读游标：点击经文即定位游标，投影页同步滚动跟随（无翻节导航）；
 *   - 黑屏 / 清屏 / 自动滚动 5 档；
 *   - 三屏排版统一：payload 携带 reader settings 快照，/output 照搬渲染；
 *   - 多面板：收藏选区快照，点击即套用该选区并投影。
 *
 * 经文段模型（v4，本次新增）：
 *   - 面板内容由 passages: PassageItem[] 组成，可经「添加到后续」逐步追加；
 *   - 阅读 / 预览 / 投影三屏均遍历渲染 passages，段间加淡分割线；
 *   - 跟读游标携带 bookId/chapter，保证多段面板上高亮 / 跟读定位到正确经节。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { publishProjection } from '@/lib/projection-channel';
import { useBibleStore } from '@/stores/use-bible-store';
import { useCanvasSettingsStore } from '@/stores/use-canvas-settings-store';
import { useProjectionSettingsStore } from '@/stores/use-projection-settings-store';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';
import { highlightsOf, useHighlightsStore } from '@/stores/use-highlights-store';
import {
  formatPassageRef,
  normalizePanel,
  toPassage,
  toSelection,
  DEFAULT_SELECT_COLOR,
  type Panel,
  type PassageItem,
  type ProjectionPayload,
  type Selection,
  type TypographySnapshot,
} from '@/lib/types';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/** 高亮节复合键：bookId:chapter:verse（跨多段面板唯一，避免不同章同节号错位高亮） */
export const highlightKey = (bookId: number, chapter: number, verse: number) => `${bookId}:${chapter}:${verse}`;

interface PanelsState {
  isProjecting: boolean;
  /** 跟读游标：当前节号 */
  cursorVerse: number | null;
  /** 点击经文高亮的节 ID 集合（复合键，可多节同时强调；非持久化临时标注） */
  highlightedVerses: string[];
  /** 强调色（选中经文的文字/节号颜色）；可在工具栏自由设置，三屏同步 */
  selectColor: string;
  /** 单选模式：开启后点击经文只选中一节（选择别的节原强调色消失）；关闭为多选 */
  singleSelectMode: boolean;
  blackout: boolean;
  cleared: boolean;
  autoScroll: number; // 0..5
  panels: Panel[];
  activePanelId: string | null;
  /**
   * 基准画布宽度：主控台预览画布实测宽度。
   * 预览屏 scale=1，投影屏 scale = 自身画布宽 / 本值 → 投影 = 预览的等比放大。
   */
  baseWidth: number;
  setBaseWidth: (w: number) => void;

  startProjection: () => void;
  stopProjection: () => void;
  /** 设置跟读游标（点击经文即调用，不触发投影） */
  setCursor: (verse: number | null) => void;
  /** 点击经文：在 highlightedVerses 集合中切换该节（再次点击同节即取消）；同时把该节定为跟读游标（投影跟随）。单选模式下只保留这一节 */
  toggleHighlight: (verse: number, bookId?: number | null, chapter?: number | null) => void;
  /** 设置单选模式（点击只选中一节） */
  setSingleSelectMode: (v: boolean) => void;
  /** 设置强调色（选中经文颜色） */
  setSelectColor: (c: string) => void;
  /** 清空全部点击高亮 */
  clearHighlightedVerses: () => void;
  /** 从选中集合移除指定节（光标选区高亮时，撤掉该节整节强调色，仅保留精确选区高亮） */
  removeHighlightedVerse: (key: string) => void;
  toggleBlackout: () => void;
  clearScreen: () => void;
  setAutoScroll: (speed: number) => void;

  addPanel: () => void;
  removePanel: (id: string) => void;
  activatePanel: (id: string) => void;
  /** 追加一段经文到指定面板（「添加到后续」） */
  appendPassage: (panelId: string, passage: PassageItem) => void;
  /** 以给定单段经文新建一个面板并激活（搜索结果「跳转」用），同时同步全局选区 */
  addPanelWithPassage: (passage: PassageItem) => void;
  /** 替换当前活动面板内容为单段（Miller Columns 浏览即编辑当前面板；不改写其它面板） */
  replaceActivePanel: (passage: PassageItem) => void;
  /** 启动时按设置决定「打开新面板」或「保留原面板」（数据就绪后调用一次） */
  applyPanelStartup: () => void;

  /** 广播当前投影负载（内部） */
  sync: () => void;
}

/** 是否运行在 Tauri 运行时内（v2 注入 __TAURI_INTERNALS__） */
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 打开（或复用）投影窗口：动态创建 'output' webview 并加载 index.html#/output 路由（HashRouter，规避 Tauri 无 SPA fallback） */
let projectionWindowInFlight = false;
function openProjectionWindow(): void {
  if (!isTauri() || projectionWindowInFlight) return;
  projectionWindowInFlight = true;
  void WebviewWindow.getByLabel('output').then((existing) => {
    if (existing) {
      void existing.show();
      projectionWindowInFlight = false;
      return;
    }
    const webview = new WebviewWindow('output', {
      url: 'index.html#/output',
      fullscreen: true,
      decorations: false,
      visible: false, // 加载完再显示
    });
    webview.once('tauri://created', () => {
      webview.show();
      projectionWindowInFlight = false;
    });
    webview.once('tauri://error', (e) => {
      console.error('[projection] 投影窗口创建失败', e);
      projectionWindowInFlight = false;
    });
  });
}

/** 关闭投影窗口 */
function closeProjectionWindow(): void {
  if (!isTauri()) return;
  void WebviewWindow.getByLabel('output').then((w) => {
    if (w) void w.close();
  });
}

/** 当前三屏应渲染的经文段（活动面板优先，否则由全局选区退化）
 *
 * 有活动面板时**一律以其 passages 为准**：新建面板为空（passages:[]）→ 返回空数组，
 * 三屏渲染清屏画面（空白画布），不再回退到全局选区（否则空面板会“自作主张”显示出默认经文，
 * 与「新建面板先清屏、选经文再上屏」相悖）。仅当无活动面板时才用全局选区退化。
 */
export function getViewPassages(): PassageItem[] {
  const ps = usePanelsStore.getState();
  const active = ps.panels.find((p) => p.id === ps.activePanelId);
  if (active) return active.passages ?? [];
  const bible = useBibleStore.getState();
  if (bible.selection.bookId != null) return [toPassage(bible.selection)];
  return [];
}

/** 汇总当前投影负载 */
function buildPayload(): ProjectionPayload {
  const bible = useBibleStore.getState();
  const ps = usePanelsStore.getState();
  const rs = useReaderSettingsStore.getState();
  const book = bible.books.find((b) => b.id === bible.selection.bookId);
  // 统一排版快照：阅读 / 预览 / 投影三屏共用（所见即所得）
  const typography: TypographySnapshot = {
    fontSize: rs.fontSize,
    lineHeight: rs.lineHeight,
    bold: rs.bold,
    fontFamily: rs.fontFamily,
    margin: rs.margin,
    layoutMode: rs.layoutMode,
    showVerseNumber: rs.showVerseNumber,
    titleFormat: rs.titleFormat,
    titleMode: rs.titleMode,
    textColor: rs.textColor,
    verseNumberColor: rs.verseNumberColor,
    titleColor: rs.titleColor,
    backgroundColor: rs.backgroundColor,
    texture: rs.texture,
    titleAlign: rs.titleAlign,
    verseAlign: rs.verseAlign,
  };
  return {
    isProjecting: ps.isProjecting,
    selection: bible.selection,
    versionCodes: bible.activeVersionIds,
    compareMode: bible.compareMode,
    cursorVerse: ps.cursorVerse,
    blackout: ps.blackout,
    cleared: ps.cleared,
    godTermSwap: bible.godTermSwap,
    bookName: book?.nameCn ?? '',
    versionNames: bible.activeVersionIds.map((c) => bible.versions.find((v) => v.code === c)?.name ?? c),
    aspectRatio: useCanvasSettingsStore.getState().aspectRatio,
    baseWidth: ps.baseWidth,
    autoScroll: ps.autoScroll,
    // 只广播「当前活动面板」的高亮：面板隔离，投影窗所见 = 当前面板所见
    highlights: highlightsOf(useHighlightsStore.getState().byPanel, ps.activePanelId),
    highlightedVerses: ps.highlightedVerses,
    selectColor: ps.selectColor,
    activePanelId: ps.activePanelId,
    // 三屏渲染内容：活动面板 passages（无则全局选区退化）
    passages: getViewPassages(),
    typography,
  };
}

/** 由经文段列表生成面板名（首段 + 段数汇总，避免过长） */
function panelNameFromPassages(bible: ReturnType<typeof useBibleStore.getState>, passages: PassageItem[]): string {
  if (passages.length === 0) return '空面板';
  const first = passages[0];
  const book = bible.books.find((b) => b.id === first.bookId);
  const firstRef = book ? formatPassageRef(book.nameCn, first) : `${first.chapter}`;
  if (passages.length === 1) return firstRef;
  return `${firstRef} 等${passages.length}段`;
}

export const usePanelsStore = create<PanelsState>()(
  persist(
    (set, get) => ({
      isProjecting: false,
      cursorVerse: null,
      highlightedVerses: [],
      selectColor: DEFAULT_SELECT_COLOR,
      singleSelectMode: false,
      blackout: false,
      cleared: false,
      autoScroll: 0,
      panels: [],
      activePanelId: null,
      baseWidth: 0,
      setBaseWidth: (w) => {
        if (Math.abs(get().baseWidth - w) < 1) return;
        set({ baseWidth: w });
        get().sync();
      },

      sync: () => publishProjection(buildPayload()),

      startProjection: () => {
        // 用户反馈：已去掉「默认自动滚动速度」，开始投影不再自动滚动
        set({ isProjecting: true, blackout: false, cleared: false, autoScroll: 0 });
        openProjectionWindow();
        get().sync();
      },

  stopProjection: () => {
    set({ isProjecting: false, blackout: false, cleared: false, autoScroll: 0 });
    closeProjectionWindow();
    get().sync();
  },

  setCursor: (verse) => {
    set({ cursorVerse: verse });
    get().sync();
  },

  toggleHighlight: (verse, bookId, chapter) => {
    const key = highlightKey(bookId ?? 0, chapter ?? 0, verse);
    const single = get().singleSelectMode;
    set((s) => {
      // 单选模式：只保留这一节（再次点同一节则取消）
      if (single) {
        const onlyThis = s.highlightedVerses.length === 1 && s.highlightedVerses[0] === key;
        return {
          highlightedVerses: onlyThis ? [] : [key],
          cursorVerse: onlyThis ? null : verse,
        };
      }
      const has = s.highlightedVerses.includes(key);
      const highlightedVerses = has
        ? s.highlightedVerses.filter((k) => k !== key)
        : [...s.highlightedVerses, key];
      // 同时把该节定为跟读游标（投影跟随滚动，指向最近一次点击的节）
      return {
        highlightedVerses,
        cursorVerse: verse,
      };
    });
    get().sync();
  },

  setSingleSelectMode: (v) => set({ singleSelectMode: v }),

  setSelectColor: (c) => {
    set({ selectColor: c });
    get().sync();
  },

  clearHighlightedVerses: () => {
    set({ highlightedVerses: [] });
    get().sync();
  },

  removeHighlightedVerse: (key) => {
    set((s) => ({ highlightedVerses: s.highlightedVerses.filter((k) => k !== key) }));
    get().sync();
  },

  toggleBlackout: () => {
    set((s) => ({ blackout: !s.blackout, cleared: false }));
    get().sync();
  },

  clearScreen: () => {
    set((s) => ({ cleared: !s.cleared, blackout: false }));
    get().sync();
  },

  setAutoScroll: (speed) => {
    set({ autoScroll: Math.max(0, Math.min(5, speed)) });
    get().sync(); // 广播到投影窗口同步执行
  },

  addPanel: () => {
    // 新建面板：先展示**清屏画面**（空内容），再由用户在左侧分栏选经文上屏
    // （非追加模式浏览即 replaceActivePanel 填入内容）。清掉强调色 / 跟读游标，干净起步。
    const versionCode = useBibleStore.getState().activeVersionIds[0];
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      panels: [...s.panels, { id, name: '空面板', versionCode, passages: [] }],
      activePanelId: id,
      highlightedVerses: [],
      cursorVerse: null,
    }));
    get().sync();
  },

  addPanelWithPassage: (passage) => {
    // 搜索结果「跳转」：直接新建一个面板并把该节放进去、激活它，同时同步全局选区
    // （让 Miller Columns 也定位到该节）。与 addPanel（建空面板）区分。
    const bible = useBibleStore.getState();
    const book = bible.books.find((b) => b.id === passage.bookId);
    const ref = book ? formatPassageRef(book.nameCn, passage) : `${passage.chapter}`;
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      panels: [...s.panels, { id, name: ref, versionCode: bible.activeVersionIds[0], passages: [passage] }],
      activePanelId: id,
      highlightedVerses: [],
      cursorVerse: null,
    }));
    bible.setSelection(toSelection(passage));
    get().sync();
  },

  removePanel: (id) => {
    set((s) => ({
      panels: s.panels.filter((p) => p.id !== id),
      activePanelId: s.activePanelId === id ? null : s.activePanelId,
    }));
    // 面板被删除 → 连同该面板的临时高亮一起丢弃
    useHighlightsStore.setState((hs) => {
      const next = { ...hs.byPanel };
      delete next[id];
      return { byPanel: next };
    });
    get().sync();
  },

  activatePanel: (id) => {
    const panel = get().panels.find((p) => p.id === id);
    if (!panel) return;
    const first = panel.passages[0];
    if (first) {
      const patch: Partial<Selection> = toSelection(first);
      useBibleStore.getState().setSelection(patch);
    }
    set({ activePanelId: id, isProjecting: true, blackout: false, cleared: false, cursorVerse: null, highlightedVerses: [] });
    get().sync();
  },

  appendPassage: (panelId, passage) => {
    const bible = useBibleStore.getState();
    set((s) => {
      const panels = s.panels.map((p) => {
        if (p.id !== panelId) return p;
        const passages = [...(p.passages ?? []), passage];
        return { ...p, passages, name: panelNameFromPassages(bible, passages) };
      });
      return { panels };
    });
    get().sync();
  },

  /**
   * 替换当前活动面板内容为单段（Miller Columns 浏览即编辑当前面板；不改写其它面板）。
   * 与「添加到后续」(appendPassage) 区分：此为整段替换，会清掉面板里此前追加的段落。
   * 阅读区 / 预览区 / 投影区均渲染活动面板，故选章即更新三屏显示，旧「选章即更新阅读区」行为回归。
   */
  replaceActivePanel: (passage) => {
    const ps = get();
    if (!ps.activePanelId) {
      // 理论上启动即建面板，不会走到；退化处理：仅更新全局选区，保证不丢导航位置
      useBibleStore.getState().setSelection(toSelection(passage));
      get().sync();
      return;
    }
    const bible = useBibleStore.getState();
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === s.activePanelId
          ? { ...p, passages: [passage], name: panelNameFromPassages(bible, [passage]) }
          : p,
      ),
    }));
    get().sync();
  },

  /**
   * 启动面板行为（用户反馈：默认打开一个面板，设置里可选「每次启动打开新面板 /
   * 保留原来的面板」）。需等圣经数据就绪、有了合法 bookId 才能建面板，
   * 因此由 console-page 在 loadBible 完成后调用。
   */
  applyPanelStartup: () => {
    const mode = useProjectionSettingsStore.getState().panelStartup;
    const bible = useBibleStore.getState();
    const book = bible.books.find((b) => b.id === bible.selection.bookId);
    if (!book) return;
    // keep：已有面板则原样保留（并激活第一个），不新建
    if (mode === 'keep' && get().panels.length > 0) {
      const first = get().panels[0];
      set({ activePanelId: first.id });
      get().sync();
      return;
    }
    // new（默认）：丢弃旧面板，按当前选区开一个全新面板
    useHighlightsStore.setState({ byPanel: {} });
    const passage = toPassage(bible.selection);
    const ref = formatPassageRef(book.nameCn, passage);
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    set({
      panels: [{ id, name: ref, versionCode: bible.activeVersionIds[0], passages: [passage] }],
      activePanelId: id,
      isProjecting: false,
      blackout: false,
      cleared: false,
      cursorVerse: null,
      highlightedVerses: [],
      autoScroll: 0,
    });
    get().sync();
  },
    }),
    {
      // 只持久化面板列表；高亮刻意不持久化（用户要求「不是永久保存」）
      name: 'bible-panels',
      partialize: (s) => ({ panels: s.panels, activePanelId: s.activePanelId }),
      // 老版本面板（单段 bookId/chapter 存储）迁移为 passages
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<PanelsState>) };
        if (Array.isArray(merged.panels)) {
          merged.panels = merged.panels.map((p) => normalizePanel(p));
        }
        return merged;
      },
    },
  ),
);
