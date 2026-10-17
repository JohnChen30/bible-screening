/**
 * output-page — 投影输出窗口（/output）
 *
 * 无边框、全屏。三屏一致（反馈3）：与主控台阅读区 / 预览区渲染同一
 * PassageLayout 组件、同一份排版快照（payload.typography，reader settings
 * 广播而来），标题 / 字号 / 行高 / 颜色 / 边距逐项相同，所见即所得。
 * 滚动完全同步（反馈4-一）：主控台阅读区手动滑动 / 自动滚动时，滚动比例
 * 经独立轻量通道每帧广播，本页瞬时按比例应用，像素级跟随。
 * 跟读游标变化时平滑滚动跟随；自动滚动档位由主控台同步。
 * 状态经 projection-channel 同步（Tauri Event / BroadcastChannel），
 * 挂载与重新可见时主动请求一次当前状态（通道不重放历史消息）。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { subscribeProjection, requestProjectionSync } from '@/lib/projection-channel';
import { applyScrollRatio, onScrollRatio, requestScrollSync } from '@/lib/scroll-sync';
import { useBibleStore } from '@/stores/use-bible-store';
import { useHighlightsStore } from '@/stores/use-highlights-store';
import { PassageLayout } from '../reader/passage-layout';
import type { PassageTypography } from '../reader/passage-view';
import { PanelCanvas } from '../reader/panel-canvas';
import type { ProjectionPayload } from '@/lib/types';

const IDLE: ProjectionPayload = {
  isProjecting: false,
  selection: { bookId: null, chapter: null, startVerse: null, endVerse: null },
  versionCodes: [],
  compareMode: 'single',
  cursorVerse: null,
  blackout: false,
  cleared: false,
  godTermSwap: false,
  bookName: '',
  versionNames: [],
  aspectRatio: '16:9',
  baseWidth: 0,
  autoScroll: 0,
  highlights: {},
  highlightedVerses: [],
  selectColor: '#d15239',
  activePanelId: null,
  passages: [],
  typography: null,
};

/** 投影面板默认底色（与阅读面板固定配色一致） */
const PANEL_BG = '#121212';

export function OutputPage() {
  const [payload, setPayload] = useState<ProjectionPayload>(IDLE);
  const rootRef = useRef<HTMLDivElement>(null);

  // 投影页加载一次数据（书卷表 / 译本数据缓存）
  useEffect(() => {
    if (useBibleStore.getState().status !== 'idle') return;
    void useBibleStore.getState().loadBible().then(() => requestProjectionSync());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => subscribeProjection(setPayload), []);

  // 挂载 / 重新可见 → 主动拉取主控台当前状态（BroadcastChannel 不重放历史）
  useEffect(() => {
    requestProjectionSync();
    requestScrollSync();
    const onVisible = () => {
      if (!document.hidden) {
        requestProjectionSync();
        requestScrollSync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 滚动比例同步（反馈4-一）：主控台每帧广播比例 → 投影窗瞬时应用，像素级跟随
  useEffect(() => onScrollRatio(applyScrollRatio), []);

  // 收到新译本列表时按需加载
  useEffect(() => {
    void Promise.all(payload.versionCodes.map((c) => useBibleStore.getState().ensureVersion(c)));
  }, [payload.versionCodes.join(',')]);

  // 高亮快照 hydration（主控台只广播当前活动面板的高亮；
  // 必须写入与主控台相同的 panelId 桶，否则投影窗读到空桶 → 三屏不一致）
  useEffect(() => {
    useHighlightsStore.getState().replaceAll(payload.activePanelId, payload.highlights);
  }, [payload.highlights, payload.activePanelId]);

  const typography = payload.typography;
  const panelBg = typography?.backgroundColor || PANEL_BG;
  // 清屏：只清内容、保留画布底色（与黑屏区分：黑屏是纯黑遮挡，清屏是同色空画面）
  const isCleared = payload.isProjecting && payload.cleared && !!typography;
  const showPassage = payload.isProjecting && !payload.blackout && !payload.cleared && !!typography;

  return (
    <div
      ref={rootRef}
      className="projection-output relative h-dvh w-screen overflow-hidden"
      style={{ background: payload.blackout ? '#000000' : panelBg }}
    >
      {/* 去掉 mode="wait"：清屏时经文层（z-10）直接在画布底色层（z-0 / 根底色）之上
          渐隐，根底色即画布色而非纯黑 → 不再闪黑屏，经文平滑渐变消失 */}
      <AnimatePresence>
        {payload.blackout ? (
          <motion.div
            key="blackout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 bg-black"
          />
        ) : isCleared ? (
          /* 清屏：保留用户设定的画布底色，只是不显示经文内容（画布色层在经文层之下） */
          <motion.div
            key="cleared"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-0"
            style={{ background: panelBg }}
            data-cleared
          />
        ) : !showPassage ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // 自带深色底：待机文案是浅色的，若落在浅色面板底色（纸黄）上会看不见
            className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 bg-neutral-950 text-white/40"
          >
            <BookOpen className="h-8 w-8" strokeWidth={1.2} />
            <p className="text-sm">等待主控台开始投影…</p>
          </motion.div>
        ) : (
          <motion.div
            key="passage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-10"
            style={{ background: '#000000' }}
          >
            {/* 投影留白（画布之外）用中性黑信箱边：与画布底色区分，使「面板比例」
                设置可见——4:3 等非铺满比例下画布居中一块、两侧留黑边，与预览同比例 */}
            {/* 整页照搬：与主控台阅读 / 预览区同一版面调度组件、同一排版快照 */}
            {/* baseWidth：主控台预览画布宽度 → 本屏整体等比放大，
                两屏比例一致、显示内容范围一致，只有大小不同 */}
            <PanelCanvas ratio={payload.aspectRatio} bg={panelBg} sharp baseWidth={payload.baseWidth}>
              <PassageLayoutMirror payload={payload} typography={typography!} />
            </PanelCanvas>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 全屏切换按钮已移除：投影画面只保留经文内容，不显示右下角控件 */}
    </div>
  );
}

/**
 * 镜像层：直接把 payload 的经文段列表 / 译本 / 排版快照照搬渲染。
 * 三屏（阅读 / 预览 / 投影）渲染同一 passages 列表，多段追加后内容完全一致、
 * 滚动同步照常。神/上帝称呼互换仍经 store 同步（不影响内容来源）。
 */
function PassageLayoutMirror({ payload, typography }: { payload: ProjectionPayload; typography: PassageTypography }) {
  const setGodTermSwap = useBibleStore((s) => s.setGodTermSwap);

  useEffect(() => {
    setGodTermSwap(payload.godTermSwap);
  }, [payload.godTermSwap, setGodTermSwap]);

  return (
    <PassageLayout
      passages={payload.passages}
      versionCodes={payload.versionCodes}
      mode={payload.compareMode}
      typography={typography}
      interactive={false}
      highlightedVerses={payload.highlightedVerses}
      selectColor={payload.selectColor}
      panelId={payload.activePanelId}
      scrollToVerse={payload.cursorVerse}
      autoScroll={payload.autoScroll}
      className="h-full"
    />
  );
}
