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
 * 默认排版：浅色纸质——纸黄背景 / 黑色经文 / 灰色节号 / 黑色标题，
 * 全左靠齐，**逐节**排版，行距 1.5，**无衬线不加粗**，字号 20，边距 3，
 * 标题格式「书卷 章:节」（如 创世记 1:1）。
 */
const DEFAULTS: Omit<ReaderSettings, 'set' | 'reset'> = {
  fontSize: 20,
  bold: false,
  fontFamily: 'sans',
  lineHeight: 1.5,
  margin: 3,
  layoutMode: 'verse',
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
      // v3：默认行距 1 → 1.5；v4：默认标题格式 chapterCn → reference；
      // v5：默认改为「逐节 / 字号 20 / 不加粗 / 无衬线 / 边距 3」（其余用户自定义保留）
      version: 5,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<ReaderSettings>;
        const next = { ...DEFAULTS, ...p };
        // v3：旧默认行距为 1 → 新默认 1.5
        if (p.lineHeight === undefined || p.lineHeight === 1) next.lineHeight = DEFAULTS.lineHeight;
        // v4：旧默认标题格式 chapterCn → reference
        if (p.titleFormat === undefined || p.titleFormat === 'chapterCn') next.titleFormat = DEFAULTS.titleFormat;
        // v5：仅在仍是「旧默认值」时才切到新默认，避免覆盖用户自定义
        if (p.fontSize === undefined || p.fontSize === 18) next.fontSize = DEFAULTS.fontSize;
        if (p.bold === undefined || p.bold === true) next.bold = DEFAULTS.bold;
        if (p.fontFamily === undefined || p.fontFamily === 'serif') next.fontFamily = DEFAULTS.fontFamily;
        if (p.layoutMode === undefined || p.layoutMode === 'paragraph') next.layoutMode = DEFAULTS.layoutMode;
        if (p.margin === undefined) next.margin = DEFAULTS.margin;
        return next;
      },
    },
  ),
);
