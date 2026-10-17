/**
 * use-palette-store — 可自定义色板（持久化）
 *
 * 用户反馈：色圈颜色要可调——高亮色、强调色、经文 / 节号 / 标题 / 背景颜色预设
 * 都提供「色板管理」入口，可逐个调整每个色圈的颜色（原生取色器），并可一键恢复默认。
 * 与底部工具栏「高亮 / 强调色」的色圈交互完全一致。
 *
 * 色值统一存为 hex（#rrggbb），以兼容原生 <input type=color>。
 * 高亮作用于经文背景时按固定不透明度叠加（见 highlightBg）。
 *
 * v2：新增 verseNumber / title / background 三套色板（供配色方案里的元素颜色行使用），
 *     并把各套预设改为「差别明显」的默认色；highlight / accent 的用户自定义保留。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PaletteId = 'highlight' | 'accent' | 'scripture' | 'verseNumber' | 'title' | 'background';

/** 各色板默认色：同一色板内取差异明显的色相，且整体贴合「暖纸 / 墨色」书籍风格（避免荧光色） */
export const PALETTE_DEFAULTS: Record<PaletteId, string[]> = {
  // 五色高亮（作用于已选经文的背景）
  highlight: ['#f69e23', '#517aec', '#ec5170', '#2cba8f', '#9f68de'],
  // 强调色预设（选中经文的文字 / 节号颜色）
  accent: ['#d15239', '#e0a32e', '#2e7dd1', '#3db56b', '#9b59d0'],
  // 经文颜色预设（暖墨黑 / 靛蓝 / 赭红 / 松绿）
  scripture: ['#33302c', '#2f4d7a', '#96472f', '#356b58'],
  // 节号颜色预设（暖灰 / 靛蓝 / 赭石 / 青灰）
  verseNumber: ['#a39a8c', '#7d90b8', '#c2915f', '#7fa99a'],
  // 标题颜色预设（墨 / 藏蓝 / 酒红 / 墨绿）
  title: ['#201c18', '#1f3a5f', '#6e2f2a', '#24473b'],
  // 背景颜色预设（纸黄 / 冷白 / 墨黑 / 藏青）
  background: ['#F6EEDC', '#ECEDEF', '#141414', '#16222F'],
};

/** 色板中文名 */
export const PALETTE_NAMES: Record<PaletteId, string> = {
  highlight: '高亮色板',
  accent: '强调色板',
  scripture: '经文颜色色板',
  verseNumber: '节号颜色色板',
  title: '标题颜色色板',
  background: '背景颜色色板',
};

/** 高亮背景：基础色按 32% 不透明度叠加到透明（不改文字颜色） */
export const highlightBg = (color: string) => `color-mix(in srgb, ${color} 32%, transparent)`;

interface PaletteState {
  palettes: Record<PaletteId, string[]>;
  /** 调整某色板第 index 个色圈 */
  setPaletteColor: (id: PaletteId, index: number, color: string) => void;
  /** 恢复某色板默认 */
  resetPalette: (id: PaletteId) => void;
}

export const usePaletteStore = create<PaletteState>()(
  persist(
    (set) => ({
      palettes: { ...PALETTE_DEFAULTS },
      setPaletteColor: (id, index, color) =>
        set((s) => {
          const arr = [...(s.palettes[id] ?? PALETTE_DEFAULTS[id])];
          arr[index] = color;
          return { palettes: { ...s.palettes, [id]: arr } };
        }),
      resetPalette: (id) =>
        set((s) => ({ palettes: { ...s.palettes, [id]: [...PALETTE_DEFAULTS[id]] } })),
    }),
    {
      name: 'bible-palettes',
      version: 2,
      // v1 → v2：新增三套元素色板并更新默认色；高亮 / 强调色的用户自定义保留
      migrate: (persisted, version) => {
        const p = (persisted as Partial<PaletteState>) ?? {};
        const kept = (p.palettes ?? {}) as Partial<Record<PaletteId, string[]>>;
        if (version < 2) {
          return {
            palettes: {
              // 高亮 / 强调色保留用户已改的；其余四套（含新色板）采用新默认
              highlight: kept.highlight ?? PALETTE_DEFAULTS.highlight,
              accent: kept.accent ?? PALETTE_DEFAULTS.accent,
              scripture: [...PALETTE_DEFAULTS.scripture],
              verseNumber: [...PALETTE_DEFAULTS.verseNumber],
              title: [...PALETTE_DEFAULTS.title],
              background: [...PALETTE_DEFAULTS.background],
            },
          };
        }
        return {
          ...p,
          palettes: { ...PALETTE_DEFAULTS, ...kept },
        };
      },
    },
  ),
);
