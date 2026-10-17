/**
 * verse-text — 经文富文本渲染
 *
 * 能力：
 *   1. 神/上帝称呼互换（渲染层动态替换，不落库）；
 *   2. 文本高亮 + 下划线（作用于选定区间）；
 *   3. 投影态整节强调色。
 */

import { Fragment } from 'react';
import type { TextHighlight } from '@/lib/types';
import { cn } from '@/lib/utils';

/** 神/上帝互换（ naive 全局替换；v1 够用，边界词如“神人”会一并替换） */
export function swapGodTerm(text: string, godTerm: string, on: boolean): string {
  if (!on) return text;
  if (godTerm === '神') return text.replace(/神/g, '上帝');
  if (godTerm === '上帝') return text.replace(/上帝/g, '神');
  return text;
}

/** 按高亮区间切分文本并包裹 <mark> */
function renderWithHighlights(text: string, highlights: TextHighlight[]) {
  if (!highlights.length) return text;
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.start < cursor || h.end <= h.start || h.start >= text.length) continue; // 跳过重叠 / 越界
    if (h.start > cursor) nodes.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, h.start)}</Fragment>);
    nodes.push(
      <mark
        key={h.id}
        style={{
          backgroundColor: h.color ?? 'transparent',
          color: 'inherit',
          textDecoration: h.underline ? 'underline' : undefined,
          textUnderlineOffset: '0.18em',
          borderRadius: h.color ? '0.12em' : undefined,
          // 不占布局：去掉 padding，背景只涂在文字自身盒上，避免经文位置随高亮上下/左右位移
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {text.slice(h.start, Math.min(h.end, text.length))}
      </mark>,
    );
    cursor = Math.min(h.end, text.length);
  }
  if (cursor < text.length) nodes.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return nodes;
}

interface VerseTextProps {
  text: string;
  godTerm: string;
  swap: boolean;
  highlights?: TextHighlight[];
  /** 是否已点击高亮（强调色，瞬间切换、无过渡） */
  highlighted?: boolean;
  /** 强调色（选中经文颜色；工具栏可自由设置，三屏同步） */
  selectColor?: string;
  className?: string;
  /** 选区高亮所需身份：bookId:chapter:verse:versionCode（供光标拖选解析归属） */
  vmeta?: { bookId: number; chapter: number; verse: number; versionCode: string };
}

export function VerseText({
  text,
  godTerm,
  swap,
  highlights = [],
  highlighted,
  selectColor,
  className,
  vmeta,
}: VerseTextProps) {
  const display = swapGodTerm(text, godTerm, swap);
  return (
    <span
      className={cn('reader-text', className)}
      data-vmeta={vmeta ? `${vmeta.bookId}:${vmeta.chapter}:${vmeta.verse}:${vmeta.versionCode}` : undefined}
      style={highlighted ? { color: selectColor } : undefined}
    >
      {renderWithHighlights(display, highlights)}
    </span>
  );
}
