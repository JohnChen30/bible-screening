/**
 * passage-layout — 阅读 / 预览 / 投影三屏共用的版面调度层
 *
 * 主控台阅读区、投影预览与投影窗口都经过本组件分发，从结构上保证三屏一致：
 *   split（≥2 译本）：左右双栏，各渲染单译本；
 *   verse（≥2 译本）：逐节上下对照（一节内多译本堆叠）；
 *   single：单译本。
 */

import { cn } from '@/lib/utils';
import type { CompareMode, PassageItem } from '@/lib/types';
import { PassageView, type PassageTypography } from './passage-view';

interface PassageLayoutProps {
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
   * 高亮所属面板 id（权威来源）。投影窗必须传 payload.activePanelId——
   * 投影窗与主控台是两个独立 JS 上下文，其本地 usePanelsStore.activePanelId
   * 可能与主控台不一致（主控台重载 / 切面板后），若不显式传入，投影窗会读错
   * 高亮桶 → 高亮/下划线不同步。不传则回退到本窗口 store 的 activePanelId。
   */
  panelId?: string | null;
  /** 点击节：在集合中切换该节（再次点击同节即取消）；透传该节所在的 bookId / chapter */
  onToggleHighlight?: (verse: number, bookId?: number, chapter?: number) => void;
  /** 投影页滚动到此节 */
  scrollToVerse?: number | null;
  /** 自动滚动档位（0 = 停止） */
  autoScroll?: number;
  /** 滚动同步源（主控台阅读区=true 广播比例；投影窗=false 应用比例） */
  scrollSync?: boolean;
  className?: string;
}

export function PassageLayout({
  passages,
  versionCodes,
  mode,
  typography,
  interactive = false,
  highlightedVerses = [],
  selectColor,
  panelId,
  onToggleHighlight,
  scrollToVerse,
  autoScroll = 0,
  scrollSync = false,
  className,
}: PassageLayoutProps) {
  if (mode === 'split' && versionCodes.length >= 2) {
    return (
      <div className={cn('flex h-full min-h-0', className)}>
        {versionCodes.slice(0, 2).map((code, i) => (
          <div key={code} className={cn('flex min-h-0 min-w-0 flex-1 flex-col', i === 0 && 'border-r border-border')}>
            <PassageView
              passages={passages}
              versionCodes={[code]}
              mode="single"
              typography={typography}
              interactive={interactive}
              highlightedVerses={highlightedVerses}
              selectColor={selectColor}
              panelId={panelId}
              onToggleHighlight={onToggleHighlight}
              scrollToVerse={scrollToVerse}
              autoScroll={autoScroll}
              scrollSync={scrollSync}
              scrollIndex={i}
              className="h-full"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <PassageView
      passages={passages}
      versionCodes={mode === 'single' ? versionCodes.slice(0, 1) : versionCodes}
      mode={mode === 'verse' ? 'verse' : 'single'}
      typography={typography}
      interactive={interactive}
      highlightedVerses={highlightedVerses}
      selectColor={selectColor}
      panelId={panelId}
      onToggleHighlight={onToggleHighlight}
      scrollToVerse={scrollToVerse}
      autoScroll={autoScroll}
      scrollSync={scrollSync}
      className={className}
    />
  );
}
