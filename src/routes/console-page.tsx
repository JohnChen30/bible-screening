/**
 * console-page — 主控台（/console）
 *
 * 布局：左侧 Miller Columns 选择器 + 主区（顶栏 / 幻灯片画布阅读·预览区 / 控件条 / 底部面板栏）。
 * 三屏一致（反馈3）：阅读区、投影预览区、投影输出（/output）渲染同一 PassageLayout、
 * 同一份排版快照（reader settings 经 payload 广播），标题 / 字号 / 行距 / 边距逐项相同。
 * 控件全部嵌入布局流（ProjectionDock 贴预览面板底部），无绝对定位浮层，不遮挡经文。
 * 投影交互：
 *   - 投影严格只能由「投影按钮」触发；
 *   - 黑屏 / 清屏 / 自动滚动 5 档；
 *   - 单击单节经文呼出高亮控件（五色 / 下划线 / 清除格式）。
 * 快捷键：B 黑屏，C 清屏，Esc 退出投影。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, Reorder, useMotionValue } from 'framer-motion';
import {
  BookOpenText,
  Check,
  Columns2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTheme, setTheme, toggleTheme, type Theme } from '@/lib/theme';
import { onSyncRequest } from '@/lib/projection-channel';
import { MillerColumns } from '@/components/miller-columns/miller-columns';
import { ReaderPane } from '@/components/reader/reader-pane';
import { PanelCanvas } from '@/components/reader/panel-canvas';
import { ProjectionDock } from '@/components/projection/projection-dock';
import { TitleModeSwitch } from '@/components/reader/title-mode-switch';
import { SearchBox } from '@/components/search/search-box';
import { PanelBar } from '@/components/panels/panel-bar';
import { SettingsPopover } from '@/components/settings/settings-popover';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useBibleStore } from '@/stores/use-bible-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { useCanvasSettingsStore } from '@/stores/use-canvas-settings-store';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';
import { useHighlightsStore } from '@/stores/use-highlights-store';
import { toPassage, type CompareMode, type Selection } from '@/lib/types';

const MODES: { value: CompareMode; label: string; icon: typeof BookOpenText }[] = [
  { value: 'single', label: '单版', icon: BookOpenText },
  { value: 'verse', label: '逐节对照', icon: Columns2 },
  { value: 'split', label: '分屏对照', icon: Columns2 },
];

/** 侧栏展开宽度（与下方 motion.aside 的 animate width 保持一致） */
const SIDEBAR_W = 360;
/**
 * 侧栏开合弹簧：侧栏宽度与「预览容器宽度」必须用**完全相同的弹簧参数**，
 * 这样容器宽 = 参考视口宽 − 侧栏实时宽，动画全程与主区严丝合缝、不抖不闪。
 */
const SIDEBAR_SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const;

