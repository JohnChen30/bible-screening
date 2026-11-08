/**
 * app-updater.ts — 应用自动更新（仅 Tauri 桌面端）
 *
 * 启动时后台静默检查 GitHub Releases 的 latest.json，发现新版本则通知 UI
 * 在右下角「设置」按钮左侧显示「更新」按钮；点击后下载并安装，随后重启应用。
 *
 * 浏览器预览（无 __TAURI_INTERNALS__）下所有方法均为 no-op，不报错。
 */

import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 检查结果：可用的更新对象（无更新 / 非 Tauri 环境返回 null） */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  try {
    return await check();
  } catch {
    // 网络失败 / 无端点等：静默忽略，不影响启动
    return null;
  }
}

/** 下载并安装更新，成功后重启应用 */
export async function installUpdate(update: Update | null): Promise<boolean> {
  if (!update || !isTauri()) return false;
  try {
    await update.downloadAndInstall();
    // 安装完成 → 重启应用以应用新版本
    await relaunch();
    return true;
  } catch {
    return false;
  }
}
