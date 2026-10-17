/**
 * projection-channel.ts — 主控台 → 投影窗口 的状态同步通道
 *
 * 桌面端（Tauri v2）：@tauri-apps/api/event 的 emit / listen；
 * 浏览器预览：BroadcastChannel（同一 origin 的 /output 标签页实时接收）。
 *
 * 握手（requestProjectionSync / onSyncRequest）：
 *   BroadcastChannel 与 Tauri Event 都不重放历史消息。若投影窗口在
 *   主控台最后一次广播之后才打开（典型流程：点「投影」→ 点「打开投影窗口」），
 *   投影页会永远停在空白。因此投影页挂载 / 重新可见时主动请求一次当前状态，
 *   主控台收到请求后重发当前负载。
 */

import type { ProjectionPayload } from './types';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

type Handler = (payload: ProjectionPayload) => void;

const CHANNEL = 'bible-projection';
const PING = '__projection_sync_request__';

/** 是否运行在 Tauri 运行时内（v2 注入 __TAURI_INTERNALS__，不再依赖 withGlobalTauri 的 window.__TAURI__） */
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let bc: BroadcastChannel | null = null;
function getBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!bc) bc = new BroadcastChannel(CHANNEL);
  return bc;
}

/** 发布投影状态（主控台调用） */
export function publishProjection(payload: ProjectionPayload): void {
  if (isTauri()) {
    void emit(CHANNEL, payload);
    return;
  }
  getBroadcast()?.postMessage(payload);
}

/** 投影窗口请求一次当前状态（不重放历史，主动拉取） */
export function requestProjectionSync(): void {
  if (isTauri()) {
    void emit(PING, {});
    return;
  }
  getBroadcast()?.postMessage({ [PING]: true });
}

/** 订阅投影状态（投影窗口调用），返回取消订阅函数 */
export function subscribeProjection(handler: Handler): () => void {
  if (isTauri()) {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    listen<ProjectionPayload>(CHANNEL, (event) => {
      handler(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }
  const channel = getBroadcast();
  if (!channel) return () => {};
  const listener = (e: MessageEvent) => {
    const data = e.data as (ProjectionPayload & { [key: string]: unknown }) | null;
    if (!data || PING in data) return; // 忽略握手消息
    handler(data);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

/** 监听状态请求（主控台注册：收到后重发当前负载），返回取消订阅函数 */
export function onSyncRequest(handler: () => void): () => void {
  if (isTauri()) {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    listen<unknown>(PING, () => handler()).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }
  const channel = getBroadcast();
  if (!channel) return () => {};
  const listener = (e: MessageEvent) => {
    const data = e.data as Record<string, unknown> | null;
    if (data && PING in data) handler();
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
