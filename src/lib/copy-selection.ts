/**
 * copy-selection — 复制「当前选中的经文」到剪贴板
 *
 * 供两处共用：底部「复制经文」按钮、全局快捷键 Ctrl/Cmd + C。
 * 复制成功后会清空强调色 + 文字选区（与按钮行为一致）。
 */

import { buildScriptureCopyText, type WholeVerse } from '@/lib/copy-scripture';
import { useBibleStore } from '@/stores/use-bible-store';
import { usePanelsStore } from '@/stores/use-panels-store';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';
import { useTextSelectionStore } from '@/stores/use-text-selection-store';

/** 写入剪贴板：现代异步 API 优先，失败退回 legacy textarea+execCommand */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 退回 legacy */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 单击选中的整节 → 整节选区。
 * 双语对照时传入面板的全部译本：同一节在每种语言各生成一份，复制时两版都带上。
 */
function toWholeVerses(keys: string[], versionCodes: string[]): WholeVerse[] {
  const out: WholeVerse[] = [];
  for (const k of keys) {
    const [b, c, v] = k.split(':').map(Number);
    if (!Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(v)) continue;
    for (const versionCode of versionCodes) out.push({ versionCode, bookId: b, chapter: c, verse: v });
  }
  return out;
}

/** 当前是否有可复制的经文选区（拖选文字 或 单击整节的强调色） */
export function hasCopyableSelection(): boolean {
  return useTextSelectionStore.getState().ranges.length > 0 || usePanelsStore.getState().highlightedVerses.length > 0;
}

/** 复制选中经文；成功清空选中态。返回是否成功 */
export async function copySelectedScripture(): Promise<boolean> {
  const ranges = useTextSelectionStore.getState().ranges;
  const accent = usePanelsStore.getState().highlightedVerses;
  if (!ranges.length && !accent.length) return false;

  const bs = useBibleStore.getState();
  const rs = useReaderSettingsStore.getState();
  // 双语对照：单击整节（强调色跨译本）时两版都复制；顺序 = 面板译本顺序（左 / 上在前）
  const copyCodes = bs.compareMode === 'single' ? bs.activeVersionIds.slice(0, 1) : bs.activeVersionIds;

  const text = buildScriptureCopyText(ranges, {
    books: bs.books,
    dataCache: bs.dataCache,
    showVerseNumber: rs.showVerseNumber,
    titleFormat: rs.titleFormat,
    versionName: (c) => bs.getVersionMeta(c)?.name ?? c,
    versionLanguage: (c) => bs.getVersionMeta(c)?.language ?? 'zh-Hans',
    versionOrder: copyCodes,
    wholeVerses: toWholeVerses(accent, copyCodes),
  });
  if (!text) return false;

  const ok = await copyTextToClipboard(text);
  if (ok) {
    usePanelsStore.getState().clearHighlightedVerses();
    window.getSelection()?.removeAllRanges();
    useTextSelectionStore.getState().clear();
  }
  return ok;
}
