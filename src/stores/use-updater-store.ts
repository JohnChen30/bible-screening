/**
 * use-updater-store — 自动更新状态（非持久化，运行期）
 *
 * update: 检测到的可用更新对象（仅 Tauri 环境有值）
 * checking / installing：状态标记，供 UI 显示
 */

import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';

interface UpdaterState {
  update: Update | null;
  checking: boolean;
  installing: boolean;
  setUpdate: (u: Update | null) => void;
  setChecking: (v: boolean) => void;
  setInstalling: (v: boolean) => void;
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  update: null,
  checking: false,
  installing: false,
  setUpdate: (u) => set({ update: u }),
  setChecking: (v) => set({ checking: v }),
  setInstalling: (v) => set({ installing: v }),
}));
