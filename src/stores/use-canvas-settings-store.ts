/**
 * use-canvas-settings-store — 面板画布设置（阅读 / 投影通用，持久化）
 *
 * “面板比例”对主控台阅读区与投影窗口同时生效：
 * 两端渲染同一宽高比的幻灯片式画布，保证所见即所得。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AspectRatio } from '@/lib/types';

export type { AspectRatio };

interface CanvasSettings {
  aspectRatio: AspectRatio;
  setAspectRatio: (v: AspectRatio) => void;
}

const DEFAULTS = {
  aspectRatio: '16:9' as AspectRatio,
};

export const useCanvasSettingsStore = create<CanvasSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setAspectRatio: (v) => set({ aspectRatio: v }),
    }),
    { name: 'bible-canvas-settings' },
  ),
);
