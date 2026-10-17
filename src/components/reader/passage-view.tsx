/**
 * passage-view — 共享经文视图（主控台阅读区 + 预览区 + 投影窗口共用）
 *
 * 三屏完全一致：同一组件、同一份排版快照（reader settings 经 payload 广播），
 * 字体大小 / 行高 / 颜色 / 边距逐项相同，所见即所得。
 *
 * 能力：
 *   - single：单译本；verse：逐节上下对照（一节 → 同节各译本依次堆叠）；
 *   - 每段（PassageItem）独立渲染标题（书卷 第X章 / 章:节区间），段间加极淡分割线；
 *   - 每节换行时经 tanstack-virtual 动态测量（measureElement），行高随内容自适应；
 *   - 跟读游标：交互模式下点击经文设置 / 取消；投影页据此滚动跟随。
 */

import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBibleStore } from '@/stores/use-bible-store';
import { highlightsOf, useHighlightsStore, verseKey } from '@/stores/use-highlights-store';
import { useTextSelectionStore, selectionFlags, type PendingRange } from '@/stores/use-text-selection-store';
import { highlightKey, usePanelsStore } from '@/stores/use-panels-store';
import {
  isMirrorDriven,
  publishCurrentRatio,
  publishScrollRatio,
  reapplyScrollRatio,
  registerScrollContainer,
  watchScroll,
} from '@/lib/scroll-sync';
import type { BookMeta, CompareMode, PassageItem, TextHighlight, TitleMode, VersionData } from '@/lib/types';
import { useCanvasScale } from './panel-canvas';
import { VerseItem } from './verse-item';
import { VerseText } from './verse-text';
import { SelectionCopyBar } from './selection-copy-bar';

/** 稳定空数组引用（避免每次渲染新引用） */
const EMPTY_HIGHLIGHTS: TextHighlight[] = [];

/**
 * 自动滚动速度 → 每帧像素（用户反馈：原速度太快，人眼跟不上，故整体大幅降速）
 * 原值 [0, 0.35, 0.8, 1.5, 2.6, 4.2] 在 60fps 下最高约 250px/s，朗读时来不及跟读。
 * 现按「行高约 36px / 每行停留 ≈0.9s」≈40px/s 起步，最高档约 48px/s，人眼可从容跟随。
 */
const SCROLL_SPEED = [0, 0.1, 0.2, 0.32, 0.4, 0.48];

