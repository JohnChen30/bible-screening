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

/**
 * 数字快速定位的缓冲时间（ms）。
 * 人体工学依据：人连续敲两个数字键的间隔通常在 150~300ms。取 500ms 能稳妥地把
 * 「1 之后紧接着 2」合并成「12」定位到第 12 章/节，又不至于让用户输完等太久；
 * 主流快速定位交互普遍落在 400~800ms 区间，这里取中偏紧的 500ms。
 */
const DIGIT_BUFFER_MS = 500;

export function MillerColumns({ books, selection, chapterCount, verseCount, onSelect, appendMode, onAppend }: MillerColumnsProps) {
  const [focusCol, setFocusCol] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  /** 数字缓冲状态：{ col: 聚焦列, text: 累积数字, timer: 提交定时器 } */
  const digitRef = useRef<{ col: number; text: string; timer: number }>({ col: 0, text: '', timer: 0 });
  /** 缓冲数字的展示态（列头实时回显「→ 12」） */
  const [digitText, setDigitText] = useState('');
  /** 最新 selection 快照（供定时器提交时读取，避免闭包过期） */
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

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
      if (selectionRef.current.endVerse != null && selectionRef.current.endVerse < v) patch.endVerse = null;
      onSelect(patch);
    } else {
      onSelect({ endVerse: v });
      // 追加模式：选到结束节即提交一段（如 约3:16-18），追加到当前面板而非替换
      if (appendMode && onAppend) {
        onAppend({
          bookId: selectionRef.current.bookId,
          chapter: selectionRef.current.chapter,
          startVerse: selectionRef.current.startVerse ?? v,
          endVerse: v,
        });
      }
    }
  };

  /** 数字快速定位：每敲一个数字就**立即**把当前缓冲值落到某列（不右移焦点）。
   *  输「1」马上跳 1，缓冲内再输「2」跳到 12；越界则静默忽略。仅章节列（1/2/3）。 */
  const locateDigit = (colIdx: number, n: number) => {
    if (!Number.isFinite(n) || n < 1) return;
    const sel = selectionRef.current;
    let valid = false;
    if (colIdx === 1) {
      valid = n <= chapterCount(sel.bookId);
    } else if (colIdx === 2) {
      valid = n <= verseCount(sel.bookId, sel.chapter);
    } else if (colIdx === 3) {
      const min = sel.startVerse ?? 1;
      valid = n >= min && n <= verseCount(sel.bookId, sel.chapter);
    }
    if (!valid) return;
    handlePick(colIdx, { key: String(n), label: String(n), selected: false });
  };

  /** 缓冲结束时：只清空数字缓冲，不切换焦点列——数字定位的目标列始终由鼠标点击决定。 */
  const flushDigit = () => {
    digitRef.current.text = '';
    digitRef.current.timer = 0;
    setDigitText('');
  };

  /** 键盘导航 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 数字键：快速定位（增量即时跳转）。先点击某列聚焦，再输入数字即定位到该列第 N 项
    if (/^[0-9]$/.test(e.key)) {
      if (focusCol === 0) return; // 书卷列非数字定位目标
      e.preventDefault();
      const next = (digitRef.current.text || '') + e.key;
      digitRef.current.text = next;
      digitRef.current.col = focusCol;
      setDigitText(next);
      // 立即用当前缓冲定位（用户反馈：输 1 马上跳 1，缓冲内输 2 跳到 12）
      locateDigit(focusCol, parseInt(next, 10));
      // 把焦点从被点击的项收回容器（容器无可见边框），避免旧项残留 focus ring，
      // 与新选中框叠加成「一列两个框」
      containerRef.current?.focus();
      if (digitRef.current.timer) window.clearTimeout(digitRef.current.timer);
      digitRef.current.timer = window.setTimeout(flushDigit, DIGIT_BUFFER_MS);
      return;
    }

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

  /** 切换聚焦列（点击 / 左右键）时，丢弃未提交的数字缓冲，避免串列 */
  useEffect(() => {
    if (digitRef.current.timer) window.clearTimeout(digitRef.current.timer);
    digitRef.current = { col: focusCol, text: '', timer: 0 };
    setDigitText('');
  }, [focusCol]);

  /** 卸载时清理定时器 */
  useEffect(
    () => () => {
      if (digitRef.current.timer) window.clearTimeout(digitRef.current.timer);
    },
    [],
  );

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
              {digitText && focusCol === colIdx ? (
                <span className="font-semibold text-accent">→ {digitText}</span>
              ) : (
                selectable(colIdx).length || ''
              )}
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
                  <button
                    key={item.key}
                    ref={(el) => {
                      if (el) itemRefs.current.set(`${col.key}:${item.key}`, el);
                      else itemRefs.current.delete(`${col.key}:${item.key}`);
                    }}
                    onClick={() => handlePick(colIdx, item)}
                    className={cn(
                      'group relative mb-0.5 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors',
                      'focus-ring',
                      item.selected
                        ? 'font-medium text-accent'
                        : 'text-foreground/75 hover:bg-foreground/[0.055] hover:text-foreground',
                    )}
                  >
                    {/* 选中高亮：即时切换，不做 layoutId 飞行动画——键盘快速定位下该动画会残留旧框、新框呈「浅」过渡态 */}
                    {item.selected && (
                      <span className="absolute inset-0 -z-10 rounded-lg bg-accent/12 ring-1 ring-inset ring-accent/20" />
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
                  </button>
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
