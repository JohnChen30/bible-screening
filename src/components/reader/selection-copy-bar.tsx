/**
 * selection-copy-bar — 拖选 / 单击经文后浮现的「复制经文」浮条（停靠在面板底部）
 *
 * 行为（用户）：
 *   - 仅在「交互模式」（主控台阅读区）启用——与光标选区捕获同一开关；
 *   - 两类选中都触发：① 拖选一段文字（ranges）；② 单击整节（可多选，highlightedVerses 强调色集合）；
 *   - 浮条停靠在**面板底部居中**（单击整节时没有文字选区可贴）；
 *   - 点击或按 Ctrl/Cmd + C 即把选中的经文写入剪贴板：统一每节一行 + 专属标题；
 *   - 复制成功后：清空选中强调色、撤掉拖选文字选区，浮条随即消失。
 *
 * 实现要点：
 *   - 复制逻辑抽到 lib/copy-selection，按钮与全局快捷键共用；
 *   - createPortal 挂到 document.body，脱离画布（避免被 overflow / 祖先 transform 夹住）；
 *   - 位置用 rAF 每帧从面板画布 `[data-panel-canvas]` 实时计算；
 *   - 按钮 onMouseDown 调 suppressSelectionClearFor —— 点击瞬间折叠文字选区会触发
 *     selectionchange，期间抑制选区守卫误清空 ranges。
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { suppressSelectionClearFor, useTextSelectionStore } from '@/stores/use-text-selection-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { copySelectedScripture } from '@/lib/copy-selection';

export function SelectionCopyBar({ containerRef }: { containerRef?: RefObject<HTMLElement | null> }) {
  const ranges = useTextSelectionStore((s) => s.ranges);
  const highlightedVerses = usePanelsStore((s) => s.highlightedVerses);

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
    await copySelectedScripture();
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
        {/* 快捷键提示（浅灰，不随按钮 hover 变色） */}
        <span className="ml-0.5 rounded border border-border/60 px-1 py-px text-[10px] font-normal text-muted-foreground/60">
          Ctrl + C
        </span>
      </button>
    </div>,
    document.body,
  );
}
