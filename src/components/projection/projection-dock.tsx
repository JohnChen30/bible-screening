/**
 * projection-dock — 投影控件条（嵌入页面布局流）
 *
 * 设计约束（反馈3）：控件必须嵌入面板模块布局、紧贴预览面板底部，
 * 禁止绝对定位 / 悬浮层，确保绝不遮挡任何经文内容。因此本组件以正常
 * 文档流渲染在预览面板下方（console-page 的 flex 列布局中）。
 *
 * 三组控件（从左至右）：
 *   高亮组（左，核心）：已选节数 + 五色 + 下划线 + 清除格式，作用于全部已选经文；
 *   选区/强调组（右）：单选开关 + 强调色（色圈按钮，点击展开调色盘）；
 *   投影组（投影时最右）：黑屏 / 清屏 / 自动滚动 / 打开投影窗口 / 退出投影。
 *   （按反馈精简：去掉「上一节 / 下一节」翻节导航与 ←/→ 快捷键。）
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CircleOff, Eraser, ExternalLink, Gauge, Palette, Square, Underline, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type TextHighlight } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PaletteManagerButton } from '@/components/ui/palette-manager-button';
import { usePanelsStore, highlightKey } from '@/stores/use-panels-store';
import { useBibleStore } from '@/stores/use-bible-store';
import { highlightsOf, NO_PANEL, useHighlightsStore, verseKey } from '@/stores/use-highlights-store';
import { useTextSelectionStore } from '@/stores/use-text-selection-store';
import { highlightBg, usePaletteStore } from '@/stores/use-palette-store';

/** 稳定空数组引用 */
const EMPTY_HIGHLIGHTS: TextHighlight[] = [];