export function ConsolePage() {
  const store = useBibleStore();
  const { loadBible, status, error, books, selection, setSelection, activeVersionIds, setActiveVersionIds, toggleVersion, compareMode, setCompareMode } = store;

  const isProjecting = usePanelsStore((s) => s.isProjecting);
  const startProjection = usePanelsStore((s) => s.startProjection);
  const stopProjection = usePanelsStore((s) => s.stopProjection);
  const cursorVerse = usePanelsStore((s) => s.cursorVerse);
  const highlightedVerses = usePanelsStore((s) => s.highlightedVerses);
  const selectColor = usePanelsStore((s) => s.selectColor);
  const aspectRatio = useCanvasSettingsStore((s) => s.aspectRatio);
  /** 参考画布宽（基准宽）：预览以它为基准等比缩放（展开态 scale=1，收起侧栏时放大） */
  const panelBaseWidth = usePanelsStore((s) => s.baseWidth);
  const readerBg = useReaderSettingsStore((s) => s.backgroundColor);
  const appendPassage = usePanelsStore((s) => s.appendPassage);
  const replaceActivePanel = usePanelsStore((s) => s.replaceActivePanel);
  const activePanelId = usePanelsStore((s) => s.activePanelId);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** 追加模式：开启后，在分栏里选一段新经文即追加到当前面板下方（而非替换） */
  const [appendMode, setAppendMode] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * 面板几何参考值（非全屏时测量并持续校正）：视口宽 / 内容区高。
   *
   * 修复「切换全屏面板抽动」的关键：把测量值**同时**用于全屏与非全屏下的面板
   * 尺寸/位置，于是切换全屏时这两个值根本不发生变化，面板自然一动不动。
   * 此前只在全屏分支里用冻结值，切换瞬间（浏览器进入全屏 → 视口变高 →
   * React 尚未重渲染）仍有一帧按新尺寸布局 → 可见抽动。
   */
  const stageHostRef = useRef<HTMLDivElement>(null);
  const [refViewportW, setRefViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );
  const [refStageH, setRefStageH] = useState(0);

  /**
   * 侧栏开合状态（供测量函数读取，避免闭包过期）。
   * 收起侧栏时主区变宽，只用来让预览「等比放大」；参考几何 / 基准宽保持
   * 「侧栏展开时」的值 → 投影画面保持不变。
   */
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  /** 过渡期标记（侧栏动画 / 全屏进入退出）：期间一律冻结参考几何 */
  const transitionRef = useRef(false);
  const settleTimerRef = useRef<number | undefined>(undefined);
  /** 最近一次实测画布宽（过渡结束后恢复基准宽用） */
  const lastCanvasWRef = useRef(0);

  /**
   * 参考几何（参考视口宽 refViewportW / 内容区高 refStageH / 基准宽 baseWidth）
   * **只允许在「侧栏展开 + 无过渡动画」这一规范状态下采集**。
   *
   * 病根（用户反馈：多次切换侧栏后面板/投影「直接变化了」，非过渡闪变）：
   * 过渡期（侧栏动画）直接写参考值会把「收起态」的尺寸永久写进参考 → 面板永久变化。
   * 现统一为：过渡期冻结，过渡结束后**仅在规范状态**重新采集一次。
   */
  const canCaptureRef = () => sidebarOpenRef.current && !transitionRef.current;
  /** 参考几何是否冻结（= 不可采集）：冻结的是基准宽/参考几何，不冻结主区宽度本身 */
  const isRefFrozen = () => !canCaptureRef();

  /** 在规范状态下采集参考几何（参考视口宽 + 内容区高） */
  const captureRef = useCallback(() => {
    setRefViewportW(window.innerWidth);
    const h = stageHostRef.current?.clientHeight ?? 0;
    if (h > 0) setRefStageH(h);
  }, []);

  /**
   * 过渡期（侧栏动画 / 全屏进入退出）：冻结参考几何；过渡结束后，
   * **若已回到规范状态**（侧栏展开 + 非全屏）再重新采集参考几何与基准宽，
   * 使预览精确回到 scale=1；否则（收起 / 全屏中）保持冻结不动。
   */
  const settle = useCallback(() => {
    transitionRef.current = true;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      transitionRef.current = false;
      if (!canCaptureRef()) return;
      captureRef();
      const w = lastCanvasWRef.current;
      if (w > 0) usePanelsStore.getState().setBaseWidth(w);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 450);
  }, [captureRef]);

  useLayoutEffect(() => {
    const host = stageHostRef.current;
    if (!host) return;
    const measure = () => {
      if (!canCaptureRef()) return; // 非规范状态（全屏 / 收起侧栏 / 过渡中）一律不覆盖参考几何
      setRefViewportW(window.innerWidth);
      const h = host.clientHeight;
      if (h > 0) setRefStageH(h);
    };
    measure();
    // 内容区尺寸随窗口 resize、控件条出现/消失、面板栏变化而变 → 观测自身尺寸校正
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 预览容器宽度（MotionValue）：
   * - 侧栏开合 → 用与侧栏同一弹簧动画（预览平滑放大 / 缩小）；
   * - 窗口尺寸变化 → **立即跟随，不用动画**。若一起动画，滞后会让容器短暂宽过主区
   *   → 画布右侧被裁切（缩小窗口时尤其明显），观感上「面板溢出」。
   */
  const containerW = useMotionValue(refViewportW - SIDEBAR_W);
  useLayoutEffect(() => {
    containerW.set(refViewportW - (sidebarOpenRef.current ? SIDEBAR_W : 0));
  }, [refViewportW]);

  /** 预览画布实测宽度 → 作为「基准宽度」广播给投影屏。
   * 投影屏 scale = 自身画布宽 / 基准宽，于是投影画面 = 预览画面的等比放大：
   * 比例一致、显示内容范围一致，只有大小不同。
   *
   * 关键修复（用户反馈：投影后切全屏，投影画面会突然缩小）：
   * 全屏期间冻结基准宽——主控台全屏会让预览画布实测宽度暴涨，若不冻结，
   * baseWidth 随之变大，投影屏 scale = 投影宽 / baseWidth 反而变小 → 经文缩水。
   * 全屏时直接跳过上报，投影屏沿用切全屏前的基准宽，画面稳定不缩。
   */
  const onCanvasMeasure = useCallback((w: number) => {
    lastCanvasWRef.current = w; // 始终记录，供展开动画结束后恢复基准宽
    // 非规范状态（全屏 / 收起侧栏 / 侧栏动画中）冻结基准宽：预览等比放大，但投影不变
    if (isRefFrozen()) return;
    usePanelsStore.getState().setBaseWidth(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 切换侧栏：过渡期冻结参考几何；过渡结束后若已回到规范状态（展开）则重新采集
   * 参考几何与基准宽（预览回到 scale=1）；收起时保持冻结 → 预览按原基准等比放大。
   */
  const toggleSidebar = () => {
    setSidebarOpen((v) => !v);
    // 容器宽度用弹簧跟随侧栏（平滑缩放）；窗口尺寸变化走上面的 layoutEffect（立即）
    animate(containerW, sidebarOpen ? refViewportW : refViewportW - SIDEBAR_W, SIDEBAR_SPRING);
    settle();
  };

  useEffect(() => {
    void loadBible();
  }, [loadBible]);

  /**
   * 启动面板行为（用户反馈：默认打开一个面板，设置里可选「每次启动打开新面板 /
   * 保留原来的面板」）。
   * 必须等「数据就绪」且「已有合法选区 bookId」才能建面板——
   * loadBible 里 status 先置ready、随后才设默认选区，故两个条件都要等。
   */
  const startupAppliedRef = useRef(false);
  useEffect(() => {
    if (startupAppliedRef.current) return;
    if (status !== 'ready' || !selection.bookId) return;
    startupAppliedRef.current = true;
    usePanelsStore.getState().applyPanelStartup();
  }, [status, selection.bookId]);

  /* 快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      // 设置小窗等浮层打开时，快捷键（含 Esc）不外溢：关小窗不应退出投影
      if (target.closest?.('[role="dialog"]')) return;
      const ps = usePanelsStore.getState();
      if (!ps.isProjecting) return;
      if (e.key === 'b' || e.key === 'B') ps.toggleBlackout();
      else if (e.key === 'c' || e.key === 'C') ps.clearScreen();
      else if (e.key === 'Escape') {
        // ESC 退出投影（已无浏览器全屏，故 ESC 直接停投影）
        ps.stopProjection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 投影同步：选区 / 游标 / 模式 / 比例 / 设置变化 → 广播到投影窗口 */
  const sync = usePanelsStore((s) => s.sync);
  const blackout = usePanelsStore((s) => s.blackout);
  const cleared = usePanelsStore((s) => s.cleared);
  const godTermSwap = useBibleStore((s) => s.godTermSwap);
  /** 译本数据缓存的键集合：新增译本后会变化，用于「等数据加载完再广播」 */
  const dataCacheKeys = useBibleStore((s) => Object.keys(s.dataCache).join(','));

  useEffect(() => {
    // 新增译本后必须等它的经文数据加载进 dataCache 再广播：否则投影窗 / 预览区
    // 会先收到一份没有该译本经文的负载（表现为「只有第一个译本显示」）。
    if (!activeVersionIds.every((c) => useBibleStore.getState().dataCache[c])) return;
    sync();
  }, [sync, isProjecting, selection, activeVersionIds.join(','), dataCacheKeys, compareMode, cursorVerse, highlightedVerses, selectColor, blackout, cleared, godTermSwap, aspectRatio]);

  /* 排版 / 面板比例变化 → 立即同步（三屏所见即所得） */
  useEffect(() => useReaderSettingsStore.subscribe(() => usePanelsStore.getState().sync()), []);
  useEffect(() => useCanvasSettingsStore.subscribe(() => usePanelsStore.getState().sync()), []);
  /* 高亮变化 → 立即同步（投影画面照搬显示） */
  useEffect(() => useHighlightsStore.subscribe(() => usePanelsStore.getState().sync()), []);

  /* 投影窗口（后开的标签页）请求当前状态 → 重发负载 */
  useEffect(() => onSyncRequest(() => usePanelsStore.getState().sync()), []);

  /* 切换书卷/章 → 重置跟读游标（避免旧节号在新篇章上错位高亮） */
  const prevChapRef = useRef<{ bookId: number | null; chapter: number | null } | null>(null);
  useEffect(() => {
    const prev = prevChapRef.current;
    prevChapRef.current = { bookId: selection.bookId, chapter: selection.chapter };
    if (prev && (prev.bookId !== selection.bookId || prev.chapter !== selection.chapter)) {
      usePanelsStore.getState().setCursor(null);
      usePanelsStore.getState().clearHighlightedVerses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.bookId, selection.chapter]);

  const onToggleTheme = () => {
    const next = toggleTheme();
    setThemeState(next);
    setTheme(next);
  };

  return (
    <div ref={rootRef} id="app-root-fs" className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* ============ 左侧：Miller Columns ============ */}
      {/* 收起侧栏时主区变宽 → 预览「等比放大」填满空间；放大用的基准宽被冻结，
          故投影画面保持不变（见 sidebarOpenRef）。 */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_W : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={SIDEBAR_SPRING}
        className="vibrancy relative z-10 shrink-0 overflow-hidden border-r border-border"
      >
        <div className="flex h-full w-[360px] flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <BookOpenText className="h-4 w-4 text-accent" strokeWidth={1.8} />
            <span className="text-[13px] font-medium tracking-wide">经文选择</span>
            <span className="text-[10px] text-muted-foreground/60">↑↓ ←→ Enter</span>
            {/* 「添加到后续」：默认加号 + 文案；进入追加模式后变勾选 + 强调色底色 */}
            <button
              onClick={() => setAppendMode((v) => !v)}
              aria-pressed={appendMode}
              className={cn(
                'ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors focus-ring',
                appendMode
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-border bg-card/60 text-foreground/80 hover:border-accent/40 hover:bg-accent/10 hover:text-accent',
              )}
            >
              {appendMode ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
              )}
              {appendMode ? '选择后续经文' : '添加到后续'}
            </button>
          </div>
          <MillerColumns
            books={books}
            selection={selection}
            chapterCount={(id) => store.getChapterCount(id)}
            verseCount={(id, ch) => store.getVerseCount(id, ch)}
            onSelect={(patch) => {
              // 更新全局选区：保证分栏高亮、投影 payload 书名一致。
              setSelection(patch);
              // 追加模式下只「导航选范围」，不替换面板内容；真正写入由 onAppend 完成，
              // 否则选 章→起始节→结束节 的过程中会先 replace 再 append，产生重复/错乱段。
              if (appendMode) return;
              // 非追加模式：Miller Columns 浏览即编辑当前活动面板（replace）。
              // 旧「选章即更新阅读区」行为据此回归，三屏同步。
              const merged: Selection = { ...selection, ...patch };
              if (activePanelId && merged.bookId != null) {
                replaceActivePanel(toPassage(merged));
              }
            }}
            appendMode={appendMode}
            onAppend={(sel) => {
              if (activePanelId && sel.bookId != null) appendPassage(activePanelId, toPassage(sel));
              setAppendMode(false);
            }}
          />
        </div>
      </motion.aside>

      {/* ============ 主区 ============ */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* 顶栏 */}
        <header className="toolbar-glass relative z-20 flex h-12 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-border px-3 [&>*]:shrink-0">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-lg border-border bg-card/60 hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
                  onClick={toggleSidebar}
                  aria-label="切换侧栏"
                >
                  {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{sidebarOpen ? '收起侧栏' : '展开侧栏'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 版本 chips（可拖拽排序） */}
          <Reorder.Group
            axis="x"
            values={activeVersionIds}
            onReorder={setActiveVersionIds}
            className="flex items-center gap-1.5"
            as="div"
          >
            {activeVersionIds.map((code) => {
              const meta = store.versions.find((v) => v.code === code);
              return (
                <Reorder.Item
                  key={code}
                  value={code}
                  dragListener={activeVersionIds.length > 1}
                  whileDrag={{ scale: 1.06, zIndex: 10 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  className={cn(
                    'flex h-7 cursor-grab items-center gap-1 rounded-md bg-foreground/[0.06] px-2.5 text-xs font-medium shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] active:cursor-grabbing',
                    activeVersionIds.length === 1 && 'cursor-default',
                  )}
                >
                  {meta?.name ?? code}
                  {activeVersionIds.length > 1 && (
                    <button
                      onClick={() => toggleVersion(code)}
                      className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                      aria-label={`移除 ${meta?.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Reorder.Item>
              );
            })}
          </Reorder.Group>

          {/* 添加译本 */}
          <AddVersionPopover versions={store.versions} active={activeVersionIds} onAdd={toggleVersion} />

          {/* 对照模式（macOS 分段控件） */}
          <div className="ml-1 flex items-center gap-0.5 rounded-[7px] bg-foreground/[0.06] p-[2px]">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setCompareMode(m.value)}
                className={cn(
                  'flex h-6 items-center gap-1 rounded-[5px] px-2.5 text-[11px] font-medium transition-all focus-ring',
                  compareMode === m.value
                    ? 'bg-card text-foreground shadow-[0_1px_3px_hsl(var(--foreground)/0.12),0_0_0_0.5px_hsl(var(--foreground)/0.06)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <m.icon className="h-3 w-3" strokeWidth={1.8} />
                {m.label}
              </button>
            ))}
          </div>

          {/* 标题显示方式（常驻顶部 / 随文滚动 / 不显示）— 常驻可见 */}
          <TitleModeSwitch className="ml-1" />

          {/* 关键词检索（顶栏空白处居中；结果窗在其下方展开） */}
          <SearchBox />

          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon-sm" onClick={onToggleTheme} aria-label="切换主题">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {/* 排版设置（顶栏入口，Popover 小窗，不占版面不遮挡经文） */}
            <SettingsPopover />
            <Button
              size="sm"
              className="gap-1.5 rounded-lg"
              onClick={() => (isProjecting ? stopProjection() : startProjection())}
            >
              {isProjecting ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isProjecting ? '退出投影' : '投影'}
            </Button>
          </div>
        </header>

        {/* 内容区：幻灯片画布（阅读区 = 投影预览区，三屏同组件同排版） */}
        {/* 收起侧栏 → 主区变宽 → 预览画布变大并按「冻结基准宽」等比放大（内容按比例缩放、
            相对位置不变）；容器宽用像素值 + 与侧栏同弹簧动画，全屏切换时宽度目标不变 →
            不闪变。参考几何/基准宽冻结 → 投影画面保持不变。 */}
        <div ref={stageHostRef} className="relative min-h-0 flex-1 flex items-start">
          {status !== 'ready' ? (
            <LoadingState status={status} error={error} onRetry={loadBible} />
          ) : (
            <motion.div
              className="shrink-0"
              style={{
                // 宽度为 MotionValue：侧栏开合弹簧动画、窗口尺寸变化立即跟随（见 containerW）
                width: containerW,
                // 高度恒为「规范状态实测值」，全屏 / 收起侧栏都不改 → 画布不抽动
                height: refStageH > 0 ? refStageH : '100%',
              }}
            >
              <PanelCanvas
                ratio={aspectRatio}
                bg={readerBg || 'var(--reader-bg)'}
                baseWidth={panelBaseWidth}
                onMeasure={onCanvasMeasure}
              >
                <ReaderArea />
              </PanelCanvas>
            </motion.div>
          )}
        </div>

        {/* 控件条：嵌入布局流、紧贴预览面板底部，绝不遮挡经文。
            常驻显示：选区 / 强调色 / 高亮工具始终可用；投影组仅在投影时出现 */}
        <ProjectionDock />

        {/* 底部多面板栏 */}
        <PanelBar />
      </main>
    </div>
  );
}

/* ============================ 子组件 ============================ */

function ReaderArea() {
  const activeVersionIds = useBibleStore((s) => s.activeVersionIds);
  const compareMode = useBibleStore((s) => s.compareMode);

  // 版面调度（分屏 / 逐节 / 单版）统一走 PassageLayout，与投影窗口同构
  return (
    <ReaderPane
      versionCodes={compareMode === 'single' ? activeVersionIds.slice(0, 1) : activeVersionIds}
      mode={compareMode}
      className="h-full"
    />
  );
}

/**
 * 添加译本：改为 **顶层浮层**（Radix Popover，portal 进 #app-root-fs 根容器）。
 *
 * 原先是顶栏内的 `absolute` 定位元素，而顶栏带 `overflow-x-auto`——按 CSS 规范，
 * 一个轴的 overflow 非 visible 时另一轴的 visible 会被计算成 auto，于是纵向也被裁剪：
 * 剩余译本列表被挤在第一栏里、必须滚动才看得见。
 * portal 进根容器后脱离该裁剪上下文，浮窗正常置顶显示；且根容器即全屏元素，
 * 全屏下也不会被浏览器隐藏（此前「排版设置」的同类修复）。
 */
function AddVersionPopover({
  versions,
  active,
  onAdd,
}: {
  versions: { code: string; name: string }[];
  active: string[];
  onAdd: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const remaining = versions.filter((v) => !active.includes(v.code));
  if (!remaining.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="添加译本"
            className="text-muted-foreground"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="glass-strong z-[100] max-h-[60vh] w-44 overflow-y-auto rounded-[10px] p-1"
        >
          {remaining.map((v) => (
            <button
              key={v.code}
              onClick={() => {
                onAdd(v.code);
                setOpen(false);
              }}
              className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {v.name}
            </button>
          ))}
        </PopoverContent>
      </Popover>
  );
}

/** 加载 / 错误态 */
function LoadingState({ status, error, onRetry }: { status: string; error: string | null; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      {status === 'error' ? (
        <>
          <p className="text-sm text-red-400">数据加载失败：{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            重试
          </Button>
          <p className="text-xs text-muted-foreground/60">
            请先运行 <code className="rounded bg-muted px-1">node src-tools/import-bible.mjs</code> 与{' '}
            <code className="rounded bg-muted px-1">node src-tools/export-snapshot.mjs</code>
          </p>
        </>
      ) : (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
            className="h-7 w-7 rounded-full border-2 border-accent/30 border-t-accent"
          />
          <p className="text-sm text-muted-foreground">正在装载经文…</p>
        </>
      )}
    </div>
  );
}
