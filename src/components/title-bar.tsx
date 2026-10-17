/**
 * TitleBar — 自定义无边框窗口顶栏（/console）
 *
 * 主窗口 `decorations:false`，无原生标题栏，故提供此组件：
 * - 空白处（`data-tauri-drag-region`）按住即可拖动窗口；
 * - 右侧三个 Windows 11 风格按钮：最小化 / 最大化·还原 / 关闭，
 *   走 `@tauri-apps/api/window` 的 `getCurrentWindow()`。
 *
 * 非 Tauri 环境（浏览器 `npm run dev`）下按钮不做任何破坏性行为：
 * `getCurrentWindow()` 仅在 `__TAURI_INTERNALS__` 存在时调用，避免白屏。
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function TitleBar() {
  const minimize = () => {
    if (isTauri()) void getCurrentWindow().minimize();
  };
  const toggleMaximize = () => {
    if (isTauri()) void getCurrentWindow().toggleMaximize();
  };
  const close = () => {
    if (isTauri()) void getCurrentWindow().close();
  };

  return (
    <div className="flex h-9 shrink-0 select-none items-stretch border-b border-border toolbar-glass text-foreground">
      {/* 拖拽区：空白处按住拖动窗口（data-tauri-drag-region） */}
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center px-3">
        <span className="truncate text-[12px] font-medium tracking-wide text-muted-foreground">
          Bible Screening
        </span>
      </div>

      {/* Windows 11 风格窗口控制按钮 */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={minimize}
          aria-label="最小化"
          className="flex w-11 items-center justify-center text-foreground/70 transition-colors hover:bg-foreground/10"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={toggleMaximize}
          aria-label="最大化或还原"
          className="flex w-11 items-center justify-center text-foreground/70 transition-colors hover:bg-foreground/10"
        >
          <Square className="h-3 w-3" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="关闭"
          className="flex w-11 items-center justify-center text-foreground/70 transition-colors hover:bg-red-500 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
