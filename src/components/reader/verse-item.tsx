/**
 * verse-item — 单节经文行
 *
 * 交互（v3）：
 *   - 单击：设置跟读游标（不触发投影；投影严格只由投影按钮触发），
 *     并呼出底部控件条中的高亮工具；再次单击当前节取消选中；
 *   - 高亮 / 下划线 / 清除格式：统一在底部控件条操作，不使用悬浮工具栏；
 *   - 游标所在节：节号变为强调色。
 */

import { cn } from '@/lib/utils';
import type { TextHighlight } from '@/lib/types';
import { useBibleStore } from '@/stores/use-bible-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { highlightsOf, useHighlightsStore, verseKey } from '@/stores/use-highlights-store';
import { VerseText } from './verse-text';

/** 稳定空数组引用（避免 zustand getSnapshot 每次返回新引用导致无限重渲染） */
const EMPTY_HIGHLIGHTS: TextHighlight[] = [];

interface VerseItemProps {
  versionCode: string;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  showVerseNumber: boolean;
  /** 段落内联排版（段落模式）：无块级内边距，节号上标插入段内 */
  inline?: boolean;
  /** 是否已点击高亮（强调色） */
  highlighted?: boolean;
  /** 强调色（选中经文颜色；工具栏可自由设置） */
  selectColor?: string;
  onActivate?: () => void;
}

export function VerseItem({
  versionCode,
  bookId,
  chapter,
  verse,
  text,
  showVerseNumber,
  inline = false,
  highlighted,
  selectColor,
  onActivate,
}: VerseItemProps) {
  const godTermSwap = useBibleStore((s) => s.godTermSwap);
  const godTerm = useBibleStore((s) => s.versions.find((v) => v.code === versionCode)?.godTerm ?? '神');
  // 高亮按面板隔离：只取当前活动面板的临时标注
  const activePanelId = usePanelsStore((s) => s.activePanelId);
  const byPanel = useHighlightsStore((s) => s.byPanel);
  const highlightsMap = highlightsOf(byPanel, activePanelId);
  const highlights = highlightsMap[verseKey(versionCode, bookId, chapter, verse)] ?? EMPTY_HIGHLIGHTS;

  return (
    <span
      // 段落内联模式：节元素自身承载 data-verse（逐节模式由外层行容器承载，见 passage-view）
      data-verse={inline ? verse : undefined}
      className={cn(
        'group/verse relative rounded-lg',
        inline ? 'inline' : 'block px-2 -mx-2',
        !highlighted && 'hover:bg-foreground/[0.03]',
      )}
      style={
        inline
          ? undefined
          : {
              // 垂直内边距随画布等比缩放（固定 px 会破坏投影与预览的行高比例）
              paddingTop: 'calc(0.125rem * var(--canvas-scale, 1))',
              paddingBottom: 'calc(0.125rem * var(--canvas-scale, 1))',
            }
      }
      onClick={() => {
        // 拖选文字后的 mouseup 也会触发 click：若当前仍有非折叠的文字选区，说明这次 click
        // 来自「拖选」而非「点选整节」，绝不能误触发整节选中（强调色）——只选文字、不选经文。
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        // 点选整节：切换该节强调色（多选模式累加、单选模式只保留一节）。
        // 强调色集合（highlightedVerses）即「选中的经文」——复制浮条据此显示、复制后一并清空。
        onActivate?.();
      }}
    >
      {showVerseNumber && (
        <sup
          className={cn('verse-number select-none', inline && 'mr-0.5')}
          style={highlighted ? { color: selectColor } : undefined}
        >
          {verse}
        </sup>
      )}
      <VerseText
        text={text}
        godTerm={godTerm}
        swap={godTermSwap}
        highlights={highlights}
        highlighted={highlighted}
        selectColor={selectColor}
        vmeta={{ bookId, chapter, verse, versionCode }}
      />
    </span>
  );
}
