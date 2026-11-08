/**
 * use-shortcuts-store — 快捷键绑定（持久化）
 *
 * bindings: 动作 id → 键位字符串（见 lib/shortcuts 的格式约定）。
 * 支持单个重置与全部恢复默认。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_BINDINGS, type ShortcutActionId } from '@/lib/shortcuts';

interface ShortcutsState {
  bindings: Record<ShortcutActionId, string>;
  /** 自定义单个动作键位 */
  setBinding: (id: ShortcutActionId, keys: string) => void;
  /** 重置单个动作到默认 */
  resetBinding: (id: ShortcutActionId) => void;
  /** 全部恢复默认 */
  resetAll: () => void;
}

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set) => ({
      bindings: { ...DEFAULT_BINDINGS },
      setBinding: (id, keys) =>
        set((s) => ({ bindings: { ...s.bindings, [id]: keys } })),
      resetBinding: (id) =>
        set((s) => ({ bindings: { ...s.bindings, [id]: DEFAULT_BINDINGS[id] } })),
      resetAll: () => set({ bindings: { ...DEFAULT_BINDINGS } }),
    }),
    {
      name: 'bible-shortcuts',
      version: 1,
      // 旧数据 / 缺失字段 → 用默认补齐；历史遗留动作字段清理掉
      migrate: (persisted) => {
        const p = (persisted ?? {}) as { bindings?: Partial<Record<ShortcutActionId, string>> };
        const next: Record<ShortcutActionId, string> = { ...DEFAULT_BINDINGS };
        if (p.bindings && typeof p.bindings === 'object') {
          for (const [k, v] of Object.entries(p.bindings)) {
            if (k in DEFAULT_BINDINGS && typeof v === 'string' && v) {
              next[k as ShortcutActionId] = v;
            }
          }
        }
        return { bindings: next };
      },
    },
  ),
);