/** rAF 自动滚动（挂在内部滚动容器上） */
function useAutoScroll(ref: React.RefObject<HTMLDivElement>, speed: number) {
  useEffect(() => {
    if (speed <= 0) return;
    let raf = 0;
    const step = SCROLL_SPEED[speed] ?? 0;
    /**
     * 亚像素累加器：降速后 step 可能 <1px/帧，而浏览器会把scrollTop
     * 吸附到整数设备像素——直接 `scrollTop += 0.32` 会被截断成 0，导致
     * 「自动滚动完全不动」。故用浮点累加器保留小数，攒够 1px 再写入。
     */
    let acc = 0;
    const tick = () => {
      const el = ref.current;
      // 镜像屏（投影窗）正被主控台比例驱动时暂停自增，避免双重驱动漂移
      if (el && !isMirrorDriven()) {
        acc += step;
        if (acc >= 1) {
          const whole = Math.floor(acc);
          acc -= whole;
          el.scrollTop += whole;
        }
      } else {
        acc = 0; // 被外部驱动时清零，避免恢复后突然跳一大段
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref, speed]);
}

/** 排版设置（阅读 / 投影两套设置的并集） */
export interface PassageTypography {
  fontSize: number;
  lineHeight: number;
  bold: boolean;
  fontFamily: 'serif' | 'sans';
  margin: number;
  /** 排版模式：逐节（一节一块）/ 段落（多节成段，上标节号，首行缩进 2em） */
  layoutMode: 'verse' | 'paragraph';
  showVerseNumber: boolean;
  /** 标题格式：约翰福音 第3章 / 创世记 1:1-10 */
  titleFormat: 'chapterCn' | 'reference';
  /**
   * 标题显示方式（用户反馈：标题不要一直常驻在画面上方）：
   *   pinned 常驻顶部（渲染在滚动区之外，经文滚动时标题不动）
   *   inline 随文滚动（标题在滚动区首行，随经文一起滚出画面）— 默认
   *   hidden 不显示（完全不渲染，不留空白）
   * 旧版本持久化数据无此字段，缺省按 inline 处理。
   */
  titleMode?: TitleMode;
  textColor: string;
  verseNumberColor: string;
  titleColor: string;
  backgroundColor: string;
  texture: 'none' | 'gradient' | 'grain';
  titleAlign: 'left' | 'center' | 'right';
  /** 经文对齐方式（用户反馈：加一个经文左右靠齐或居中的设置）；旧快照缺省按左对齐 */
  verseAlign?: 'left' | 'center' | 'right';
}

/** 由 typography 生成 CSS 变量 */
export function passageCssVars(t: PassageTypography): React.CSSProperties {
  return {
    // 等比缩放：投影屏 = 预览屏的等比放大（比例与显示内容范围一致，只有大小不同）。
    // --canvas-scale 由 PanelCanvas 下发（预览屏=1，投影屏=自身画布宽/基准宽）
    '--reader-font-size': `calc(${t.fontSize} * var(--canvas-scale, 1) * 1px)`,
    '--reader-line-height': String(t.lineHeight),
    '--reader-font-weight': t.bold ? 600 : 400,
    '--reader-verse-align': t.verseAlign ?? 'left',
    '--reader-pad': `calc(${t.margin} * var(--canvas-scale, 1) * 1rem)`,
    '--reader-font-family':
      t.fontFamily === 'serif'
        ? '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, Georgia, serif'
        : 'Inter, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
    ...(t.textColor ? { '--reader-text': t.textColor } : {}),
    ...(t.verseNumberColor ? { '--reader-verse-number': t.verseNumberColor } : {}),
    ...(t.titleColor ? { '--reader-title': t.titleColor } : {}),
    ...(t.backgroundColor ? { '--reader-bg': t.backgroundColor } : {}),
  } as React.CSSProperties;
}

interface PassageViewProps {
  /** 经文段列表（单段或多段；多段遍历渲染，段间加淡分割线） */
  passages: PassageItem[];
  versionCodes: string[];
  mode: CompareMode;
  typography: PassageTypography;
  /** 交互模式（主控台）：点击高亮 / 取消高亮（多节同时） */
  interactive?: boolean;
  /** 已高亮的节 ID 集合（复合键 bookId:chapter:verse） */
  highlightedVerses?: string[];
  /** 强调色（选中经文的文字/节号颜色；可在工具栏自由设置，三屏同步） */
  selectColor?: string;
  /**
   * 高亮所属面板 id（权威来源）。投影窗传 payload.activePanelId；
   * 不传则回退到本窗口 store 的 activePanelId（主控台场景）。
   */
  panelId?: string | null;
  /** 点击节：在集合中切换该节（再次点击同节即取消）；透传该节所在的 bookId / chapter */
  onToggleHighlight?: (verse: number, bookId?: number, chapter?: number) => void;
  /** 投影页滚动到此节 */
  scrollToVerse?: number | null;
  /** 自动滚动档位（0 = 停止） */
  autoScroll?: number;
  /**
   * 滚动同步源（反馈4-一）：true = 主控台阅读区，广播滚动比例到投影窗；
   * false = 镜像（投影窗），只应用比例不广播。默认 false。
   */
  scrollSync?: boolean;
  /** 滚动同步列索引（split 双栏：0/1；其余 0） */
  scrollIndex?: number;
  className?: string;
  /** 标题区（书卷/章 + 译本名） */
  header?: boolean;
}

/* ---------- 行模型 ---------- */

/** 逐节行：一节一块 */
interface VerseRow {
  kind: 'verse';
  verse: number;
  bookId: number;
  chapter: number;
  cells: { code: string; text: string | null }[];
}

/** 段落行：多节成一段（段内各节连续流动） */
interface ParaRow {
  kind: 'para';
  verses: number[];
  bookId: number;
  chapter: number;
  cells: { code: string; parts: { verse: number; text: string | null }[] }[];
}

type PassageRow = VerseRow | ParaRow;

/** 扁平渲染项（含标题 / 分割线伪行） */
type FlatItem =
  | { type: 'row'; key: string; row: PassageRow }
  | { type: 'title'; key: string; title: string; titleMode: TitleMode }
  | { type: 'divider'; key: string };

/* ---------- 行模型构建 ---------- */

function buildRows(
  p: PassageItem,
  book: BookMeta | undefined,
  dataCache: ReturnType<typeof useBibleStore.getState>['dataCache'],
  versionCodes: string[],
  layoutMode: 'verse' | 'paragraph',
): PassageRow[] {
  const perVersion = versionCodes
    .map((code) => ({ code, data: dataCache[code] }))
    .filter((pv): pv is { code: string; data: VersionData } => !!pv.data);

  const versesOf = (code: string) => {
    const data = dataCache[code];
    if (!data || !book) return [];
    const ch = data[book.osis]?.[String(p.chapter)];
    if (!ch) return [];
    return Object.keys(ch)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
      .filter((v) => (p.startVerse == null || v >= p.startVerse) && (p.endVerse == null || v <= p.endVerse))
      .map((v) => ({ verse: v, text: ch[String(v)] }));
  };

  const verseNums = new Set<number>();
  for (const pv of perVersion) for (const v of versesOf(pv.code)) verseNums.add(v.verse);
  const allVerses = [...verseNums].sort((a, b) => a - b);

  if (layoutMode === 'paragraph') {
    const PARA_SIZE = 5;
    const out: ParaRow[] = [];
    for (let i = 0; i < allVerses.length; i += PARA_SIZE) {
      const verses = allVerses.slice(i, i + PARA_SIZE);
      out.push({
        kind: 'para',
        verses,
        bookId: p.bookId,
        chapter: p.chapter,
        cells: perVersion.map((pv) => {
          const byVerse = new Map(versesOf(pv.code).map((v) => [v.verse, v.text]));
          return { code: pv.code, parts: verses.map((verse) => ({ verse, text: byVerse.get(verse) ?? null })) };
        }),
      });
    }
    return out;
  }

  return allVerses.map((verse) => ({
    kind: 'verse' as const,
    verse,
    bookId: p.bookId,
    chapter: p.chapter,
    cells: perVersion.map((pv) => ({
      code: pv.code,
      text: versesOf(pv.code).find((v) => v.verse === verse)?.text ?? null,
    })),
  }));
}

interface Section {
  passage: PassageItem;
  book: BookMeta | undefined;
  chapter: number;
  chapterVerseMax: number;
  rangeSuffix: string;
  cnRange: string;
  title: string;
  titleMode: TitleMode;
  showTitle: boolean;
  inlineTitle: boolean;
  rows: PassageRow[];
}

function buildSection(
  p: PassageItem,
  books: BookMeta[],
  dataCache: ReturnType<typeof useBibleStore.getState>['dataCache'],
  versionCodes: string[],
  t: PassageTypography,
  header: boolean,
): Section {
  const book = books.find((b) => b.id === p.bookId);
  const chapter = p.chapter;
  let chapterVerseMax = 0;
  if (book) {
    for (const code of versionCodes) {
      const ch = dataCache[code]?.[book.osis]?.[String(chapter)];
      if (!ch) continue;
      for (const k of Object.keys(ch)) {
        const n = Number(k);
        if (Number.isFinite(n) && n > chapterVerseMax) chapterVerseMax = n;
      }
    }
  }
  const rangeSuffix = p.startVerse
    ? p.endVerse && p.endVerse !== p.startVerse
      ? `:${p.startVerse}-${p.endVerse}`
      : `:${p.startVerse}`
    : chapterVerseMax > 1
      ? `:1-${chapterVerseMax}`
      : chapterVerseMax === 1
        ? ':1'
        : '';
  const cnRange = rangeSuffix ? (rangeSuffix === ':1' ? '1节' : `${rangeSuffix.slice(1)}节`) : '';
  const title = !book
    ? ''
    : t.titleFormat === 'reference'
      ? `${book.nameCn} ${chapter}${rangeSuffix}`
      : `${book.nameCn} 第${chapter}章${cnRange ? ` ${cnRange}` : ''}`;
  const titleMode: TitleMode = t.titleMode ?? 'inline';
  const showTitle = header && titleMode !== 'hidden';
  const inlineTitle = showTitle && titleMode === 'inline';
  const rows = buildRows(p, book, dataCache, versionCodes, t.layoutMode);
  return { passage: p, book, chapter, chapterVerseMax, rangeSuffix, cnRange, title, titleMode, showTitle, inlineTitle, rows };
}

/** 标题块（pinned / inline 两处共用同一份 JSX，保证三屏一致） */
function makeTitleBlock(title: string, titleMode: TitleMode, t: PassageTypography) {
  return (
    <div
      key={title}
      data-passage-title
      data-title-mode={titleMode}
      className={cn(
        'title-in',
        t.titleAlign === 'center' && 'text-center',
        t.titleAlign === 'right' && 'text-right',
        t.titleAlign === 'left' && 'text-left',
      )}
      style={{
        marginLeft: 'var(--reader-pad)',
        marginRight: 'var(--reader-pad)',
        paddingTop: 'calc(0.25rem * var(--canvas-scale, 1))',
        paddingBottom: 'calc(1.25rem * var(--canvas-scale, 1))',
      }}
    >
      <h2
        className="font-semibold tracking-wide"
        style={{
          /* 标题字体跟随「正文字体」设置（默认衬线），不再硬编码衬线，保持阅读区字体统一 */
          fontFamily: 'var(--reader-font-family)',
          color: 'var(--reader-title, var(--reader-text))',
          fontSize: 'calc(1.875rem * var(--canvas-scale, 1))',
        }}
      >
        {title || '—'}
      </h2>
    </div>
  );
}

/** 滚动同步（源广播 / 镜像应用 / 内容变化重定位） */
function usePassageScrollSync(
  parentRef: React.RefObject<HTMLDivElement | null>,
  scrollIndex: number,
  scrollSync: boolean,
  rows: FlatItem[],
) {
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    registerScrollContainer(scrollIndex, el);
    return () => registerScrollContainer(scrollIndex, null);
  }, [scrollIndex]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el || !scrollSync) return;
    return watchScroll(scrollIndex, el, publishScrollRatio);
  }, [scrollSync, scrollIndex]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el || !scrollSync) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => publishCurrentRatio(scrollIndex));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scrollSync, scrollIndex]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el || scrollSync) return;
    let raf = 0;
    const timers: number[] = [];
    const reapply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          reapplyScrollRatio(scrollIndex);
          timers.push(window.setTimeout(() => reapplyScrollRatio(scrollIndex), 150));
          timers.push(window.setTimeout(() => reapplyScrollRatio(scrollIndex), 500));
        });
      });
    };
    const ro = new ResizeObserver(reapply);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      ro.disconnect();
    };
  }, [scrollIndex, scrollSync]);

  useEffect(() => {
    reapplyScrollRatio(scrollIndex);
    if (!scrollSync) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => publishCurrentRatio(scrollIndex)),
    );
    return () => cancelAnimationFrame(id);
  }, [rows, scrollIndex, scrollSync]);
}

