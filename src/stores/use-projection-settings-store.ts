/**
 * use-projection-settings-store — 投影行为设置（持久化）
 *
 * 排版已统一：阅读区 / 预览区 / 投影输出三屏共用同一份排版（reader settings），
 * 本 store 只保留投影/ 面板的行为项。
 *
 * 用户反馈：「去掉默认自动滚动速度」→ autoScrollDefault 已移除，
 * 开始投影不再自动套用任何滚动速度（autoScroll 恒为 0，由用户在控件条按需开启）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 启动时的面板行为 */
export type PanelStartup = 'new' | 'keep';

interface ProjectionSettings {
  /**
   * 启动时面板行为（用户反馈）：
   *   new每次启动都打开一个全新面板（丢弃上次的面板列表）
   *   keep 保留上一次的面板列表
   * 默认 new —— 每次启动都是干净的单个面板。
   */
  panelStartup: PanelStartup;

  set: <K extends keyof ProjectionSettings>(key: K, value: ProjectionSettings[K]) => void;
  reset: () => void;
}

const DEFAULTS: Omit<ProjectionSettings, 'set' | 'reset'> = {
  panelStartup: 'new',
};

export const useProjectionSettingsStore = create<ProjectionSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<ProjectionSettings>),
      reset: () => set(DEFAULTS),
    }),
    { name: 'bible-projection-settings' },
  ),
);