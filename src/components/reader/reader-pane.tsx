/**
 * reader-pane — 阅读区面板（主控台，同时充当投影预览区）
 *
 * 薄封装：统一排版设置 + 交互模式 + 自动滚动，渲染逻辑全部在 PassageLayout /
 * PassageView。三屏（阅读区 / 预览区 / 投影输出）共用同一组件与同一排版。
 */

import { useMemo } from 'react';
import { useBibleStore } from '@/stores/use-bible-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';
import { toPassage, type CompareMode, type PassageItem } from '@/lib/types';
import { PassageLayout } from './passage-layout';

interface ReaderPaneProps {
  versionCodes: string[];
  mode: CompareMode;
  className?: string;
}

export function ReaderPane({ versionCodes, mode, className }: ReaderPaneProps) {
  const settings = useReaderSettingsStore();
  const highlightedVerses = usePanelsStore((s) => s.highlightedVerses);
  const selectColor = usePanelsStore((s) => s.selectColor);
  const toggleHighlight = usePanelsStore((s) => s.toggleHighlight);
  const autoScroll = usePanelsStore((s) => s.autoScroll);
  const panels = usePanelsStore((s) => s.panels);
  const activePanelId = usePanelsStore((s) => s.activePanelId);
  const selection = useBibleStore((s) => s.selection);

  /** 阅读区渲染的经文段 = 当前活动面板（可能多段追加）；无面板时由全局选区退化。
   *  三屏（阅读 / 预览 / 投影）均渲染同一面板内容，保证三端同步。
   *
   *  有活动面板时**一律以其 passages 为准**：新建面板为空（passages:[]）→ 返回空数组 →
   *  清屏画面（空白画布）；**不可回退全局选区**，否则空面板会“自作主张”显示出默认经文，
   *  与「新建面板先清屏、选经文再上屏」相悖。仅当无活动面板时才用全局选区退化。 */
  const passages = useMemo<PassageItem[]>(() => {
    const active = panels.find((p) => p.id === activePanelId);
    if (active) return active.passages ?? [];
    if (selection.bookId != null) return [toPassage(selection)];
    return [];
  }, [panels, activePanelId, selection.bookId, selection.chapter, selection.startVerse, selection.endVerse]);

  return (
    <PassageLayout
      passages={passages}
      versionCodes={versionCodes}
      mode={mode}
      typography={settings}
      interactive
      highlightedVerses={highlightedVerses}
      selectColor={selectColor}
      onToggleHighlight={toggleHighlight}
      autoScroll={autoScroll}
      scrollSync
      className={className}
    />
  );
}
