/**
 * bible-api.ts — 数据访问层（双适配）
 *
 * 桌面端（Tauri v2）：经 @tauri-apps/api/core 的 invoke 调用 Rust 命令
 *   `bible_load_version`（第三阶段在 src-tauri 实现，直连 SQLite）；
 * 浏览器预览：fetch public/data/<code>.json 快照（由 export-snapshot.mjs 生成）。
 *
 * 上层 Store 只依赖本模块，不关心运行环境。
 * Tauri 检测改用 window.__TAURI_INTERNALS__（v2 内置全局），
 * 不再依赖 withGlobalTauri 注入的 window.__TAURI__。
 */

import { invoke } from '@tauri-apps/api/core';
import type { BookMeta, VersionData, VersionMeta } from './types';

/** 是否运行在 Tauri 运行时内（v2 注入 __TAURI_INTERNALS__） */
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 调用 Tauri 命令（仅桌面端可用） */
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}

/** 译本元数据列表 */
export async function fetchVersions(): Promise<VersionMeta[]> {
  if (isTauri()) return tauriInvoke<VersionMeta[]>('bible_versions', {});
  const res = await fetch(`${import.meta.env.BASE_URL}data/versions.json`);
  if (!res.ok) throw new Error(`versions.json 加载失败: ${res.status}`);
  return res.json();
}

/** 66 卷书卷表 */
export async function fetchBooks(): Promise<BookMeta[]> {
  if (isTauri()) return tauriInvoke<BookMeta[]>('bible_books', {});
  const res = await fetch(`${import.meta.env.BASE_URL}data/books.json`);
  if (!res.ok) throw new Error(`books.json 加载失败: ${res.status}`);
  return res.json();
}

/** 加载某译本全量数据（带内存缓存） */
const dataCache = new Map<string, VersionData>();

export async function loadVersionData(code: string): Promise<VersionData> {
  const cached = dataCache.get(code);
  if (cached) return cached;

  let data: VersionData;
  if (isTauri()) {
    data = await tauriInvoke<VersionData>('bible_load_version', { code });
  } else {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${code}.json`);
    if (!res.ok) throw new Error(`${code}.json 加载失败: ${res.status}`);
    data = await res.json();
  }
  dataCache.set(code, data);
  return data;
}

/** 某书卷的章数（用于 Miller Columns 章节列） */
export function chapterCount(data: VersionData, osis: string): number {
  const book = data?.[osis];
  if (!book) return 0;
  return Object.keys(book).length;
}

/** 某章的节数（用于 Miller Columns 起始/结束节列） */
export function verseCount(data: VersionData, osis: string, chapter: number): number {
  const ch = data?.[osis]?.[String(chapter)];
  if (!ch) return 0;
  return Object.keys(ch).length;
}
