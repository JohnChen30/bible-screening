/**
 * search-box — 顶栏经文关键词检索（小输入框 + 下拉结果窗）
 *
 * 行为（用户）：
 *   - 顶栏空白处一个小搜索框，可按键词检索单节经文；
 *   - 多词用**空格**分隔、一起检索（框内占位提示；语义为 AND——同时包含所有词）；
 *   - 输入即在下框展开结果窗（不大、不遮挡、可滚轮滑动）；
 *   - 每条结果**只显示检索词周围的片段**（不整节铺开），检索词高亮；
 *   - 点选结果即**新建一个面板**并把该节放进去（跳转过去）。
 *
 * 实现：检索交给 bible-search.searchBible（懒建索引、AND、按书卷次序排序、
 * 自带片段与高亮区间）。结果窗用 Radix Popover，portal 到 #app-root-fs，
 * 避免被顶栏 overflow-x-auto 裁剪。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBibleStore } from '@/stores/use-bible-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { searchBible, type SearchHit } from '@/lib/bible-search';

/** 片段渲染：把命中区间包成 <mark> 高亮（不加 padding，避免撑高行盒） */
function Snippet({ hit }: { hit: SearchHit }) {
  const { snippet, matches } = hit;
  if (!matches.length) return <>{snippet}</>;
  const parts: ReactNode[] = [];
  let cur = 0;
  matches.forEach(([s, e], i) => {
    if (s > cur) parts.push(<span key={`t${i}`}>{snippet.slice(cur, s)}</span>);
    parts.push(
      <mark key={`m${i}`} className="rounded-[2px] bg-accent/20 text-accent">
        {snippet.slice(s, e)}
      </mark>,
    );
    cur = e;
  });
  if (cur < snippet.length) parts.push(<span key="tail">{snippet.slice(cur)}</span>);
  return <>{parts}</>;
}

export function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const books = useBibleStore((s) => s.books);
  const dataCache = useBibleStore((s) => s.dataCache);
  const activeVersionIds = useBibleStore((s) => s.activeVersionIds);
  const addPanelWithPassage = usePanelsStore((s) => s.addPanelWithPassage);
  const versionKey = activeVersionIds.join(',');

  // 输入 → 防抖检索（空输入即收起）
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      setOpen(false);
      return;
    }
    const t = window.setTimeout(() => {
      setHits(searchBible({ codes: activeVersionIds, dataCache, books, query, limit: 40 }));
      setOpen(true);
    }, 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, versionKey, dataCache, books]);

  const onSelect = (h: SearchHit) => {
    // 新建一个面板，把这一节放进去（跳转）
    addPanelWithPassage({ bookId: h.bookId, chapter: h.chapter, startVerse: h.verse, endVerse: h.verse });
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
  };

  const query = q.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'mx-auto flex h-8 w-[248px] items-center gap-1.5 rounded-lg border border-border bg-card/60 pl-2.5 pr-2 transition-colors',
            'hover:border-accent/40 focus-within:border-accent/50 focus-within:bg-card',
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={2} />
          <input
            ref={inputRef}
            value={q}
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value);
              if (!e.target.value.trim()) setOpen(false);
            }}
            onFocus={() => {
              if (q.trim()) setOpen(true);
            }}
            placeholder="搜索经文（多词用空格分隔）"
            aria-label="搜索经文"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="glass-strong w-[420px] max-w-[92vw] rounded-xl border border-border p-1 shadow-2xl"
      >
        {hits.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground/60">
            没有找到同时包含「{query}」的经文
          </div>
        ) : (
          <div className="scrollbar-thin max-h-[360px] overflow-y-auto">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">
              共 {hits.length} 处{query ? ` · ${query}` : ''}
            </div>
            {hits.map((h, i) => (
              <button
                key={`${h.bookId}-${h.chapter}-${h.verse}-${i}`}
                type="button"
                onClick={() => onSelect(h)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-foreground/[0.06] focus-ring"
              >
                <span className="text-[11px] font-medium text-accent">
                  {h.bookName} {h.chapter}:{h.verse}
                </span>
                <span className="text-[12.5px] leading-snug text-foreground/80">
                  <Snippet hit={h} />
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
