/**
 * app-settings-popover — 右下角「设置」悬浮小窗（多分类菜单）
 *
 * 分类（顶部横向目录，macOS System Settings 风格）：
 *   - 快捷键：列出全部快捷键动作，支持自定义 / 单个重置 / 恢复默认；
 *   - 软件版本：当前版本号 + 打开 GitHub 仓库 / 打开网页版。
 *
 * 挂载于 PanelBar 最右端（右下角），弹窗向上弹出。左侧还有「更新」按钮（UpdateButton）。
 */

import { useEffect, useState } from 'react';
import { Github, Globe, Info, Keyboard, RotateCcw, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useShortcutsStore } from '@/stores/use-shortcuts-store';
import {
  SHORTCUT_ACTIONS,
  eventToShortcut,
  formatShortcut,
  type ShortcutActionId,
} from '@/lib/shortcuts';
import { GITHUB_REPO_URL, WEB_APP_URL, getAppVersion, openExternal } from '@/lib/app-info';

type TabId = 'shortcuts' | 'about';

const TABS: { id: TabId; label: string; icon: typeof Keyboard }[] = [
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'about', label: '软件版本', icon: Info },
];

export function AppSettingsPopover() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('shortcuts');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" aria-label="设置" title="设置">
          <Settings className="h-3.5 w-3.5" />
          设置
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={10}
        className="glass-strong scrollbar-thin max-h-[min(72vh,32rem)] w-[23rem] overflow-y-auto rounded-[12px] p-0"
      >
        {/* 标题栏 + 横向目录 */}
        <div className="sticky top-0 z-10 border-b border-border backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide">
              <Settings className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
              设置
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭设置"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-1 px-3 pb-2.5" role="tablist" aria-label="设置目录">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[6px] text-xs font-medium transition-all focus-ring',
                  tab === t.id
                    ? 'bg-card text-foreground shadow-[0_1px_3px_hsl(var(--foreground)/0.12),0_0_0_0.5px_hsl(var(--foreground)/0.06)]'
                    : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
                )}
              >
                <t.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容 */}
        <div className="px-4 py-3">
          {tab === 'shortcuts' && <ShortcutsTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================ 快捷键分类 ============================ */

function ShortcutsTab() {
  const bindings = useShortcutsStore((s) => s.bindings);
  const setBinding = useShortcutsStore((s) => s.setBinding);
  const resetBinding = useShortcutsStore((s) => s.resetBinding);
  const resetAll = useShortcutsStore((s) => s.resetAll);

  const [recording, setRecording] = useState<ShortcutActionId | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const keys = eventToShortcut(e);
      if (keys) {
        setBinding(recording, keys);
        setRecording(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, setBinding]);

  useEffect(() => {
    if (!recording) return;
    const t = window.setTimeout(() => setRecording(null), 3000);
    return () => window.clearTimeout(t);
  }, [recording]);

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          点「自定义」后按下新组合键绑定；Esc 取消。立即生效。
        </p>
        <button
          onClick={resetAll}
          className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-ring"
          title="恢复全部默认快捷键"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={1.8} />
          恢复默认
        </button>
      </div>

      <div className="space-y-1.5">
        {SHORTCUT_ACTIONS.map((a) => {
          const isRec = recording === a.id;
          return (
            <div
              key={a.id}
              className={cn(
                'flex items-center justify-between rounded-md px-2.5 py-2 transition-colors',
                isRec ? 'bg-accent/[0.08] ring-1 ring-inset ring-accent/30' : 'hover:bg-foreground/[0.04]',
              )}
            >
              <span className="text-[13px] text-foreground/85">{a.label}</span>
              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'min-w-[3rem] rounded border px-1.5 py-0.5 text-center text-[11px] font-medium tabular-nums',
                    isRec
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-border bg-foreground/[0.03] text-foreground/75',
                  )}
                >
                  {isRec ? '按下新键…' : formatShortcut(bindings[a.id])}
                </kbd>
                <button
                  onClick={() => setRecording(isRec ? null : a.id)}
                  className={cn(
                    'flex h-6 items-center rounded-md px-2 text-[11px] transition-colors focus-ring',
                    isRec ? 'text-accent' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
                  )}
                >
                  {isRec ? '取消' : '自定义'}
                </button>
                <button
                  onClick={() => resetBinding(a.id)}
                  aria-label={`重置 ${a.label}`}
                  title="重置为默认"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-ring"
                >
                  <RotateCcw className="h-3 w-3" strokeWidth={1.8} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============================ 软件版本分类 ============================ */

function AboutTab() {
  const [version, setVersion] = useState('…');
  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  return (
    <div className="space-y-2">
      {/* 版本号 */}
      <div className="flex items-center justify-between rounded-[10px] bg-foreground/[0.035] px-3 py-2.5 ring-1 ring-inset ring-foreground/[0.06]">
        <span className="text-[13px] text-foreground/85">当前版本</span>
        <span className="tabular-nums text-xs text-muted-foreground">v{version}</span>
      </div>

      {/* 外链 */}
      <div className="space-y-1.5">
        <AboutLink
          icon={Github}
          title="打开 GitHub 仓库"
          desc="查看源码、反馈问题、下载最新安装包"
          onClick={() => openExternal(GITHUB_REPO_URL)}
        />
        <AboutLink
          icon={Globe}
          title="打开网页版"
          desc="无需安装，在浏览器中使用（保留投影窗口预览）"
          onClick={() => openExternal(WEB_APP_URL)}
        />
      </div>

      <p className="px-0.5 pt-1 text-[11px] leading-relaxed text-muted-foreground/60">
        桌面版启动时会在后台自动检查更新，发现新版本后右下角会出现「更新」按钮。
      </p>
    </div>
  );
}

function AboutLink({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Github;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[10px] bg-foreground/[0.035] px-3 py-2.5 text-left ring-1 ring-inset ring-foreground/[0.06] transition-colors hover:bg-foreground/[0.06] focus-ring"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-foreground/85">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground/70">{desc}</span>
      </span>
    </button>
  );
}
