/**
 * use-color-schemes-store — 整套配色方案（持久化）
 *
 * 用户反馈：颜色里保留 2 套配色方案——「浅色」所有元素的颜色与「深色」所有
 * 元素的颜色；点击即可应用，且可自由更改并保存。另可添加多套「自定义方案」。
 *
 * 一套方案 = 一组完整的元素颜色（经文 / 节号 / 标题 / 背景）。
 * 应用方案即把其颜色写入 reader settings（三屏所见即所得）；
 * 在颜色设置里改动任一元素颜色时，同步写回「当前方案」，实现「自由更改保存」。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';

export interface SchemeColors {
  textColor: string;
  verseNumberColor: string;
  titleColor: string;
  backgroundColor: string;
}

export interface ColorScheme {
  id: string;
  name: string;
  /** 内置方案（浅色 / 深色）：不可删除，但可自由改色并保存 */
  builtin?: boolean;
  colors: SchemeColors;
}

/** 内置两套方案（默认配色即「浅色」） */
export const BUILTIN_SCHEMES: ColorScheme[] = [
  {
    id: 'light',
    name: '浅色',
    builtin: true,
    colors: {
      textColor: '#000000',
      verseNumberColor: 'hsl(0 0% 55%)',
      titleColor: '#000000',
      backgroundColor: '#F6EEDC',
    },
  },
  {
    id: 'dark',
    name: '深色',
    builtin: true,
    colors: {
      textColor: 'hsl(40 14% 92%)',
      verseNumberColor: 'hsl(0 0% 45%)',
      titleColor: 'hsl(40 14% 92%)',
      backgroundColor: '#121212',
    },
  },
];

interface ColorSchemesState {
  schemes: ColorScheme[];
  /** 当前正在使用的方案 id（null = 已脱离任何方案的自由配色） */
  activeSchemeId: string | null;

  /** 应用方案：把其颜色写入 reader settings，并标记为当前方案 */
  applyScheme: (id: string) => void;
  /** 新增自定义方案（以当前 reader 颜色为初始内容），并切换为当前方案 */
  addScheme: () => void;
  /** 复制某个方案（含内置）为一套新的自定义方案，并切换过去 */
  duplicateScheme: (id: string) => void;
  /** 删除自定义方案 */
  removeScheme: (id: string) => void;
  /** 重命名方案 */
  renameScheme: (id: string, name: string) => void;
  /** 改动当前方案的某个元素颜色（跟随颜色设置同步保存） */
  updateColor: (key: keyof SchemeColors, value: string) => void;
}

export const useColorSchemesStore = create<ColorSchemesState>()(
  persist(
    (set, get) => ({
      schemes: BUILTIN_SCHEMES,
      activeSchemeId: 'light',

      applyScheme: (id) => {
        const scheme = get().schemes.find((s) => s.id === id);
        if (!scheme) return;
        // 原子写入：一次 setState 更新全部元素颜色，避免多次广播
        useReaderSettingsStore.setState({
          textColor: scheme.colors.textColor,
          verseNumberColor: scheme.colors.verseNumberColor,
          titleColor: scheme.colors.titleColor,
          backgroundColor: scheme.colors.backgroundColor,
        });
        set({ activeSchemeId: id });
      },

      addScheme: () => {
        const rs = useReaderSettingsStore.getState();
        const n = get().schemes.filter((s) => !s.builtin).length + 1;
        const id = `custom-${Date.now().toString(36)}`;
        const scheme: ColorScheme = {
          id,
          name: `自定义 ${n}`,
          colors: {
            textColor: rs.textColor,
            verseNumberColor: rs.verseNumberColor,
            titleColor: rs.titleColor,
            backgroundColor: rs.backgroundColor,
          },
        };
        set((s) => ({ schemes: [...s.schemes, scheme], activeSchemeId: id }));
      },

      duplicateScheme: (id) => {
        const src = get().schemes.find((s) => s.id === id);
        if (!src) return;
        const nid = `custom-${Date.now().toString(36)}`;
        set((s) => ({
          schemes: [...s.schemes, { id: nid, name: `${src.name} 副本`, colors: { ...src.colors } }],
          activeSchemeId: nid,
        }));
      },

      removeScheme: (id) => {
        const target = get().schemes.find((s) => s.id === id);
        if (!target || target.builtin) return; // 内置方案不可删
        set((s) => ({
          schemes: s.schemes.filter((x) => x.id !== id),
          activeSchemeId: s.activeSchemeId === id ? null : s.activeSchemeId,
        }));
      },

      renameScheme: (id, name) =>
        set((s) => ({
          schemes: s.schemes.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)),
        })),

      updateColor: (key, value) => {
        const { activeSchemeId } = get();
        if (!activeSchemeId) return;
        set((s) => ({
          schemes: s.schemes.map((x) =>
            x.id === activeSchemeId ? { ...x, colors: { ...x.colors, [key]: value } } : x,
          ),
        }));
      },
    }),
    {
      name: 'bible-color-schemes',
      partialize: (s) => ({ schemes: s.schemes, activeSchemeId: s.activeSchemeId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ColorSchemesState>;
        const stored = Array.isArray(p.schemes) ? p.schemes : [];
        // 内置方案（浅色 / 深色）始终以「最佳默认」为准（用户反馈：内置就得是最好的），
        // 即使持久化里曾被改动也重置；自定义方案原样保留。
        const builtins = BUILTIN_SCHEMES.map((b) => ({ ...b }));
        const customs = stored.filter((s) => !BUILTIN_SCHEMES.some((b) => b.id === s.id));
        return { ...current, ...p, schemes: [...builtins, ...customs] };
      },
      // 重水合后把「当前方案」的颜色重新应用到 reader 设置，保证面板配色与所选方案一致
      onRehydrateStorage: () => (state) => {
        if (state?.activeSchemeId) state.applyScheme(state.activeSchemeId);
      },
    },
  ),
);
