/**
 * MillerColumns — macOS Finder 风格分栏选择器
 *
 * 列结构：书卷 → 章节 → 起始节 → 结束节
 * 交互：
 *   - 点击即更新阅读区（无需确认）；
 *   - 键盘：↑ ↓ 列内移动，← → 切换列，Enter 确认；
 *   - 列间极细分割线，悬停 / 选中为精致圆角高亮；
 *   - 选中项带 Framer Motion 共享布局动画，跨列滑动如原生。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BookMeta, Selection } from '@/lib/types';

interface MillerColumnsProps {
  books: BookMeta[];
  selection: Selection;
  chapterCount: (bookId: number | null) => number;
  verseCount: (bookId: number | null, chapter: number | null) => number;
  onSelect: (patch: Partial<Selection>) => void;
  /** 追加模式：选中一段新经文后追加到当前面板（不替换全局选区） */
  appendMode?: boolean;
  /** 追加模式下的提交回调（选到结束节时触发，携带完整的一段 Selection） */
  onAppend?: (passage: Selection) => void;
}

interface ColumnItem {
  key: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  group?: string; // 分组标题（旧约/新约）
}

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.8 };

export function MillerColumns({ books, selection, chapterCount, verseCount, onSelect, appendMode, onAppend }: MillerColumnsProps) {
  const [focusCol, setFocusCol] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const chapters = useMemo(() => {
    const n = chapterCount(selection.bookId);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [chapterCount, selection.bookId]);

  const verses = useMemo(() => {
    const n = verseCount(selection.bookId, selection.chapter);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [verseCount, selection.bookId, selection.chapter]);

  const endVerses = useMemo(() => {
    if (!selection.startVerse) return [];
    const n = verseCount(selection.bookId, selection.chapter);
    return Array.from({ length: n - selection.startVerse + 1 }, (_, i) => selection.startVerse! + i);
  }, [verseCount, selection.bookId, selection.chapter, selection.startVerse]);

  /** 构造四列数据 */
  const columns = useMemo<{ key: string; label: string; width: string; items: ColumnItem[] }[]>(() => {
    const bookItems: ColumnItem[] = [];
    let lastGroup = '';
    for (const b of books) {
      const group = b.testament === 'old' ? '旧约' : '新约';
      if (group !== lastGroup) {
        bookItems.push({ key: `__group_${group}`, label: group, selected: false, group });
        lastGroup = group;
      }
      bookItems.push({
        key: String(b.id),
        label: b.nameCn,
        sublabel: b.abbr,
        selected: selection.bookId === b.id,
      });
    }
    return [
      { key: 'book', label: '书卷', items: bookItems, width: 'w-[11.5rem]' },
      {
        key: 'chapter', label: '章节', width: 'w-[4.5rem]',
        items: chapters.map((c) => ({ key: String(c), label: String(c), selected: selection.chapter === c })),
      },
      {
        key: 'startVerse', label: '起始节', width: 'w-[4.5rem]',
        items: verses.map((v) => ({ key: String(v), label: String(v), selected: selection.startVerse === v })),
      },
      {
        key: 'endVerse', label: '结束节', width: 'w-[4.5rem]',
        items: endVerses.map((v) => ({ key: String(v), label: String(v), selected: selection.endVerse === v })),
      },
    ];
  }, [books, chapters, verses, endVerses, selection]);

  /** 当前列的可选条目（跳过分组标题） */
  const selectable = (colIdx: number) =>
    columns[colIdx].items.filter((it) => !it.group);

  /** 点击某列某项 */
  const handlePick = (colIdx: number, item: ColumnItem) => {
    if (item.group) return;
    setFocusCol(colIdx);
    const v = Number(item.key);
    if (colIdx === 0) {
      // 换书卷：节重置，默认落定第 1 章（显式落定，避免 selection.chapter 为 null
      // 导致节数查询为 0、分栏节列表为空）
      onSelect({ bookId: v, chapter: 1, startVerse: null, endVerse: null });
    } else if (colIdx === 1) {
      onSelect({ chapter: v, startVerse: null, endVerse: null });
    } else if (colIdx === 2) {
      // 起始节：若结束节小于新的起始节则清除
      const patch: Partial<Selection> = { startVerse: v };
      if (selection.endVerse != null && selection.endVerse < v) patch.endVerse = null;
      onSelect(patch);
    } else {
      onSelect({ endVerse: v });
      // 追加模式：选到结束节即提交一段（如 约3:16-18），追加到当前面板而非替换
      if (appendMode && onAppend) {
        onAppend({
          bookId: selection.bookId,
          chapter: selection.chapter,
          startVerse: selection.startVerse ?? v,
          endVerse: v,
        });
      }
    }
  };

  /** 键盘导航 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = selectable(focusCol);
    if (!items.length) return;
    const currentIdx = Math.max(
      0,
      items.findIndex((it) => it.selected),
    );
    let idx = currentIdx;
    switch (e.key) {
      case 'ArrowDown':
        idx = Math.min(items.length - 1, currentIdx + 1);
        break;
      case 'ArrowUp':
        idx = Math.max(0, currentIdx - 1);
        break;
      case 'ArrowRight':
        if (focusCol < 3) { e.preventDefault(); setFocusCol(focusCol + 1); }
        return;
      case 'ArrowLeft':
        if (focusCol > 0) { e.preventDefault(); setFocusCol(focusCol - 1); }
        return;
      case 'Enter':
        e.preventDefault();
        if (currentIdx >= 0) {
          handlePick(focusCol, items[currentIdx]);
          if (focusCol < 3) setFocusCol(focusCol + 1);
        }
        return;
      case 'Home': idx = 0; break;
      case 'End': idx = items.length - 1; break;
      default:
        return;
    }
    e.preventDefault();
    handlePick(focusCol, items[idx]);
  };

  /** 选中项滚动进入视野 */
  useEffect(() => {
    const col = columns[focusCol];
    const selected = col.items.find((it) => it.selected);
    if (selected) {
      itemRefs.current.get(`${col.key}:${selected.key}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusCol, columns]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full min-h-0 flex-1 outline-none"
      aria-label="经文选择器"
    >
      {columns.map((col, colIdx) => (
        <div
          key={col.key}
          className={cn(
            'flex min-h-0 flex-col border-r border-border last:border-r-0',
            col.width,
            focusCol === colIdx && 'bg-foreground/[0.02]',
          )}
        >
          {/* 列头 */}
          <div className="flex h-9 shrink-0 items-center justify-between px-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {col.label}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground/60">
              {selectable(colIdx).length || ''}
            </span>
          </div>
          {/* 列表 */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            {selectable(colIdx).length === 0 && colIdx > 0 ? (
              <EmptyHint colIdx={colIdx} />
            ) : (
              col.items.map((item) =>
                item.group ? (
                  <div
                    key={item.key}
                    className="sticky top-0 z-10 bg-card/95 px-2 pb-1 pt-2 text-[10px] font-medium tracking-[0.2em] text-muted-foreground/70 backdrop-blur"
                  >
                    {item.label}
                  </div>
                ) : (
                  <motion.button
                    key={item.key}
                    ref={(el) => {
                      if (el) itemRefs.current.set(`${col.key}:${item.key}`, el);
                      else itemRefs.current.delete(`${col.key}:${item.key}`);
                    }}
                    layout
                    transition={SPRING}
                    onClick={() => handlePick(colIdx, item)}
                    className={cn(
                      'group relative mb-0.5 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors',
                      'focus-ring',
                      item.selected
                        ? 'font-medium text-accent'
                        : 'text-foreground/75 hover:bg-foreground/[0.055] hover:text-foreground',
                    )}
                  >
                    {/* 选中高亮（共享布局动画） */}
                    {item.selected && (
                      <motion.span
                        layoutId={`miller-hl-${col.key}`}
                        transition={SPRING}
                        className="absolute inset-0 -z-10 rounded-lg bg-accent/12 ring-1 ring-inset ring-accent/20"
                      />
                    )}
                    {colIdx === 0 && (
                      <span
                        className={cn(
                          'flex h-5 min-w-[1.75rem] shrink-0 items-center justify-center rounded px-1 text-[11px] tabular-nums',
                          item.selected ? 'bg-accent/15 text-accent' : 'bg-foreground/[0.06] text-muted-foreground',
                        )}
                      >
                        {item.sublabel}
                      </span>
                    )}
                    <span className={cn('min-w-0 flex-1 truncate', colIdx > 0 && 'tabular-nums')}>{item.label}</span>
                  </motion.button>
                ),
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 后三列在无前置选择时的提示 */
function EmptyHint({ colIdx }: { colIdx: number }) {
  const hints = ['', '请先选择书卷', '请先选择章节', '请先选择起始节'];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <BookOpen className="h-5 w-5 text-muted-foreground/30" strokeWidth={1.5} />
      <p className="text-xs text-muted-foreground/50">{hints[colIdx]}</p>
    </div>
  );
}
