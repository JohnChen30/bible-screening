/**
 * panel-bar — 底部多面板系统
 *
 * 一排圆角矩形面板：点击即套用该选区并投影、悬停显示删除、右侧添加当前选区。
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BIBLE_PANEL_ID } from '@/lib/types';
import { usePanelsStore } from '@/stores/use-panels-store';

export function PanelBar() {
  const panels = usePanelsStore((s) => s.panels);
  const activePanelId = usePanelsStore((s) => s.activePanelId);
  const activatePanel = usePanelsStore((s) => s.activatePanel);
  const removePanel = usePanelsStore((s) => s.removePanel);
  const addPanel = usePanelsStore((s) => s.addPanel);

  // 固定「圣经」面板永远排在第一位
  const ordered = [...panels].sort((a, b) =>
    a.id === BIBLE_PANEL_ID ? -1 : b.id === BIBLE_PANEL_ID ? 1 : 0,
  );

  return (
    <div data-panel-bar className="toolbar-glass flex h-14 shrink-0 items-center gap-2 border-t border-border px-4">
      <span className="mr-1 shrink-0 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
        面板
      </span>

      <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2">
        <AnimatePresence initial={false}>
          {ordered.map((p) => {
            const isFixed = p.id === BIBLE_PANEL_ID;
            return (
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
                  title={isFixed ? '固定面板 · 不可关闭 · 标注长期保留' : p.name}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] transition-colors focus-ring',
                    isFixed
                      ? // 固定面板：不用强调色区分，只把边框加粗（激活时仍沿用通用激活态）
                        activePanelId === p.id
                        ? 'bg-accent/12 font-semibold text-accent ring-2 ring-inset ring-accent/35'
                        : 'bg-foreground/[0.03] text-foreground/75 ring-2 ring-inset ring-foreground/20 hover:bg-foreground/[0.06] hover:text-foreground'
                      : activePanelId === p.id
                        ? 'bg-accent/12 font-medium text-accent ring-1 ring-inset ring-accent/20'
                        : 'bg-foreground/[0.045] text-foreground/70 hover:bg-foreground/[0.08] hover:text-foreground',
                  )}
                >
                  {isFixed && <Lock className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />}
                  <span>{p.name}</span>
                </button>
                {!isFixed && (
                  <button
                    onClick={() => removePanel(p.id)}
                    aria-label={`删除面板 ${p.name}`}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground shadow-md ring-1 ring-border transition-colors hover:text-red-400 group-hover/panel:flex focus-ring"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </motion.div>
            );
          })}
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
