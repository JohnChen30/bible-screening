/** 全局共享类型 */

export interface VersionMeta {
  code: string;
  name: string;
  nameEn: string;
  language: string;
  godTerm: string;
}

/** 强调色默认值（与界面主强调色赤褐一致，可在工具栏自由覆盖） */
export const DEFAULT_SELECT_COLOR = '#d15239';

export interface BookMeta {
  id: number;
  osis: string;
  nameCn: string;
  nameCnTw: string;
  nameEn: string;
  abbr: string;
  testament: 'old' | 'new';
}

/** osis -> chapter -> verse -> text */
export type VersionData = Record<string, Record<string, Record<string, string>>>;

/** Miller Columns 的选择结果；null 表示该级未选 */
export interface Selection {
  bookId: number | null;
  chapter: number | null;
  startVerse: number | null;
  endVerse: number | null;
}

export type CompareMode = 'single' | 'verse' | 'split';

/**
 * 标题显示方式（用户反馈：标题不要一直常驻在画面上方）：
 *   pinned 常驻顶部（固定在滚动区之外，经文滚动时标题不动）
 *   inline 随文滚动（标题在滚动区内首行，随经文一起滚出画面）
 *   hidden 不显示（完全不渲染，不占空白）
 */
export type TitleMode = 'pinned' | 'inline' | 'hidden';

/** 面板宽高比预设（阅读 / 投影通用；fill = 铺满容器） */
export type AspectRatio = 'fill' | '4:3' | '16:9' | '16:10';

/** 单节高亮（作用于选定文本区间） */
export interface TextHighlight {
  id: string;
  start: number;
  end: number;
  /** CSS 颜色；null = 无背景色（仅下划线） */
  color: string | null;
  underline: boolean;
}

/** 投影负载（经 BroadcastChannel / Tauri Event 同步到 /output） */
export interface ProjectionPayload {
  /** 是否正在投影 */
  isProjecting: boolean;
  /** 当前选区（投影内容 = 阅读区当前视图，整页照搬） */
  selection: Selection;
  /** 参与投影的译本（按对照顺序） */
  versionCodes: string[];
  /** 对照模式 */
  compareMode: CompareMode;
  /** 跟读游标（当前节；点击经文即定位） */
  cursorVerse: number | null;
  blackout: boolean;
  cleared: boolean;
  /** 神/上帝称呼互换 */
  godTermSwap: boolean;
  /** 展示用名称 */
  bookName: string;
  versionNames: string[];
  /** 面板宽高比（阅读 / 投影通用） */
  aspectRatio: AspectRatio;
  /**
   * 基准画布宽度（主控台预览画布实测宽度，像素）。
   * 投影屏据此等比放大：scale = 自身画布宽 / baseWidth，
   * 保证投影画面 = 预览画面的等比放大（比例一致、显示内容范围一致，只有大小不同）。
   */
  baseWidth: number;
  /** 自动滚动档位（0 = 停止；投影窗口同步执行） */
  autoScroll: number;
  /** 高亮快照（key → 区间列表；投影窗口照搬渲染，保证所见即所得） */
  highlights: Record<string, TextHighlight[]>;
  /** 点击经文高亮的节 ID 集合（复合键 bookId:chapter:verse；可多节同时强调） */
  highlightedVerses: string[];
  /** 强调色（选中经文的文字/节号颜色）：可在工具栏自由设置，三屏同步 */
  selectColor: string;
  /** 当前活动面板 id：高亮按面板隔离，投影窗据此写入对应桶（保证三屏一致） */
  activePanelId: string | null;
  /**
   * 当前投影内容经文段列表（= 活动面板的 passages；无活动面板时由全局选区退化而来）。
   * 三屏（阅读 / 预览 / 投影）均据此遍历渲染，保证多段追加后内容完全一致。
   */
  passages: PassageItem[];
  /**
   * 统一排版快照：阅读区 / 预览区 / 投影输出三屏共用同一份值，
   * 保证字体大小、行高、颜色、边距完全一致（所见即所得）。
   */
  typography: TypographySnapshot | null;
}

