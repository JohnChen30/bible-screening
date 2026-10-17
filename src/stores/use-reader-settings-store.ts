/**
 * use-reader-settings-store — 阅读区排版引擎（持久化）
 *
 * 所有视觉样式经 CSS 变量下发到阅读容器（--reader-*），与投影区设置完全分离。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Texture = 'none' | 'gradient' | 'grain';
export type TitleAlign = 'left' | 'center' | 'right';
export type ReaderFont = 'serif' | 'sans';
/** 排版模式：逐节（一节一块，节号在节首）/ 段落（多节成段，节号上标插入段内，首行缩进 2em） */
export type LayoutMode = 'verse' | 'paragraph';
/** 标题格式：约翰福音 第3章 / 创世记 1:1-10 */
export type TitleFormat = 'chapterCn' | 'reference';
import type { TitleMode } from '@/lib/types';
export type { TitleMode };

interface ReaderSettings {
  fontSize: number;
  bold: boolean;
  fontFamily: ReaderFont;
  lineHeight: number;
  margin: number; // 阅读区内边距（rem）
  layoutMode: LayoutMode; // 排版模式（逐节 / 段落）
  showVerseNumber: boolean;
  titleFormat: TitleFormat; // 标题格式（第X章 / 章:节区间）
  titleMode: TitleMode; // 标题显示方式（常驻顶部 / 随文滚动 / 不显示）
  textColor: string;
  verseNumberColor: string;
  titleColor: string;
  backgroundColor: string;
  texture: Texture;
  titleAlign: TitleAlign;
  /** 经文对齐方式（左 / 中 / 右；默认左） */
  verseAlign: TitleAlign;

  set: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  reset: () => void;
}

/**
 * 默认排版（用户反馈）：浅色纸质——纸黄背景 / 黑色经文 / 灰色节号 / 黑色标题，
 * 全左靠齐，段落排版，行距 1.5，衬线加粗，标题格式「书卷 章:节」（如 创世记 1:1）。
 */
const DEFAULTS: Omit<ReaderSettings, 'set' | 'reset'> = {
  fontSize: 18,
  bold: true,
  fontFamily: 'serif',
  lineHeight: 1.5,
  margin: 3,
  layoutMode: 'paragraph',
  showVerseNumber: true,
  // 用户反馈：默认标题改成「数字:数字」的 reference 格式（如 创世记 1:1）
  titleFormat: 'reference',
  // 默认「随文滚动」：标题在经文首行、随经文一起滚出画面，不再常驻顶部
  titleMode: 'inline',
  textColor: '#000000',
  verseNumberColor: 'hsl(0 0% 55%)',
  titleColor: '#000000',
  backgroundColor: '#F6EEDC',
  texture: 'none',
  titleAlign: 'left',
  verseAlign: 'left',
};

export const useReaderSettingsStore = create<ReaderSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<ReaderSettings>),
      reset: () => set(DEFAULTS),
    }),
    {
      name: 'bible-reader-settings',
      // v3：默认行距由 1 改为 1.5；v4：默认标题格式由 chapterCn 改为 reference（其余用户自定义保留）
      version: 4,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<ReaderSettings>;
        const next = { ...DEFAULTS, ...p };
        // 旧默认行距为 1：迁移时若仍是旧默认（或缺失）则改用新默认 1.5
        if (p.lineHeight === undefined || p.lineHeight === 1) next.lineHeight = DEFAULTS.lineHeight;
        // 旧默认标题格式为 chapterCn：若仍是旧默认（或缺失）则改用新默认 reference
        if (p.titleFormat === undefined || p.titleFormat === 'chapterCn') next.titleFormat = DEFAULTS.titleFormat;
        return next;
      },
    },
  ),
);
