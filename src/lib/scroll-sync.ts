import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * scroll-sync.ts — 主控台 → 投影窗口 的滚动比例同步（反馈4-一）
 *
 * 设计：
 *   - 比例制（Scroll Ratio = scrollTop / (scrollHeight - clientHeight)）：
 *     主控台与投影窗尺寸不同，像素值不可直接搬运；比例可跨容器像素级对齐；
 *   - 独立轻量通道（BroadcastChannel / Tauri Event，channel: bible-projection-scroll）：
 *     每帧只传 {index, ratio} 两个数字，不走 projection payload，
 *     避免投影窗每帧全量 React 重渲染；
 *   - rAF 节流：scroll 事件最多每帧上报一次，丝滑不卡顿；
 *   - 单一驱动源：只有主控台（scrollSync=true 的 PassageView）广播；
 *     投影窗只应用不广播，杜绝回声环路；
 *   - 虚拟列表友好：内容高度变化（rows 更换 / 动态测量）后按比例重应用，
 *     容器注册时双 rAF 重应用（等测量稳定）。
 */

type RatioHandler = (index: number, ratio: number) => void;

const CHANNEL = 'bible-projection-scroll';
const PING = '__scroll_sync_request__';

/** 是否运行在 Tauri 运行时内（v2 注入 __TAURI_INTERNALS__，不再依赖 withGlobalTauri 的 window.__TAURI__） */
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let bc: BroadcastChannel | null = null;
function getBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!bc) bc = new BroadcastChannel(CHANNEL);
  return bc;
}

/* ---------------- 容器注册表（每页面一份：index → 滚动容器） ---------------- */

const containers = new Map<number, HTMLElement>();
/** 最近一次已知比例（容器未就绪时先存，注册后重应用） */
const lastRatio = new Map<number, number>();

/** 注册 / 注销滚动容器（PassageView 挂载时调用；split 双栏 index 为 0/1） */
export function registerScrollContainer(index: number, el: HTMLElement | null): void {
  if (el) containers.set(index, el);
  else containers.delete(index);
  if (el && lastRatio.has(index)) {
    // 双 rAF：等虚拟列表完成一轮动态测量再按比例定位
    requestAnimationFrame(() => requestAnimationFrame(() => reapplyScrollRatio(index)));
  }
}

/** 读取容器当前比例 */
function ratioOf(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

/**
 * 重播源侧当前比例（内容高度变化但未触发 scroll 事件时调用，
 * 如换章后虚拟列表测量使 scrollHeight 变化——scrollTop 没动就不会有 scroll 事件）。
 */
export function publishCurrentRatio(index: number): void {
  const publish = sources.get(index);
  if (!publish) return;
  publish(true);
  scheduleSettleRepublish(index, publish);
}

/** 按比例瞬时定位（不用 smooth：同步必须当帧生效） */
export function reapplyScrollRatio(index: number): void {
  const el = containers.get(index);
  const r = lastRatio.get(index);
  if (!el || r == null) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  const target = r * max;
  if (Math.abs(el.scrollTop - target) >= 0.5) el.scrollTop = target;
}

/** 应用接收到的比例（投影窗侧） */
export function applyScrollRatio(index: number, ratio: number): void {
  lastRatio.set(index, ratio);
  noteApplied();
  reapplyScrollRatio(index);
}

/* ---------------- 广播源（主控台侧） ---------------- */

/** 已监听中的滚动源：index → 发布函数（force 重播 / 响应投影窗拉取） */
const sources = new Map<number, (force: boolean) => void>();
/** 测量稳定重播定时器（虚拟列表滚动后会继续测量，比例无声变化需补播） */
const settleTimers = new Map<number, number[]>();
let pingBound = false;

/** 安排测量稳定后的补播：真实高度替换初始估算后 scrollTop 不变、无 scroll 事件 */
function scheduleSettleRepublish(index: number, publish: (force: boolean) => void): void {
  for (const t of settleTimers.get(index) ?? []) clearTimeout(t);
  settleTimers.set(
    index,
    [80, 250, 600].map((d) => window.setTimeout(() => publish(false), d)),
  );
}

/** 监听容器滚动并 rAF 节流上报比例（主控台侧；返回取消监听函数） */
export function watchScroll(index: number, el: HTMLElement, onRatio: RatioHandler): () => void {
  let raf = 0;
  let last = -1;
  const publish = (force: boolean) => {
    raf = 0;
    const ratio = ratioOf(el);
    if (!force && Math.abs(ratio - last) < 0.0005) return; // 忽略亚像素抖动
    last = ratio;
    onRatio(index, ratio);
    if (!force) scheduleSettleRepublish(index, publish);
  };
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => publish(false));
  };
  el.addEventListener('scroll', onScroll, { passive: true });
  sources.set(index, publish);

  // 首个源注册时绑定拉取响应：投影窗（后开）请求当前比例 → 重播
  if (!pingBound) {
    pingBound = true;
    onScrollSyncRequest(() => {
      for (const republish of sources.values()) republish(true);
    });
  }

  return () => {
    el.removeEventListener('scroll', onScroll);
    if (raf) cancelAnimationFrame(raf);
    for (const t of settleTimers.get(index) ?? []) clearTimeout(t);
    settleTimers.delete(index);
    sources.delete(index);
  };
}

/* ---------------- 通道（BroadcastChannel / Tauri 双通道） ---------------- */

/** 广播滚动比例（主控台调用） */
export function publishScrollRatio(index: number, ratio: number): void {
  if (isTauri()) {
    void emit(CHANNEL, { index, ratio });
    return;
  }
  getBroadcast()?.postMessage({ index, ratio });
}

/** 订阅滚动比例（投影窗调用），返回取消订阅函数 */
export function onScrollRatio(handler: RatioHandler): () => void {
  if (isTauri()) {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    listen<{ index: number; ratio: number }>(CHANNEL, (event) => {
      handler(event.payload.index, event.payload.ratio);
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
    const data = e.data as { index?: number; ratio?: number } | null;
    if (!data || typeof data.index !== 'number' || typeof data.ratio !== 'number') return;
    handler(data.index, data.ratio);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

/** 投影窗拉取当前比例（通道不重放历史，主动请求） */
export function requestScrollSync(): void {
  if (isTauri()) {
    void emit(PING, {});
    return;
  }
  getBroadcast()?.postMessage({ [PING]: true });
}

/** 监听比例拉取请求（主控台注册），返回取消订阅函数 */
export function onScrollSyncRequest(handler: () => void): () => void {
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

/* ---------------- 镜像屏自动滚动防双重驱动 ---------------- */

let lastAppliedAt = 0;

/** 记录比例应用时间（applyScrollRatio 调用） */
function noteApplied(): void {
  lastAppliedAt = Date.now();
}

/**
 * 镜像屏（投影窗）是否正被主控台比例驱动。
 * 为 true 时投影窗的自动滚动应暂停自增——位置已由主控台比例决定，
 * 否则两边各滚各的会产生双重驱动漂移。主控台自身不应用比例，
 * 故永远返回 false，自动滚动不受影响。
 */
export function isMirrorDriven(): boolean {
  return Date.now() - lastAppliedAt < 250;
}
