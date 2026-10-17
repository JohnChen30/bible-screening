/**
 * selection-copy-bar — 拖选 / 单击经文后浮现的「复制经文」浮条（停靠在面板底部）
 *
 * 行为（用户）：
 *   - 仅在「交互模式」（主控台阅读区）启用——与光标选区捕获同一开关；
 *   - 两类选中都触发：① 拖选一段文字（ranges）；② 单击整节（可多选，highlightedVerses 强调色集合）；
 *   - 浮条停靠在**面板底部居中**（单击整节时没有文字选区可贴）；
 *   - 点击即把选中的经文写入剪贴板：统一每节一行 + 专属标题（连号给区间 / 非连号给逗号节号）；
 *   - 复制成功后：**清空页面所有选中强调色**（highlightedVerses）、撤掉拖选文字选区、
 *     浮条随即消失；复制失败则保留选中以便重试。
 *
 * 实现要点：
 *   - createPortal 挂到 document.body，脱离画布（避免被 overflow / 祖先 transform 夹住）；
 *   - 位置用 rAF 每帧从面板画布 `[data-panel-canvas]` 实时计算，侧栏开合 / 缩放始终贴底；
 *   - 按钮 onMouseDown 调 suppressSelectionClearFor —— 点击瞬间折叠文字选区会触发
 *     selectionchange，期间抑制选区守卫误清空 ranges；
 *   - 复制前从各 store getState() 取权威数据（避免 React 闭包过期）；
 *   - 剪贴板写入走「现代异步 API → legacy textarea+execCommand」双保险。
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBibleStore } from '@/stores/use-bible-store';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';
import { suppressSelectionClearFor, useTextSelectionStore } from '@/stores/use-text-selection-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { buildScriptureCopyText, type WholeVerse } from '@/lib/copy-scripture';

/** 写入剪贴板：现代异步 API 优先，失败退回 legacy textarea+execCommand（用户手势内同步执行） */
async function copyTextToClipboard(text: string): Promise<boolean> {
  // 1) 现代异步剪贴板 API（安全上下文）
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 退回 legacy */
  }
  // 2) legacy：textarea + execCommand（必须在用户手势内同步执行）
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 把「单击选中的整节」强调色键（bookId:chapter:verse）转成整节选区（用当前主译本） */
function toWholeVerses(keys: string[], versionCode: string | undefined): WholeVerse[] {
  if (!versionCode) return [];
  const out: WholeVerse[] = [];
  for (const k of keys) {
    const [b, c, v] = k.split(':').map(Number);
    if (Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(v)) {
      out.push({ versionCode, bookId: b, chapter: c, verse: v });
    }
  }
  return out;
}

export function SelectionCopyBar({ containerRef }: { containerRef?: RefObject<HTMLElement | null> }) {
  const ranges = useTextSelectionStore((s) => s.ranges);
  const highlightedVerses = usePanelsStore((s) => s.highlightedVerses);
  const books = useBibleStore((s) => s.books);
  const dataCache = useBibleStore((s) => s.dataCache);
  const getVersionMeta = useBibleStore((s) => s.getVersionMeta);
  const primaryVersion = useBibleStore((s) => s.activeVersionIds[0]);
  const showVerseNumber = useReaderSettingsStore((s) => s.showVerseNumber);
  const titleFormat = useReaderSettingsStore((s) => s.titleFormat);

  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // 选区（拖选 / 单击整节）变化 → 显示 / 隐藏浮条
  useEffect(() => {
    setVisible(ranges.length > 0 || highlightedVerses.length > 0);
  }, [ranges, highlightedVerses]);

  // 浮条停靠在面板画布底部居中：每帧从画布实测矩形计算，侧栏动画 / 缩放都始终贴底
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const update = () => {
      const el = barRef.current;
      const host =
        (containerRef?.current?.closest('[data-panel-canvas]') as HTMLElement | null) ??
        containerRef?.current ??
        null;
      if (el && host) {
        const r = host.getBoundingClientRect();
        const top = r.bottom - 52;
        const left = r.left + r.width / 2;
        el.style.top = `${Math.max(8, top)}px`;
        el.style.left = `${Math.min(left, window.innerWidth - 90)}px`;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [visible, containerRef]);

  if (!visible) return null;

  const onCopy = async () => {
    // 直接从各 store 取权威数据（避免闭包过期）；先快照再清空
    const rangeSnap = useTextSelectionStore.getState().ranges;
    const accentSnap = usePanelsStore.getState().highlightedVerses;
    const text = buildScriptureCopyText(rangeSnap, {
      books,
      dataCache,
      showVerseNumber,
      titleFormat,
      versionName: (c) => getVersionMeta(c)?.name ?? c,
      wholeVerses: toWholeVerses(accentSnap, primaryVersion),
    });
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    // 复制成功：清空页面所有选中强调色 + 撤掉拖选文字选区 + 清空复制选区（浮条随之消失）
    if (ok) {
      usePanelsStore.getState().clearHighlightedVerses();
      window.getSelection()?.removeAllRanges();
      useTextSelectionStore.getState().clear();
    }
  };

  return createPortal(
    <div
      ref={barRef}
      className="fixed z-[300]"
      style={{ top: 0, left: 0, transform: 'translateX(-50%)' }}
    >
      <button
        type="button"
        // 点击瞬间会折叠文字选区并触发 selectionchange，期间抑制守卫误清空本 store
        onMouseDown={() => suppressSelectionClearFor()}
        onClick={onCopy}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-lg transition-colors',
          'glass-strong border-border text-foreground hover:border-accent/50 hover:text-accent',
        )}
      >
        <Copy className="h-3.5 w-3.5" />
        复制经文
      </button>
    </div>,
    document.body,
  );
}