export function PassageView({
  passages,
  versionCodes,
  mode,
  typography: t,
  interactive = false,
  highlightedVerses = [],
  selectColor,
  panelId,
  onToggleHighlight,
  scrollToVerse,
  autoScroll = 0,
  scrollSync = false,
  scrollIndex = 0,
  className,
  header = true,
}: PassageViewProps) {
  const books = useBibleStore((s) => s.books);
  const dataCache = useBibleStore((s) => s.dataCache);
  const getVersionMeta = useBibleStore((s) => s.getVersionMeta);

  const parentRef = useRef<HTMLDivElement>(null);
  useAutoScroll(parentRef, autoScroll);
  // 光标拖选捕获（仅交互模式）：拖选经文 → 解析字符区间 → 供高亮/下划线只作用于选区
  useCaptureTextSelection(parentRef, interactive);
  /** 画布等比缩放系数（预览=1，投影=放大倍数）：行高估算需同步放大 */
  const scale = useCanvasScale();

  const sections = useMemo(
    () => passages.map((p) => buildSection(p, books, dataCache, versionCodes, t, header)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [passages, books, dataCache, versionCodes.join(','), t.layoutMode, t.titleFormat, t.titleMode, t.fontSize, t.titleAlign, t.margin, header],
  );

  /** 单段 pinned 标题渲染在滚动区之外（与多段 / inline 区分开） */
  const singlePinned = sections.length === 1 && sections[0].titleMode === 'pinned' && sections[0].showTitle;

  /** 扁平渲染列表：多段时每段标题 + 经文 + 段间分割线 */
  const flat = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    sections.forEach((s, i) => {
      if (i > 0) out.push({ type: 'divider', key: `divider-${i}` });
      if (s.showTitle && !singlePinned) out.push({ type: 'title', key: `title-${i}`, title: s.title, titleMode: s.titleMode });
      for (const r of s.rows) {
        if (r.kind === 'verse') out.push({ type: 'row', key: `s${i}-v${r.verse}`, row: r });
        else out.push({ type: 'row', key: `s${i}-p${r.verses[0]}`, row: r });
      }
    });
    return out;
  }, [sections, singlePinned]);

  const hasContent = flat.some((it) => it.type === 'row');

  usePassageScrollSync(parentRef, scrollIndex, scrollSync, flat);

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const it = flat[i];
      if (!it) return Math.round((t.fontSize * t.lineHeight + 12) * scale);
      if (it.type === 'title') return Math.round((t.fontSize * 1.2 + 30) * scale);
      if (it.type === 'divider') return Math.round(1.4 * 16 * scale);
      if (it.row.kind === 'para') return Math.round((t.fontSize * t.lineHeight + 12) * 5 * scale);
      return Math.round((t.fontSize * t.lineHeight + 12) * scale);
    },
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 6,
  });

  /** 投影页：滚动到跟读游标（两种排版模式均走虚拟列表） */
  useEffect(() => {
    if (scrollToVerse == null) return;
    const idx = flat.findIndex(
      (it) => it.type === 'row' && (it.row.kind === 'verse' ? it.row.verse === scrollToVerse : it.row.verses.includes(scrollToVerse)),
    );
    if (idx < 0) return;
    virtualizer.scrollToIndex(idx, { align: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToVerse]);

  /** 标题外层：与经文列同宽居中（左靠齐时与经文开头对齐） */
  const titleColumn = (node: React.ReactNode) => (
    <div className="mx-auto w-full" style={{ maxWidth: 'calc(48rem * var(--canvas-scale, 1))' }}>
      {node}
    </div>
  );

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)} style={passageCssVars(t)}>
      {/* 拖选 / 单击经文后的「复制经文」浮条（仅交互模式：主控台阅读区），停靠面板底部 */}
      {interactive && <SelectionCopyBar containerRef={parentRef} />}

      {/* 单段 pinned 标题（常驻顶部）：渲染在滚动区之外，经文滚动时标题不动 */}
      {singlePinned && <div className="shrink-0">{titleColumn(makeTitleBlock(sections[0].title, sections[0].titleMode, t))}</div>}

      {/* 圣经版本水印：右下角、半透明、不拦截指针事件（替代原先每节上方的版本名标签）；
          空面板（清屏）不显示水印，保持干净画面 */}
      {passages.length > 0 && (
        <div className="version-watermark" data-version-watermark aria-hidden>
          {versionCodes.map((c) => getVersionMeta(c)?.name ?? c).join(' · ')}
        </div>
      )}

      {/* 经文滚动区 */}
      <div ref={parentRef} className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto', `paper-${t.texture}`)}>
        {!hasContent ? (
          // 空面板（passages 为空）= 清屏画面：纯画布底色，不显示任何提示；
          // 有经文段但本节在该译本无内容时，才给出「暂无内容」提示。
          passages.length === 0 ? null : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/50">
              <BookOpen className="h-8 w-8" strokeWidth={1.2} />
              <p className="text-sm">此选区在该译本中暂无内容</p>
            </div>
          )
        ) : (
          <div
            className="relative mx-auto w-full"
            style={{
              height: virtualizer.getTotalSize(),
              maxWidth: 'calc(48rem * var(--canvas-scale, 1))',
              textAlign: t.verseAlign ?? 'left',
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const it = flat[vi.index];
              if (!it) return null;
              const isTitle = it.type === 'title';
              return (
                <div
                  key={it.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className={cn('absolute', it.type === 'divider' && 'passage-divider')}
                  style={{
                    top: vi.start,
                    // 标题块自带 margin 内缩；经文 / 分割线用 left/right 偏移（与标题同缘对齐）
                    ...(isTitle ? {} : { left: 'var(--reader-pad)', right: 'var(--reader-pad)' }),
                  }}
                >
                  {it.type === 'title' ? (
                    titleColumn(makeTitleBlock(it.title, it.titleMode, t))
                  ) : it.type === 'divider' ? null : it.row.kind === 'verse' ? (
                    <VerseBlock
                      row={it.row}
                      typography={t}
                      stacked={mode === 'verse' && versionCodes.length > 1}
                      interactive={interactive}
                      highlightedVerses={highlightedVerses}
                      selectColor={selectColor}
                      panelId={panelId}
                      onToggleHighlight={onToggleHighlight}
                    />
                  ) : (
                    <ParaBlock
                      row={it.row}
                      typography={t}
                      stacked={mode === 'verse' && versionCodes.length > 1}
                      interactive={interactive}
                      highlightedVerses={highlightedVerses}
                      selectColor={selectColor}
                      panelId={panelId}
                      onToggleHighlight={onToggleHighlight}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 计算 DOM 节点内某 (node, nodeOffset) 边界相对于容器 el 文本内容的字符偏移。
 * 用于把光标选区边界映射到某节纯经文文本的 start/end。
 */
function offsetWithin(el: HTMLElement, node: Node, nodeOffset: number): number {
  if (node === el) {
    let total = 0;
    for (let i = 0; i < nodeOffset && i < el.childNodes.length; i++) {
      total += el.childNodes[i].textContent?.length ?? 0;
    }
    return total;
  }
  if (!el.contains(node)) return 0;
  let total = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) {
      total += nodeOffset;
      return total;
    }
    total += n.textContent?.length ?? 0;
  }
  return total;
}

/**
 * 光标拖选捕获：仅交互模式（主控台）启用。用户在画布里拖选经文后，
 * 把选区解析成若干字符区间（按 data-vmeta 归属到 bookId/chapter/verse/versionCode），
 * 写入 useTextSelectionStore，供底部控件条只作用于选区（而非整节 / 别的经文）。
 *
 * 选区折叠（点击 / 应用后失焦）不清空快照——保证「加高亮」后还能对同选区「加下划线」。
 * 新拖选会覆盖，✕ 按钮手动清除。
 */
function useCaptureTextSelection(containerRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onSel = () => {
      const sel = window.getSelection();
      const container = containerRef.current;
      // 选区折叠 / 空 / 不在画布内 → 视为「无光标选区」，清掉旧快照（避免指示器残留）
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !container) {
        if (useTextSelectionStore.getState().ranges.length) {
          // 点击「复制经文」按钮的瞬间会折叠选区，suppressClear 期间不要误清空
          if (!selectionFlags.suppressClear) useTextSelectionStore.getState().clear();
        }
        return;
      }
      const range = sel.getRangeAt(0);
      // 选区必须落在画布内（起点 / 终点 / 公共祖先任一在容器内即可）
      const inside =
        container.contains(range.startContainer) ||
        container.contains(range.endContainer) ||
        container.contains(range.commonAncestorContainer);
      if (!inside) {
        if (useTextSelectionStore.getState().ranges.length) {
          // 点击「复制经文」按钮的瞬间会折叠选区，suppressClear 期间不要误清空
          if (!selectionFlags.suppressClear) useTextSelectionStore.getState().clear();
        }
        return;
      }

      const els = Array.from(container.querySelectorAll<HTMLElement>('[data-vmeta]'));
      const ranges: PendingRange[] = [];
      for (const el of els) {
        if (!range.intersectsNode(el)) continue;
        const meta = el.getAttribute('data-vmeta');
        if (!meta) continue;
        const [b, c, v, vc] = meta.split(':');
        const bookId = Number(b);
        const chapter = Number(c);
        const verse = Number(v);
        const versionCode = vc;
        // 光标拖选 = 「选中这些文字」，绝不表示「选中此段经文」：拖选涉及的节立即撤掉整节强调色，
        // 避免经文在拖选期间仍显示强调色（与「光标选区高亮只作用于选区文字」的语义一致）
        const accentKey = highlightKey(bookId, chapter, verse);
        if (usePanelsStore.getState().highlightedVerses.includes(accentKey)) {
          usePanelsStore.getState().removeHighlightedVerse(accentKey);
        }
        const len = el.textContent?.length ?? 0;
        if (len === 0) continue;
        // comparePoint 的第二参数是「子节点偏移」，不是字符偏移——必须用 childNodes.length 取元素尾边界
        const cStart = range.comparePoint(el, 0);
        const cEnd = range.comparePoint(el, el.childNodes.length);
        let startOff: number;
        let endOff: number;
        if (cStart === -1 && cEnd !== -1) startOff = offsetWithin(el, range.startContainer, range.startOffset);
        else startOff = 0;
        if (cEnd === 1 && cStart !== 1) endOff = offsetWithin(el, range.endContainer, range.endOffset);
        else endOff = len;
        startOff = Math.max(0, Math.min(len, startOff));
        endOff = Math.max(0, Math.min(len, endOff));
        if (endOff - startOff >= 1) {
          ranges.push({ versionCode, bookId, chapter, verse, start: startOff, end: endOff });
        }
      }
      useTextSelectionStore.getState().setRanges(ranges);
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [containerRef, enabled]);
}

/* ---------- 单节块（逐节排版：一节一行，节号在节首，无首行缩进） ---------- */

interface VerseBlockProps {
  row: VerseRow;
  typography: PassageTypography;
  /** 逐节对照：同节多译本垂直堆叠 */
  stacked: boolean;
  interactive: boolean;
  /** 已高亮的节 ID 集合（复合键） */
  highlightedVerses: string[];
  /** 强调色（选中经文颜色） */
  selectColor?: string;
  /** 高亮所属面板 id（投影窗显式传入 payload.activePanelId；不传回退本窗口 store） */
  panelId?: string | null;
  /** 点击节：在集合中切换该节 */
  onToggleHighlight?: (verse: number, bookId?: number, chapter?: number) => void;
}

function VerseBlock({ row, typography: t, stacked, interactive, highlightedVerses, selectColor, panelId, onToggleHighlight }: VerseBlockProps) {
  const godTermSwap = useBibleStore((s) => s.godTermSwap);
  // 高亮按面板隔离：投影窗以 payload.activePanelId（panelId 显式传入）为准，
  // 主控台回退到本窗口 store 的 activePanelId——避免两窗口面板 id 不一致时读错桶
  const storePanelId = usePanelsStore((s) => s.activePanelId);
  const activePanelId = panelId !== undefined ? panelId : storePanelId;
  const highlightsMap = highlightsOf(useHighlightsStore((s) => s.byPanel), activePanelId);
  const isHL = highlightedVerses.includes(highlightKey(row.bookId, row.chapter, row.verse));
  const { bookId, chapter } = row;

  return (
    <div
      // 逐节模式：外层行容器承载 data-verse（与标题同缘对齐的基准；段落模式由 VerseItem 自身承载）
      data-verse={row.verse}
      className={cn(
        'verse-block block rounded-lg',
      )}
    >
      {row.cells.map((cell, ci) => {
        const showNumber = t.showVerseNumber && (ci === 0 || !stacked);
        return (
          <div
            key={cell.code}
            className={cn(stacked && ci > 0 && 'border-l-2 border-border pl-3')}
            style={stacked && ci > 0 ? { marginTop: 'calc(0.25rem * var(--canvas-scale, 1))' } : undefined}
          >
            {cell.text ? (
              interactive ? (
                <VerseItem
                  versionCode={cell.code}
                  bookId={bookId}
                  chapter={chapter}
                  verse={row.verse}
                  text={cell.text}
                  showVerseNumber={showNumber}
                  highlighted={isHL}
                  selectColor={selectColor}
                  onActivate={() => onToggleHighlight?.(row.verse, bookId, chapter)}
                />
              ) : (
                <span className="verse-line">
                  {showNumber && (
                    <sup className="verse-number" style={isHL ? { color: selectColor } : undefined}>
                      {row.verse}
                    </sup>
                  )}
                  <VerseText
                    text={cell.text}
                    godTerm={useBibleStore.getState().versions.find((v) => v.code === cell.code)?.godTerm ?? '神'}
                    swap={godTermSwap}
                    highlights={highlightsMap[verseKey(cell.code, bookId, chapter, row.verse)] ?? EMPTY_HIGHLIGHTS}
                    highlighted={isHL}
                    selectColor={selectColor}
                    vmeta={{ bookId, chapter, verse: row.verse, versionCode: cell.code }}
                  />
                </span>
              )
            ) : (
              <span className="py-1 text-sm text-muted-foreground/30">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 段落块（段落排版：多节成段，节号上标插入段内，首行缩进 2em，段间有距） ---------- */

interface ParaBlockProps {
  row: ParaRow;
  typography: PassageTypography;
  /** 逐节对照：同节多译本各自成段 */
  stacked: boolean;
  interactive: boolean;
  /** 已高亮的节 ID 集合（复合键） */
  highlightedVerses: string[];
  /** 强调色（选中经文颜色） */
  selectColor?: string;
  /** 高亮所属面板 id（投影窗显式传入 payload.activePanelId；不传回退本窗口 store） */
  panelId?: string | null;
  onToggleHighlight?: (verse: number, bookId?: number, chapter?: number) => void;
}

function ParaBlock({ row, typography: t, stacked, interactive, highlightedVerses, selectColor, panelId, onToggleHighlight }: ParaBlockProps) {
  const godTermSwap = useBibleStore((s) => s.godTermSwap);
  // 高亮按面板隔离：投影窗以 payload.activePanelId（panelId 显式传入）为准，
  // 主控台回退到本窗口 store 的 activePanelId——避免两窗口面板 id 不一致时读错桶
  const storePanelId = usePanelsStore((s) => s.activePanelId);
  const activePanelId = panelId !== undefined ? panelId : storePanelId;
  const highlightsMap = highlightsOf(useHighlightsStore((s) => s.byPanel), activePanelId);
  const isHL = (verse: number) => highlightedVerses.includes(highlightKey(bookId, chapter, verse));
  const { bookId, chapter } = row;

  return (
    <div
      style={{ paddingBottom: 'calc(0.25rem * var(--canvas-scale, 1))' }}
    >
      {row.cells.map((cell, ci) => {
        const showNumber = t.showVerseNumber && (ci === 0 || !stacked);
        return (
          <div
            key={cell.code}
            className={cn(stacked && ci > 0 && 'border-l-2 border-border pl-3')}
            style={stacked && ci > 0 ? { marginTop: 'calc(0.5rem * var(--canvas-scale, 1))' } : undefined}
          >
            <p className="para-text" style={t.verseAlign && t.verseAlign !== 'left' ? { textIndent: 0 } : undefined}>
              {cell.parts.map((part) =>
                part.text ? (
                  interactive ? (
                    <VerseItem
                      key={part.verse}
                      versionCode={cell.code}
                      bookId={bookId}
                      chapter={chapter}
                      verse={part.verse}
                      text={part.text}
                      showVerseNumber={showNumber}
                      inline
                      highlighted={isHL(part.verse)}
                      selectColor={selectColor}
                      onActivate={() => onToggleHighlight?.(part.verse, bookId, chapter)}
                    />
                  ) : (
                    <span key={part.verse} data-verse={part.verse}>
                      {showNumber && (
                        <sup className="verse-number mr-0.5" style={isHL(part.verse) ? { color: selectColor } : undefined}>
                          {part.verse}
                        </sup>
                      )}
                      <VerseText
                        text={part.text}
                        godTerm={useBibleStore.getState().versions.find((v) => v.code === cell.code)?.godTerm ?? '神'}
                        swap={godTermSwap}
                        highlights={highlightsMap[verseKey(cell.code, bookId, chapter, part.verse)] ?? EMPTY_HIGHLIGHTS}
                        highlighted={isHL(part.verse)}
                        selectColor={selectColor}
                        vmeta={{ bookId, chapter, verse: part.verse, versionCode: cell.code }}
                      />
                    </span>
                  )
                ) : null,
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
