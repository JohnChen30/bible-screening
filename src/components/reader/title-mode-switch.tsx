/**
 * title-mode-switch — 标题显示方式开关（常驻顶部 / 随文滚动 / 不显示）
 *
 * 用户反馈：标题不要一直常驻在画面上方 → 默认「随文」（标题在滚动区首行、
 * 随经文一起滚出画面）；需要时一键「常驻」（固定在顶部不滚动）或「不显示」。
 * 三屏共用同一份设置（经 payload.typography 广播），主控台与投影窗始终一致。
 *
 * 放在顶栏常驻可见（控件条只在投影 / 选中节时才出现，不适合放首个入口）。
 */

import { EyeOff, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReaderSettingsStore, type TitleMode } from '@/stores/use-reader-settings-store';

const MODES: { value: TitleMode; label: string; hint: string; icon: typeof Pin }[] = [
  { value: 'pinned', label: '常驻', hint: '标题固定顶部，经文滚动时标题不动', icon: Pin },
  { value: 'inline', label: '随文', hint: '标题随经文滚动，滚出画面后不再占位（默认）', icon: PinOff },
  { value: 'hidden', label: '不显示', hint: '完全不显示标题，不留空白', icon: EyeOff },
];

interface TitleModeSwitchProps {
  className?: string;
  /** 只显示图标（顶栏空间紧张时使用） */
  iconOnly?: boolean;
}

export function TitleModeSwitch({ className, iconOnly = false }: TitleModeSwitchProps) {
  const titleMode = useReaderSettingsStore((s) => s.titleMode) ?? 'inline';
  const set = useReaderSettingsStore((s) => s.set);

  return (
    <div
      className={cn('flex shrink-0 items-center gap-0.5 rounded-[7px] bg-foreground/[0.06] p-[2px]', className)}
      role="group"
      aria-label="标题显示方式"
    >
      {!iconOnly && <span className="px-1 text-[11px] text-muted-foreground">标题</span>}
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = titleMode === m.value;
        return (
          <button
            key={m.value}
            title={m.hint}
            aria-label={`标题-${m.label}`}
            aria-pressed={active}
            onClick={() => set('titleMode', m.value)}
            className={cn(
              'flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] px-2 text-[11px] font-medium leading-none transition-all focus-ring',
              active
                ? 'bg-card text-foreground shadow-[0_1px_3px_hsl(var(--foreground)/0.12),0_0_0_0.5px_hsl(var(--foreground)/0.06)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3 w-3" strokeWidth={1.8} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
