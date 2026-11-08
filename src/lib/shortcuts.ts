/**
 * shortcuts.ts — 快捷键定义 / 规范化 / 匹配
 *
 * 所有可配置快捷键集中在此：
 *   - SHORTCUT_ACTIONS：动作清单（id + 显示名 + 默认键）；
 *   - eventToShortcut：把 KeyboardEvent 规范成可比较的字符串（如 "Ctrl+T" / "F12" / "1"）；
 *   - matchesShortcut：判断某次按键是否命中某个绑定；
 *   - formatShortcut：绑定字符串 → 展示文本。
 *
 * 约定：绑定字符串用「修饰键(顺序 Ctrl>Alt>Shift>Meta)+主键」以 `+` 连接，
 * 主键单字符统一大写（`e.key` 的字母 / 数字 / F1-F12 / 功能键原名）。
 */

export type ShortcutActionId =
  | 'toggleProjection'
  | 'blackout'
  | 'clearScreen'
  | 'stopProjection'
  | 'newPanel'
  | 'closePanel'
  | 'scroll1'
  | 'scroll2'
  | 'scroll3'
  | 'scroll4'
  | 'scroll5';

export interface ShortcutActionDef {
  id: ShortcutActionId;
  label: string;
  defaultKeys: string;
}

export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  { id: 'toggleProjection', label: '切换投影 / 退出', defaultKeys: 'F12' },
  { id: 'blackout', label: '黑屏', defaultKeys: 'B' },
  { id: 'clearScreen', label: '清屏', defaultKeys: 'C' },
  { id: 'stopProjection', label: '退出投影', defaultKeys: 'Escape' },
  { id: 'newPanel', label: '新建面板', defaultKeys: 'Ctrl+T' },
  { id: 'closePanel', label: '关闭当前面板', defaultKeys: 'Ctrl+W' },
  { id: 'scroll1', label: '自动滚动 1 档', defaultKeys: '1' },
  { id: 'scroll2', label: '自动滚动 2 档', defaultKeys: '2' },
  { id: 'scroll3', label: '自动滚动 3 档', defaultKeys: '3' },
  { id: 'scroll4', label: '自动滚动 4 档', defaultKeys: '4' },
  { id: 'scroll5', label: '自动滚动 5 档', defaultKeys: '5' },
];

export const DEFAULT_BINDINGS: Record<ShortcutActionId, string> = Object.fromEntries(
  SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultKeys]),
) as Record<ShortcutActionId, string>;

/** 纯修饰键（不应单独构成快捷键） */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Tab']);

/** 把一次按键规范成可比较字符串；纯修饰键返回 null */
export function eventToShortcut(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const key = e.key;
  if (MODIFIER_KEYS.has(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  // 主键：单字符（字母/数字/符号）统一大写，功能键保留原名
  const main = key.length === 1 ? key.toUpperCase() : key;
  parts.push(main);
  return parts.join('+');
}

/** 判断一次按键是否命中某绑定 */
export function matchesShortcut(e: KeyboardEvent | React.KeyboardEvent, binding: string): boolean {
  return eventToShortcut(e) === binding;
}

/** 绑定字符串 → 展示文本（"Ctrl+T" → "Ctrl + T"） */
export function formatShortcut(binding: string): string {
  return binding.replace(/\+/g, ' + ');
}