export function ProjectionDock() {
  const isProjecting = usePanelsStore((s) => s.isProjecting);
  const blackout = usePanelsStore((s) => s.blackout);
  const cleared = usePanelsStore((s) => s.cleared);
  const autoScroll = usePanelsStore((s) => s.autoScroll);
  const toggleBlackout = usePanelsStore((s) => s.toggleBlackout);
  const clearScreen = usePanelsStore((s) => s.clearScreen);
  const setAutoScroll = usePanelsStore((s) => s.setAutoScroll);
  const stopProjection = usePanelsStore((s) => s.stopProjection);

  const books = useBibleStore((s) => s.books);
  const activeVersionIds = useBibleStore((s) => s.activeVersionIds);

  // ---- 选区 / 强调色状态（工具栏常驻，始终可用） ----
  const singleSelectMode = usePanelsStore((s) => s.singleSelectMode);
  const setSingleSelectMode = usePanelsStore((s) => s.setSingleSelectMode);
  const selectColor = usePanelsStore((s) => s.selectColor);
  const setSelectColor = usePanelsStore((s) => s.setSelectColor);
  const highlightedVerses = usePanelsStore((s) => s.highlightedVerses);
  const hasSel = highlightedVerses.length > 0;
  /** 可自定义色板（管理按钮可逐个调整色圈颜色） */
  const highlightColors = usePaletteStore((s) => s.palettes.highlight);
  const accentColors = usePaletteStore((s) => s.palettes.accent);

  const primary = activeVersionIds[0];
  const activePanelId = usePanelsStore((s) => s.activePanelId);
  const panelId = activePanelId ?? NO_PANEL;
  const byPanel = useHighlightsStore((s) => s.byPanel);
  const highlightsMap = highlightsOf(byPanel, activePanelId);
  const addHighlight = useHighlightsStore((s) => s.add);
  const updateHighlight = useHighlightsStore((s) => s.update);
  const removeHighlight = useHighlightsStore((s) => s.remove);
  const clearPanel = useHighlightsStore((s) => s.clearPanel);
  const clearHighlightedVerses = usePanelsStore((s) => s.clearHighlightedVerses);
  const removeHighlightedVerse = usePanelsStore((s) => s.removeHighlightedVerse);

  /** 取某节经文长度（用于整节高亮区间判定） */
  const verseLengthOf = (vc: string, b: number, c: number, v: number) => {
    const data = useBibleStore.getState().dataCache[vc];
    const bk = books.find((bb) => bb.id === b);
    const ch = data?.[bk?.osis ?? '']?.[String(c)];
    return ch?.[String(v)]?.length ?? 0;
  };

  /** 光标拖选的字符区间（优先作为高亮目标）；空则退回整节已选经文 */
  const pendingRanges = useTextSelectionStore((s) => s.ranges);
  const hasPending = pendingRanges.length > 0;
  const clearPending = useTextSelectionStore((s) => s.clear);

  /** 高亮目标区间：光标选区优先（按版本+节定位）；否则整节已选经文（start0/end len） */
  const targets: { key: string; start: number; end: number }[] = hasPending
    ? pendingRanges.map((r) => ({ key: verseKey(r.versionCode, r.bookId, r.chapter, r.verse), start: r.start, end: r.end }))
    : hasSel
      ? highlightedVerses.map((k) => {
          const [b, c, v] = k.split(':').map(Number);
          return { key: verseKey(primary, b, c, v), start: 0, end: verseLengthOf(primary, b, c, v) };
        })
      : [];
  const hasTarget = targets.length > 0;

  /** 光标选区高亮：撤掉这些节原本的整节强调色，仅保留精确选区高亮（用户要求：选区不应带整节强调） */
  const dropAccentForPending = () => {
    if (!hasPending) return;
    for (const r of pendingRanges) removeHighlightedVerse(highlightKey(r.bookId, r.chapter, r.verse));
  };

  /** 5 色调色盘：作用于「目标区间」。再点同色 → 取消该高亮（切换） */
  const applyHighlight = (color: string) => {
    if (!primary || !hasTarget) return;
    // 色板存底色 hex，渲染时按固定不透明度叠加（color-mix），不改文字颜色
    const bg = highlightBg(color);
    dropAccentForPending();
    for (const t of targets) {
      const existing = highlightsMap[t.key] ?? EMPTY_HIGHLIGHTS;
      const tgt = existing.find((h) => h.start === t.start && h.end === t.end);
      if (tgt && tgt.color === bg) removeHighlight(panelId, t.key, tgt.id);
      else if (tgt) updateHighlight(panelId, t.key, tgt.id, { color: bg });
      else addHighlight(panelId, t.key, { start: t.start, end: t.end, color: bg, underline: false });
    }
  };

  /** 下划线：作用于目标区间。再点 → 取消下划线（切换） */
  const applyUnderline = () => {
    if (!primary || !hasTarget) return;
    dropAccentForPending();
    for (const t of targets) {
      const existing = highlightsMap[t.key] ?? EMPTY_HIGHLIGHTS;
      const tgt = existing.find((h) => h.start === t.start && h.end === t.end);
      if (!tgt) addHighlight(panelId, t.key, { start: t.start, end: t.end, color: null, underline: true });
      else if (tgt.underline) {
        if (tgt.color) updateHighlight(panelId, t.key, tgt.id, { underline: false });
        else removeHighlight(panelId, t.key, tgt.id);
      } else updateHighlight(panelId, t.key, tgt.id, { underline: true });
    }
  };

  /** 清除格式：清掉「此页」的全部格式——高亮（含整节 / 选区）、下划线、选中态，并清掉光标选区快照 */
  const clearAllFormats = () => {
    clearPanel(panelId);
    clearHighlightedVerses();
    clearPending();
  };

  /** 本页是否存在任何可清除的格式（高亮桶非空 / 有选中经文 / 有光标选区） */
  const hasAnyFormat =
    highlightedVerses.length > 0 || Object.keys(highlightsMap).length > 0 || hasPending;

  /** 目标区间是否带下划线 → 按钮按下态 */
  const anyUnderline =
    hasTarget &&
    targets.some((t) => {
      const existing = highlightsMap[t.key] ?? EMPTY_HIGHLIGHTS;
      return existing.some((h) => h.start === t.start && h.end === t.end && h.underline);
    });

  /** 目标区间是否已是某色高亮（全部命中）→ 色圈按下态 */
  const isColorActive = (color: string) => {
    const bg = highlightBg(color);
    return (
      hasTarget &&
      targets.every((t) => {
        const existing = highlightsMap[t.key] ?? EMPTY_HIGHLIGHTS;
        return existing.some((h) => h.start === t.start && h.end === t.end && h.color === bg);
      })
    );
  };

  const [accentOpen, setAccentOpen] = useState(false);

  return (
    <div data-projection-dock className="shrink-0 border-t border-border bg-card/40 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* ============ 高亮组（左侧，核心工具）：五色 + 下划线 + 清除格式 ============ */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="高亮工具">
          {/* 状态文案统一用系统 UI 字体（此前误用 font-serif，与其余界面不一致） */}
          <span className="text-xs text-foreground/70">
            {hasPending
              ? `已选文字 ${pendingRanges.reduce((a, r) => a + (r.end - r.start), 0)} 字`
              : hasSel
                ? `已选 ${highlightedVerses.length} 节`
                : '未选择经文'}
          </span>
          {hasPending && (
            <button
              title="取消文字选区（改回整节高亮）"
              aria-label="取消文字选区"
              onClick={clearPending}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-ring"
            >
              <CircleOff className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          )}
          <span className="h-4 w-px bg-border" />
          {/* 「高亮」文字提示：紧跟在分隔线后、五个色圈之前，说明这几个色圈的用途 */}
          <span className="select-none text-[11px] text-muted-foreground">高亮</span>
          {/* 五色高亮：作用于目标区间（光标选区优先，否则整节）；再点同色去掉 */}
          {highlightColors.map((c, i) => (
            <button
              key={i}
              title={`高亮 ${i + 1}（${hasPending ? '作用于选区文字' : '作用于已选经文'}；再点同色去掉）`}
              aria-label={`高亮-${i + 1}`}
              aria-pressed={isColorActive(c)}
              disabled={!hasTarget}
              onClick={() => applyHighlight(c)}
              className={cn(
                'h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-115 focus-ring disabled:opacity-40 disabled:pointer-events-none',
                isColorActive(c) && 'ring-2 ring-offset-1 ring-offset-card ring-foreground/70',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          {/* 色板管理：彩虹圆圈 + 齿轮，逐个调整色圈颜色 */}
          <PaletteManagerButton palette="highlight" side="top" />
          <button
            title={`下划线（${hasPending ? '作用于选区文字' : '作用于已选经文'}；再点去掉）`}
            aria-label="下划线"
            aria-pressed={anyUnderline}
            disabled={!hasTarget}
            onClick={applyUnderline}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/5 hover:text-foreground focus-ring disabled:opacity-40 disabled:pointer-events-none',
              anyUnderline ? 'bg-accent/15 text-accent' : 'text-muted-foreground',
            )}
          >
            <Underline className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          {/* 清除此页所有格式：高亮（整节 / 选区）、下划线、选中态 */}
          <button
            title="清除此页所有格式（高亮、下划线、选中）"
            aria-label="清除格式"
            disabled={!hasAnyFormat}
            onClick={clearAllFormats}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-ring disabled:opacity-40 disabled:pointer-events-none"
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.8} />
            清除格式
          </button>
        </div>

        {/* ============ 右侧：单选模式 + 强调色（点击色圈展开） ============ */}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* 单选 / 多选模式 */}
          <button
            title="单选模式：点击只选中一节（选择别的节原强调色消失）；关闭为多选"
            aria-pressed={singleSelectMode}
            onClick={() => setSingleSelectMode(!singleSelectMode)}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors focus-ring',
              singleSelectMode ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
            )}
          >
            <Check className={cn('h-3.5 w-3.5', !singleSelectMode && 'opacity-0')} strokeWidth={2.6} />
            单选
          </button>
          <span className="h-4 w-px bg-border" />
          {/* 「强调色」文字提示：紧邻强调色色圈，说明它控制选中经文的文字/节号颜色 */}
          <span className="select-none text-[11px] text-muted-foreground">强调色</span>
          {/* 强调色：色圈按钮，点击展开多种颜色 */}
          <div className="relative">
            <button
              title="强调色（选中经文颜色，点击展开）"
              aria-label="强调色"
              aria-expanded={accentOpen}
              onClick={() => setAccentOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/15 transition-transform hover:scale-110 focus-ring"
              style={{ backgroundColor: selectColor }}
            >
              <ChevronDown className="h-3 w-3 text-white/85 mix-blend-difference" strokeWidth={3} />
            </button>
            {accentOpen && (
              <>
                {/* 点击空白处关闭 */}
                <div className="fixed inset-0 z-40" onClick={() => setAccentOpen(false)} />
                <div className="absolute bottom-full right-0 z-50 mb-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                  <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                  {accentColors.map((c, i) => (
                    <button
                      key={i}
                      title={`强调色 ${c}`}
                      aria-label={`强调色-${c}`}
                      onClick={() => {
                        setSelectColor(c);
                        setAccentOpen(false);
                      }}
                      className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-115 focus-ring"
                      style={{
                        backgroundColor: c,
                        outline: selectColor.toLowerCase() === c.toLowerCase() ? '2px solid hsl(var(--foreground) / 0.55)' : undefined,
                      }}
                    />
                  ))}
                  {/* 色板管理：逐个调整强调色圈（取代原「自定义」取色按钮） */}
                  <PaletteManagerButton palette="accent" side="top" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ============ 投影组（投影时显示，最右侧） ============ */}
        {isProjecting && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              正在投影
            </span>
            <Button
              variant="outline"
              size="sm"
              className={cn('gap-1.5 rounded-xl', blackout && 'border-red-500/40 bg-red-500/10 text-red-400')}
              onClick={toggleBlackout}
            >
              <CircleOff className="h-3.5 w-3.5" />
              黑屏
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn('gap-1.5 rounded-xl', cleared && 'border-accent/40 bg-accent/10 text-accent')}
              onClick={clearScreen}
            >
              <Eraser className="h-3.5 w-3.5" />
              清屏
            </Button>
            {/* 自动滚动 5 档 */}
            <div className="flex items-center gap-1.5 rounded-xl bg-muted/50 px-2.5 py-1">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
              {[1, 2, 3, 4, 5].map((speed) => (
                <button
                  key={speed}
                  title={`自动滚动 ${speed} 档${autoScroll === speed ? '（点击停止）' : ''}`}
                  aria-label={`自动滚动-${speed}`}
                  onClick={() => setAutoScroll(autoScroll === speed ? 0 : speed)}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium transition-all focus-ring',
                    autoScroll === speed
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                  )}
                >
                  {speed}
                </button>
              ))}
            </div>
            <Link
              to="/output"
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开投影窗口
            </Link>
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-xl text-muted-foreground" onClick={stopProjection}>
              <Square className="h-3 w-3" />
              退出投影
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
