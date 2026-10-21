/** 主题（暗黑 / 浅色）——class 策略，持久化 localStorage */

export type Theme = 'light' | 'dark';

const KEY = 'bible-theme';

export function getTheme(): Theme {
  // 默认主题：浅色（用户保存过偏好时以保存值为准）
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  }
  return 'light';
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* 隐私模式忽略 */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** 启动时应用（避免闪白） */
export function initTheme(): void {
  setTheme(getTheme());
}
