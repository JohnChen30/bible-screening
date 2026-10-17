/**
 * palette-manager-button — 色板管理入口（彩虹圆圈 + 小齿轮图标）
 *
 * 用户反馈：为色圈加一个「管理色板」按钮，可逐个调整每个色圈的颜色。
 * 图标为「小设置（齿轮）图标 + 彩虹圆圈框」。点击展开管理浮层，内含
 * 每个色圈的原生取色器（可实时改色）与「恢复默认」。
 *
 * 同一按钮复用于：底部工具栏高亮色区 / 排版设置·颜色与质感 / 强调色展开面板。
 * 浮层走全局 Popover（portal 进全屏根元素），全屏下亦可见可点。
 */

import { RotateCcw, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PALETTE_DEFAULTS, PALETTE_NAMES, usePaletteStore, type PaletteId } from '@/stores/use-palette-store';

/** 彩虹圆圈框（conic 渐变） */
const RAINBOW = 'conic-gradient(from 0deg, #ff5f6d, #ffc371, #f9f871, #7bed9f, #48c6ef, #a55eea, #ff5f6d)';

interface PaletteManagerButtonProps {
  palette: PaletteId;
  /** 浮层相对触发器的方位（默认上方） */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** 各色圈中文名（可选；缺省「色圈 N」） */
  labels?: string[];
  className?: string;
}

export function PaletteManagerButton({ palette, side = 'top', labels, className }: PaletteManagerButtonProps) {
  const colors = usePaletteStore((s) => s.palettes[palette] ?? PALETTE_DEFAULTS[palette]);
  const setPaletteColor = usePaletteStore((s) => s.setPaletteColor);
  const resetPalette = usePaletteStore((s) => s.resetPalette);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${PALETTE_NAMES[palette]}：点击逐个调整色圈颜色`}
          aria-label={`管理-${PALETTE_NAMES[palette]}`}
          className={cn(
            'relative h-6 w-6 shrink-0 rounded-full p-[2px] transition-transform hover:scale-110 focus-ring',
            className,
          )}
          style={{ background: RAINBOW }}
        >
          <span className="flex h-full w-full items-center justify-center rounded-full bg-card text-muted-foreground">
            <Settings2 className="h-3 w-3" strokeWidth={2} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="center" sideOffset={8} className="w-60 p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide">{PALETTE_NAMES[palette]}</span>
          <button
            type="button"
            onClick={() => resetPalette(palette)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            恢复默认
          </button>
        </div>
        <div className="space-y-1.5">
          {colors.map((c, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-foreground/[0.04]"
            >
              <span className="text-[11px] text-foreground/70">{labels?.[i] ?? `色圈 ${i + 1}`}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tabular-nums text-muted-foreground/60">{c}</span>
                <span className="relative block h-6 w-6 overflow-hidden rounded-full ring-1 ring-inset ring-black/15">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => setPaletteColor(palette, i, e.target.value)}
                    aria-label={`${PALETTE_NAMES[palette]}-色圈${i + 1}`}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span className="pointer-events-none block h-full w-full" style={{ backgroundColor: c }} />
                </span>
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
