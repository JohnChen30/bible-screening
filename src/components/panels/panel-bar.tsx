/**
 * panel-bar — 底部多面板系统
 *
 * 一排圆角矩形面板：点击即套用该选区并投影、悬停显示删除、右侧添加当前选区。
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePanelsStore } from '@/stores/use-panels-store';

export function PanelBar() {
  const panels = usePanelsStore((s) => s.panels);
  const activePanelId = usePanelsStore((s) => s.activePanelId);
  const activatePanel = usePanelsStore((s) => s.activatePanel);
  const removePanel = usePanelsStore((s) => s.removePanel);
  const addPanel = usePanelsStore((s) => s.addPanel);

  return (
    <div data-panel-bar className="toolbar-glass flex h-14 shrink-0 items-center gap-2 border-t border-border px-4">
      <span className="mr-1 shrink-0 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
        面板
      </span>

      <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2">
        <AnimatePresence initial={false}>
          {panels.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.85, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 'auto' }}
              exit={{ opacity: 0, scale: 0.85, width: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="group/panel relative shrink-0"
            >
              <button
                onClick={() => activatePanel(p.id)}
                className={cn(
                  'flex h-9 items-center rounded-xl px-3.5 text-[13px] transition-colors focus-ring',
                  activePanelId === p.id
                    ? 'bg-accent/12 font-medium text-accent ring-1 ring-inset ring-accent/20'
                    : 'bg-foreground/[0.045] text-foreground/70 hover:bg-foreground/[0.08] hover:text-foreground',
                )}
              >
                <span>{p.name}</span>
              </button>
              <button
                onClick={() => removePanel(p.id)}
                aria-label={`删除面板 ${p.name}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground shadow-md ring-1 ring-border transition-colors hover:text-red-400 group-hover/panel:flex focus-ring"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {panels.length === 0 && (
          <span className="text-xs text-muted-foreground/40">
            点右侧 + 新建面板（先清屏），再在左侧选经文上屏
          </span>
        )}
      </div>

      {/* 新建面板：先清屏，再选经文上屏 */}
      <button
        onClick={addPanel}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.045] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-ring"
        aria-label="新建面板"
        title="新建面板"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
