/**
 * verse-item — 单节经文行
 *
 * 交互（v3）：
 *   - 单击：设置跟读游标（不触发投影；投影严格只由投影按钮触发），
 *     并呼出底部控件条中的高亮工具；再次单击当前节取消选中；
 *   - 高亮 / 下划线 / 清除格式：统一在底部控件条操作，不使用悬浮工具栏；
 *   - 游标所在节：节号变为强调色。
 */

import { useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { mergeHighlightsAcrossVersions } from '@/lib/highlight-merge';
import { useBibleStore } from '@/stores/use-bible-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { highlightsOf, useHighlightsStore } from '@/stores/use-highlights-store';
import { VerseText } from './verse-text';

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
  /**
   * 参与「同节标注合并」的译本集合（分屏 / 逐节对照时传入全部版本，
   * 使同一面板同一节在各窗格的标注保持同步）。不传则只合并本版本。
   */
  highlightVersionCodes?: string[];
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
  highlightVersionCodes,
  onActivate,
}: VerseItemProps) {
  const godTermSwap = useBibleStore((s) => s.godTermSwap);
  const godTerm = useBibleStore((s) => s.versions.find((v) => v.code === versionCode)?.godTerm ?? '神');
  // 高亮按面板隔离：只取当前活动面板的临时标注
  const activePanelId = usePanelsStore((s) => s.activePanelId);
  const byPanel = useHighlightsStore((s) => s.byPanel);
  const highlightsMap = highlightsOf(byPanel, activePanelId);
  // 分屏 / 逐节对照：把同一节在所有相关译本上的标注合并到本译本，保证同一经文同步显示
  const codesKey = (highlightVersionCodes ?? [versionCode]).join(',');
  const highlights = useMemo(
    () =>
      mergeHighlightsAcrossVersions(
        highlightsMap,
        codesKey ? codesKey.split(',') : [versionCode],
        versionCode,
        bookId,
        chapter,
        verse,
      ),
    [highlightsMap, codesKey, versionCode, bookId, chapter, verse],
  );

  /** 按下位置：用于区分「拖选文字的 mouseup→click」与「真正的点选整节」 */
  const downPos = useRef<{ x: number; y: number } | null>(null);

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
      onMouseDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        // 用「按下→抬起」的指针位移区分拖选与点选（不再用 getSelection().isCollapsed）：
        //   位移明显 = 拖选文字（mouseup 顺带触发 click）→ 不切换整节强调色；
        //   位移≈0   = 真正的点选 → 切换强调色。
        // 这样即便为了保留文字选区而 preventDefault（原生选区长期非折叠），
        // 点选经文也不会再被误判为「拖选结尾」而失效。
        const d = downPos.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
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
