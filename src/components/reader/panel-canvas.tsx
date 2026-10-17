/**
 * panel-canvas — 幻灯片式经文画布（阅读 / 预览 / 投影三屏共用）
 *
 * 比例（本次修复）：此前用 `aspect-ratio + width:100% + max-height:100%`，
 * 容器高度不足时高度被 max-height 夹住、宽度仍为 100% → **比例被压扁**
 * （设 4:3 实际出 1.443）。改为实测容器可用区后按 contain 算法自行计算
 * 像素尺寸（w = min(availW, availH × ratio)，h = w / ratio），任何容器下
 * 宽高比都严格等于设置值。
 *
 * 等比缩放（本次修复）：投影画面必须是预览画面的等比放大——比例一致、
 * 显示的内容范围一致，只有大小不同。做法是预览屏（基准屏）scale = 1，
 * 投影屏 scale = 自身画布宽 / 基准画布宽，字号 / 边距 / 标题 / 节号全部
 * 按 scale 走，于是两屏每行字数、行数、可见经文范围完全一致。
 *
 * 注意：画布内不允许任何绝对定位浮层控件——控件一律嵌入页面布局流
 * （见 ProjectionDock），从结构上保证绝不遮挡经文。
 */

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/lib/types';

/** 比例值表 */
const RATIO_NUM: Record<Exclude<AspectRatio, 'fill'>, number> = {
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '16:10': 16 / 10,
};

/** 画布缩放上下文：1 = 基准屏（预览），>1 = 投影屏等比放大 */
const CanvasScaleContext = createContext(1);
export const useCanvasScale = () => useContext(CanvasScaleContext);

interface PanelCanvasProps {
  ratio: AspectRatio;
  /** 画布背景（默认取面板固定配色 var(--reader-bg)） */
  bg?: string;
  /** 投影输出（反馈4-UI）：直角、无描边、无外边距，画布与屏幕边缘无缝衔接 */
  sharp?: boolean;
  /**
   * 基准画布宽度（预览屏实测值）。传入则本屏为「放大屏」：
   * scale = 自身画布宽 / baseWidth，排版整体等比放大；
   * 不传则本屏为「基准屏」，scale = 1，排版即设置面板上看到的原始尺寸。
   */
  baseWidth?: number;
  /**
   * 画布可用宽度的硬上限（CSS 像素，指 wrapper 的原始 clientWidth）。
   * 用途：主控台面板需「严格不随侧栏收起/展开、全屏/非全屏而缩放」——
   * 把上限钉在「侧栏展开时的阅读区宽度」，则收起侧栏或进入全屏只是让画布
   * 居中、两侧多出留白，画布本身尺寸与排版逐像素不变。投影窗（/output）
   * 不传，保持充满整屏。
   */
  maxWidth?: number;
  /** 画布尺寸变化回调（预览屏用它把基准宽度广播给投影屏） */
  onMeasure?: (w: number, h: number) => void;
  className?: string;
  children: ReactNode;
}

export function PanelCanvas({
  ratio,
  bg,
  sharp = false,
  baseWidth,
  maxWidth,
  onMeasure,
  className,
  children,
}: PanelCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const isFill = ratio === 'fill';
  const r = isFill ? null : RATIO_NUM[ratio];

  /** 实测可用区 → contain 计算画布像素尺寸（严格保持设置比例） */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      // 上限钉在「侧栏展开时的阅读区宽度」：先夹原始宽度，再扣内边距，
      // 保证收起侧栏 / 全屏时画布尺寸与展开态逐像素一致（只多留白、不缩放）。
      const capW = maxWidth && maxWidth > 0 ? maxWidth : Infinity;
      // fill 模式始终充满可用区（不参与上限约束）
      const rawW = r ? Math.min(el.clientWidth, capW) : el.clientWidth;
      const availW = rawW - padX;
      const availH = el.clientHeight - padY;
      if (availW <= 0 || availH <= 0) return;
      let w: number;
      let h: number;
      if (r) {
        // 先按宽度算，装不下就按高度反推宽度（两者取小），比例恒定
        w = Math.min(availW, availH * r);
        h = w / r;
      } else {
        w = availW;
        h = availH;
      }
      setBox((prev) =>
        prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r, maxWidth]);

  // 尺寸上报（预览屏 → 广播基准宽度）
  const measured = box ? `${box.w}x${box.h}` : '';
  useLayoutEffect(() => {
    if (!onMeasure || !box) return;
    onMeasure(box.w, box.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  const scale = baseWidth && baseWidth > 0 && box ? box.w / baseWidth : 1;

  return (
    <div
      ref={wrapRef}
      className={cn(
        'flex h-full w-full items-center justify-center overflow-hidden',
        !isFill && !sharp && 'p-3',
        className,
      )}
    >
      <div
        data-panel-canvas={ratio}
        data-canvas-w={box ? Math.round(box.w) : undefined}
        data-canvas-h={box ? Math.round(box.h) : undefined}
        data-canvas-scale={scale.toFixed(4)}
        className={cn(
          'relative overflow-hidden',
          sharp || isFill ? 'rounded-none' : 'rounded-2xl shadow-2xl ring-1 ring-border',
        )}
        style={
          {
            width: box?.w,
            height: box?.h,
            background: bg ?? 'var(--reader-bg)',
            // 供画布内所有排版 CSS 变量等比缩放（--reader-font-size / --reader-pad / 标题字号）
            '--canvas-scale': String(scale),
          } as CSSProperties
        }
      >
        <CanvasScaleContext.Provider value={scale}>{children}</CanvasScaleContext.Provider>
      </div>
    </div>
  );
}
