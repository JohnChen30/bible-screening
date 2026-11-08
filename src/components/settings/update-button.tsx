/**
 * update-button — 右下角「更新」入口
 *
 * 仅当检测到新版本（use-updater-store.update 非空）时显示；点击下载安装并重启。
 * 安装中显示加载态；非 Tauri 环境不渲染（网页版无此按钮）。
 */

import { useState } from 'react';
import { ArrowUpCircle, Loader2 } from 'lucide-react';
import { installUpdate } from '@/lib/app-updater';
import { useUpdaterStore } from '@/stores/use-updater-store';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function UpdateButton() {
  const update = useUpdaterStore((s) => s.update);
  const [installing, setInstalling] = useState(false);

  // 网页版不渲染
  if (!isTauri()) return null;
  if (!update) return null;

  const onClick = async () => {
    setInstalling(true);
    await installUpdate(update);
    setInstalling(false);
  };

  return (
    <button
      onClick={onClick}
      disabled={installing}
      title={installing ? '正在下载并安装更新…' : `更新到 v${update.version}`}
      aria-label="更新到新版本"
      className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {installing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ArrowUpCircle className="h-3.5 w-3.5" />
      )}
      更新
    </button>
  );
}