/** 排版快照（与 PassageView 的 PassageTypography 结构一致） */
export interface TypographySnapshot {
  fontSize: number;
  lineHeight: number;
  bold: boolean;
  fontFamily: 'serif' | 'sans';
  margin: number;
  /** 排版模式：逐节 / 段落 */
  layoutMode: 'verse' | 'paragraph';
  showVerseNumber: boolean;
  /** 标题格式：第X章 / 章:节区间 */
  titleFormat: 'chapterCn' | 'reference';
  /** 标题显示方式：常驻顶部 / 随文滚动 / 不显示 */
  titleMode: TitleMode;
  textColor: string;
  verseNumberColor: string;
  titleColor: string;
  backgroundColor: string;
  texture: 'none' | 'gradient' | 'grain';
  titleAlign: 'left' | 'center' | 'right';
  /** 经文对齐方式（左 / 中 / 右；默认左） */
  verseAlign: 'left' | 'center' | 'right';
}

/**
 * 一段经文（面板内容的最小单元）：某个译本下的一书一卷区间。
 * 面板由多段 PassageItem 组成（经「添加到后续」逐步追加）。
 */
export interface PassageItem {
  bookId: number;
  chapter: number;
  startVerse: number | null;
  endVerse: number | null;
}

/** 多面板：一组藏好的经文段（随点随投），面板内容 = passages 遍历渲染 */
/**
 * 固定「圣经」面板 id。
 * 该面板始终存在、不可关闭；其高亮 / 下划线单独持久化（见 use-highlights-store），
 * 只要用户没有手动清除就一直保留（重启软件也在）。其它面板仍是临时标注。
 */
export const BIBLE_PANEL_ID = 'bible';

export interface Panel {
  id: string;
  name: string;
  /** 译本（保留字段，渲染实际以激活译本为准） */
  versionCode?: string;
  /** 面板经文段列表（按追加顺序渲染，段间加淡分割线） */
  passages: PassageItem[];
}

/** Selection → PassageItem */
export const toPassage = (s: Selection): PassageItem => ({
  bookId: s.bookId ?? 0,
  chapter: s.chapter ?? 1,
  startVerse: s.startVerse,
  endVerse: s.endVerse,
});

/** PassageItem → Selection */
export const toSelection = (p: PassageItem): Selection => ({
  bookId: p.bookId,
  chapter: p.chapter,
  startVerse: p.startVerse,
  endVerse: p.endVerse,
});

/**
 * 兼容旧版持久化数据（面板曾用 bookId/chapter/startVerse/endVerse 单段存储）。
 * 老面板无 passages 字段时，由其遗留单段字段重建 passages。
 */
export const normalizePanel = (p: Panel): Panel => {
  if (Array.isArray(p.passages) && p.passages.length) return p;
  const legacy = p as unknown as { bookId?: number; chapter?: number; startVerse?: number | null; endVerse?: number | null };
  if (legacy.bookId != null) {
    return {
      ...p,
      passages: [{ bookId: legacy.bookId, chapter: legacy.chapter ?? 1, startVerse: legacy.startVerse ?? null, endVerse: legacy.endVerse ?? null }],
    };
  }
  return { ...p, passages: [] };
};

/** 单段经文引用文案：创世记 1 / 约翰福音 3:16-18 / 创世记 1:3 */
export const formatPassageRef = (bookNameCn: string, p: PassageItem): string => {
  if (p.startVerse == null) return `${bookNameCn} ${p.chapter}`;
  if (p.endVerse != null && p.endVerse !== p.startVerse) return `${bookNameCn} ${p.chapter}:${p.startVerse}-${p.endVerse}`;
  return `${bookNameCn} ${p.chapter}:${p.startVerse}`;
};
