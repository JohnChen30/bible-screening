/**
 * app-info.ts — 应用版本 / 外链常量
 *
 * 版本号：Tauri 环境读 getVersion()；浏览器预览回退到编译期注入的 __APP_VERSION__。
 * 外链：GitHub 仓库首页、GitHub Pages 网页版地址（由 vite build 的 define 注入仓库名）。
 */

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

declare const __APP_VERSION__: string | undefined;
declare const __REPO_URL__: string | undefined;
declare const __WEB_URL__: string | undefined;

/** 当前版本号（Tauri 桌面端 / 浏览器预览统一） */
export async function getAppVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      /* 退回编译期版本 */
    }
  }
  return __APP_VERSION__ ?? '0.0.0';
}

/** GitHub 仓库首页 */
export const GITHUB_REPO_URL = __REPO_URL__ ?? 'https://github.com/JohnChen30/bible-screening';

/** GitHub Pages 网页版地址 */
export const WEB_APP_URL = __WEB_URL__ ?? 'https://johnchen30.github.io/bible-screening/';

/** 在默认浏览器打开外链 */
export function openExternal(url: string): void {
  if (isTauri()) {
    void import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(url))
      .catch(() => {
        // 无 opener 插件时回退到 window.open
        window.open(url, '_blank', 'noopener,noreferrer');
      });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
