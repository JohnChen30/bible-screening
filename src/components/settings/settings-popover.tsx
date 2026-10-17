/**
 * settings-popover — 排版设置悬浮小窗（macOS 控制中心风格）
 *
 * 自包含组件：顶栏「排版设置」按钮即 PopoverTrigger，点击后在按钮下方弹出，
 * 不遮挡全屏、无抽屉动画；点外部 / Esc 关闭。
 *
 * 三屏一致（反馈3）：排版三屏通用——阅读区 / 投影预览区 / 投影输出（/output）
 * 渲染同一组件、同一份排版值。因此设置只有一套「排版」面板：排版、颜色与质感、
 * 标题位置、面板比例、面板启动行为。用户反馈已去掉「投影」分区，
 * 「默认自动滚动速度」也随之移除（自动滚动改为投影中按需手动开启）。
 */

import { useEffect, useState } from 'react';
import { Check, MoreHorizontal, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useReaderSettingsStore } from '@/stores/use-reader-settings-store';
import { useColorSchemesStore, type ColorScheme } from '@/stores/use-color-schemes-store';
import { useProjectionSettingsStore, type PanelStartup } from '@/stores/use-projection-settings-store';
import { availableMonitors, currentMonitor, primaryMonitor, type Monitor } from '@tauri-apps/api/window';
import { useCanvasSettingsStore } from '@/stores/use-canvas-settings-store';
import { useBibleStore } from '@/stores/use-bible-store';
import type { AspectRatio } from '@/lib/types';
import type { Texture, TitleAlign, TitleMode } from '@/stores/use-reader-settings-store';
const TEXTURES: { value: Texture; label: string }[] = [
  { value: 'none', label: '纯净' },
  { value: 'gradient', label: '纸纹渐变' },
  { value: 'grain', label: '细噪点' },
];

const RATIOS: { value: AspectRatio; label: string }[] = [
  { value: 'fill', label: '铺满' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '16:10', label: '16:10' },
];

/**
 * 横向置顶目录（用户反馈）：设置项按类别收进目录，点目录即切换类别，
 * 提升检索速度；记住上次停留的类别，重开面板时回到同一目录。
 * 目录划分（用户反馈）：字体单独成目录；标题相关并入「排版」；比例归入「面板」。
 */
const SETTINGS_TABS = [
  { id: 'typography', label: '排版' },
  { id: 'font', label: '字体' },
  { id: 'color', label: '颜色' },
  { id: 'panel', label: '面板' },
] as const;
type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];
const TAB_STORAGE_KEY = 'bible-settings-tab';
const isTabId = (v: unknown): v is SettingsTabId =>
  typeof v === 'string' && SETTINGS_TABS.some((t) => t.id === v);

export function SettingsPopover() {
  const [open, setOpen] = useState(false);
  // 记住上次停留的设置目录（localStorage），重开面板时回到同一目录
  const [tab, setTab] = useState<SettingsTabId>(() => {
    if (typeof localStorage === 'undefined') return 'typography';
    const v = localStorage.getItem(TAB_STORAGE_KEY);
    return isTabId(v) ? v : 'typography';
  });
  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* 忽略隐私模式等写入失败 */
    }
  }, [tab]);
  const reader = useReaderSettingsStore();
  const projection = useProjectionSettingsStore();
  const aspectRatio = useCanvasSettingsStore((s) => s.aspectRatio);
  const setAspectRatio = useCanvasSettingsStore((s) => s.setAspectRatio);
  const godTermSwap = useBibleStore((s) => s.godTermSwap);
  const setGodTermSwap = useBibleStore((s) => s.setGodTermSwap);

  // 整套配色方案（浅色 / 深色 / 自定义…）
  const schemes = useColorSchemesStore((s) => s.schemes);
  const activeSchemeId = useColorSchemesStore((s) => s.activeSchemeId);
  const applyScheme = useColorSchemesStore((s) => s.applyScheme);
  const addScheme = useColorSchemesStore((s) => s.addScheme);
  const duplicateScheme = useColorSchemesStore((s) => s.duplicateScheme);
  const removeScheme = useColorSchemesStore((s) => s.removeScheme);
  const renameScheme = useColorSchemesStore((s) => s.renameScheme);
  const updateSchemeColor = useColorSchemesStore((s) => s.updateColor);
  /** 改动元素颜色：既写入 reader settings（三屏生效），也写回当前方案（自由更改并保存） */
  const setColor = (key: 'textColor' | 'verseNumberColor' | 'titleColor' | 'backgroundColor', value: string) => {
    reader.set(key, value);
    updateSchemeColor(key, value);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* 触发器：顶栏「排版设置」按钮（锚点正确，小窗在其下方弹出） */}
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" aria-label="排版设置" title="排版设置">
          <Settings2 className="h-3.5 w-3.5" />
          排版
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="glass-strong scrollbar-thin max-h-[min(76vh,36rem)] w-[23rem] overflow-y-auto rounded-[12px] p-0"
      >
        {/* 标题栏 + 横向置顶目录（sticky，滚动时始终可见） */}
        <div className="sticky top-0 z-10 border-b border-border backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] font-semibold tracking-wide">排版设置</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭设置"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* 横向目录：设置项按类别归入，点击切换 */}
          <div className="flex gap-1 px-3 pb-2.5" role="tablist" aria-label="设置目录">
            {SETTINGS_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                data-settings-tab={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'h-7 flex-1 rounded-[6px] text-xs font-medium transition-all focus-ring',
                  tab === t.id
                    ? 'bg-card text-foreground shadow-[0_1px_3px_hsl(var(--foreground)/0.12),0_0_0_0.5px_hsl(var(--foreground)/0.06)]'
                    : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 当前目录下的设置项。用户反馈：已去掉「投影」分区，此处为唯一设置面板。 */}
        <div className="space-y-3.5 px-4 pb-4 pt-4">
          {tab === 'typography' && (
            <>
              <p className="rounded-xl bg-accent/[0.07] px-3 py-2 text-[11px] leading-relaxed text-accent">
                此排版同时应用于阅读区与投影（所见即所得）：三屏同一组件、同一套字号 / 行距 / 颜色 / 边距。
              </p>

            <Section title="用词与排版">
              <SegRow
                label="排版模式"
                value={reader.layoutMode}
                options={[
                  { value: 'verse', label: '逐节' },
                  { value: 'paragraph', label: '段落' },
                ]}
                onChange={(v) => reader.set('layoutMode', v)}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ToggleRow label="神 / 上帝互换" checked={godTermSwap} onChange={setGodTermSwap} />
                <ToggleRow label="显示节号" checked={reader.showVerseNumber} onChange={(v) => reader.set('showVerseNumber', v)} />
              </div>
              <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                逐节：一节一行，节号在节首；段落：多节成段，节号上标插入段内，首行缩进 2 字符。
              </p>
            </Section>

            {/* 行距 / 边距（用户反馈：由「字体」移入「排版」） */}
            <Section title="行距与边距">
              <div className="space-y-3">
                <Row label="行距" value={reader.lineHeight.toFixed(1)}>
                  <Slider
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={[reader.lineHeight]}
                    onValueChange={([v]) => reader.set('lineHeight', v)}
                  />
                </Row>
                <Row label="边距" value={`${reader.margin}rem`}>
                  <Slider
                    min={1}
                    max={6}
                    step={0.5}
                    value={[reader.margin]}
                    onValueChange={([v]) => reader.set('margin', v)}
                  />
                </Row>
              </div>
            </Section>

            {/* 标题相关（用户反馈：由「标题」目录并入「排版」；分组名改为「标题和对齐」） */}
            <Section title="标题和对齐">
              <SegRow
                label="标题显示方式"
                value={reader.titleMode ?? 'inline'}
                options={[
                  { value: 'pinned' as TitleMode, label: '常驻顶部' },
                  { value: 'inline' as TitleMode, label: '随文滚动' },
                  { value: 'hidden' as TitleMode, label: '不显示' },
                ]}
                onChange={(v) => reader.set('titleMode', v)}
              />
              <div className="pt-1">
                <SegRow
                  label="标题对齐"
                  value={reader.titleAlign}
                  options={[
                    { value: 'left', label: '左' },
                    { value: 'center', label: '中' },
                    { value: 'right', label: '右' },
                  ]}
                  onChange={(v) => reader.set('titleAlign', v as TitleAlign)}
                />
              </div>
              <div className="pt-1">
                <SegRow
                  label="经文对齐"
                  value={reader.verseAlign}
                  options={[
                    { value: 'left', label: '左' },
                    { value: 'center', label: '中' },
                    { value: 'right', label: '右' },
                  ]}
                  onChange={(v) => reader.set('verseAlign', v as TitleAlign)}
                />
              </div>
              <div className="pt-1">
                {/* 按钮直接展示两种格式的实际效果 */}
                <SegRow
                  label="标题格式"
                  value={reader.titleFormat}
                  options={[
                    { value: 'chapterCn', label: '第1章 1-10节' },
                    { value: 'reference', label: '1:1-10' },
                  ]}
                  onChange={(v) => reader.set('titleFormat', v)}
                />
              </div>
            </Section>
            </>
          )}

          {/* 字体（用户反馈：单独成一个目录） */}
          {tab === 'font' && (
            <Section title="字体与字号">
              <SegRow
                label="正文字体"
                value={reader.fontFamily}
                options={[
                  { value: 'serif', label: '衬线（经文）' },
                  { value: 'sans', label: '无衬线' },
                ]}
                onChange={(v) => reader.set('fontFamily', v)}
              />
              {/* 加粗（用户反馈：由「排版」移入「字体」） */}
              <ToggleRow label="加粗经文" checked={reader.bold} onChange={(v) => reader.set('bold', v)} />
              <div className="space-y-3 pt-1">
                <Row label="字号" value={`${reader.fontSize}px`}>
                  <Slider
                    min={14}
                    max={28}
                    step={1}
                    value={[reader.fontSize]}
                    onValueChange={([v]) => reader.set('fontSize', v)}
                  />
                </Row>
              </div>
            </Section>
          )}

          {tab === 'color' && (
            <>
              {/* 配色方案：带实时预览的卡片。点卡片即套用；当前方案就地展开，直接改各元素颜色 */}
              <Section title="配色方案">
                <div className="space-y-2">
                  {schemes.map((s) => (
                    <SchemeCard
                      key={s.id}
                      scheme={s}
                      active={s.id === activeSchemeId}
                      onApply={() => applyScheme(s.id)}
                      onDuplicate={() => duplicateScheme(s.id)}
                      onRemove={() => removeScheme(s.id)}
                      onRename={(name) => renameScheme(s.id, name)}
                      textColor={reader.textColor}
                      verseNumberColor={reader.verseNumberColor}
                      titleColor={reader.titleColor}
                      backgroundColor={reader.backgroundColor}
                      onColor={setColor}
                    />
                  ))}
                </div>
                <button
                  onClick={addScheme}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-foreground/15 py-2 text-[12px] text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent focus-ring"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建配色方案
                </button>
                <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                  点方案卡片即套用到全文（三屏同步）；当前方案会就地展开，直接改各元素颜色即自动保存。
                </p>
              </Section>

              <Section title="质感">
                <SegRow label="纸张质感" value={reader.texture} options={TEXTURES} onChange={(v) => reader.set('texture', v)} />
              </Section>
            </>
          )}

          {tab === 'panel' && (
            <>
            <Section title="面板">
              {/* 面板比例（用户反馈：由「标题」目录移入「面板」） */}
              <SegRow label="面板比例（阅读 / 投影通用）" value={aspectRatio} options={RATIOS} onChange={setAspectRatio} />
              <div className="pt-1" />
              <SegRow
                label="启动时"
                value={projection.panelStartup}
                options={[
                  { value: 'new' as PanelStartup, label: '打开新面板' },
                  { value: 'keep' as PanelStartup, label: '保留原面板' },
                ]}
                onChange={(v) => projection.set('panelStartup', v)}
              />
              <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                打开新面板：每次启动都按当前选区开一个干净面板；保留原面板：沿用上次的面板列表。
                高亮与下划线只在当前面板生效，不永久保存。
              </p>
            </Section>

            <Section title="投影屏幕">
              <ProjectionScreenPicker />
              <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                选择投影窗口落在哪块屏幕。默认「自动」会投到与主窗口不同的扩展屏；也可固定到指定显示器。
              </p>
            </Section>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => {
              reader.reset();
              // 默认排版配色即内置「浅色」方案；若不切回方案，面板已变默认色而当前方案
              // 仍是旧色 → 方案与面板不一致。故一并套回内置浅色。
              applyScheme('light');
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认排版
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * 投影屏幕选择器：列出所有显示器，用户自由选择；默认「自动」投到扩展屏。
 * 仅 Tauri 桌面端可读显示器列表；浏览器预览下提示回退系统全屏。
 */
function ProjectionScreenPicker() {
  const selected = useProjectionSettingsStore((s) => s.projectionScreen);
  const setSetting = useProjectionSettingsStore((s) => s.set);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [primaryName, setPrimaryName] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'na'>('loading');

  useEffect(() => {
    let alive = true;
    const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!tauri) {
      setState('na');
      return;
    }
    void (async () => {
      try {
        const [ms, cur, pri] = await Promise.all([availableMonitors(), currentMonitor(), primaryMonitor()]);
        if (!alive) return;
        setMonitors(ms);
        setCurrentName(cur?.name ?? null);
        setPrimaryName(pri?.name ?? null);
        setState('ready');
      } catch (e) {
        console.error('[settings] 读取显示器失败', e);
        if (alive) setState('na');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const labelFor = (m: Monitor, i: number) => {
    if (m.name === primaryName) return '主显示器';
    if (m.name === currentName) return '当前屏幕（主窗口所在）';
    return `屏幕 ${i + 1}`;
  };

  if (state === 'na') {
    return (
      <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
        仅 Tauri 桌面端可选择投影屏幕；浏览器预览将使用系统默认全屏。
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <ScreenOption
        active={selected === null}
        onClick={() => setSetting('projectionScreen', null)}
        title="自动（扩展屏）"
        desc="多屏时投到与主窗口不同的屏幕，单屏退回系统全屏"
      />
      {state === 'loading' ? (
        <p className="px-0.5 text-[11px] text-muted-foreground/60">正在读取显示器…</p>
      ) : (
        monitors.map((m, i) => {
          const w = Math.round(m.size.width / m.scaleFactor);
          const h = Math.round(m.size.height / m.scaleFactor);
          return (
            <ScreenOption
              key={m.name ?? i}
              active={selected === m.name}
              onClick={() => setSetting('projectionScreen', m.name ?? null)}
              title={labelFor(m, i)}
              desc={`${w}×${h}${m.name ? ` · ${m.name}` : ''}`}
            />
          );
        })
      )}
    </div>
  );
}

function ScreenOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-accent/[0.1] text-accent ring-1 ring-inset ring-accent/40'
          : 'text-foreground/85 hover:bg-foreground/[0.05]',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
          active ? 'ring-accent' : 'ring-foreground/25',
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {desc && <span className="block truncate text-[10px] text-muted-foreground/70">{desc}</span>}
      </span>
    </button>
  );
}

/* ---------- 配色方案卡片 ---------- */

interface SchemeCardProps {
  scheme: ColorScheme;
  active: boolean;
  onApply: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  textColor: string;
  verseNumberColor: string;
  titleColor: string;
  backgroundColor: string;
  onColor: (key: 'textColor' | 'verseNumberColor' | 'titleColor' | 'backgroundColor', value: string) => void;
}

/**
 * 单套配色方案卡片：带实时预览缩略图；点卡片即套用（三屏同步）；
 * 当前方案就地展开，直接编辑「经文 / 节号 / 标题 / 背景」四元素颜色并自动保存；
 * 右上「⋯」可重命名 / 复制为新方案 / 删除（内置方案不可删）。
 */
function SchemeCard({
  scheme,
  active,
  onApply,
  onDuplicate,
  onRemove,
  onRename,
  textColor,
  verseNumberColor,
  titleColor,
  backgroundColor,
  onColor,
}: SchemeCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(scheme.name);
  const c = scheme.colors;

  const commit = () => {
    onRename(draft);
    setRenaming(false);
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[10px] ring-1 ring-inset transition-colors',
        active
          ? 'bg-accent/[0.07] ring-accent/40'
          : 'bg-foreground/[0.025] ring-foreground/[0.06] hover:bg-foreground/[0.05]',
      )}
    >
      <div className="flex items-center gap-2 p-1.5">
        {/* 快捷选择按钮：置于方案最前，点击即套用该方案 */}
        <button
          onClick={onApply}
          aria-label={`应用配色-${scheme.name}`}
          title="套用此配色方案"
          className={cn(
            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/15 transition-transform hover:scale-110 focus-ring',
            active && 'ring-2 ring-accent ring-offset-1 ring-offset-card',
          )}
          style={{ backgroundColor: c.backgroundColor }}
        >
          <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: c.textColor }} />
        </button>

        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(scheme.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md bg-background/80 px-2 py-1 text-[13px] ring-1 ring-inset ring-foreground/15 focus-ring"
          />
        ) : (
          <button onClick={onApply} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {/* 实时预览缩略图：背景 + 标题 / 经文 / 节号三行示例 */}
            <span
              className="flex h-8 w-[3.25rem] shrink-0 flex-col justify-center gap-[3px] overflow-hidden rounded-[6px] px-1.5 ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: c.backgroundColor }}
            >
              <span className="h-[3px] w-8 rounded-full" style={{ backgroundColor: c.titleColor }} />
              <span className="h-[2px] w-10 rounded-full opacity-90" style={{ backgroundColor: c.textColor }} />
              <span className="h-[2px] w-6 rounded-full opacity-75" style={{ backgroundColor: c.verseNumberColor }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-foreground/90">{scheme.name}</span>
              <span className="block text-[10px] leading-tight text-muted-foreground/70">
                {scheme.builtin ? '内置 · 推荐' : '自定义'}
                {active ? ' · 使用中' : ''}
              </span>
            </span>
          </button>
        )}

        {active && !renaming && <Check className="h-4 w-4 shrink-0 text-accent" />}

        {/* ⋯ 菜单：内置方案只可复制（改色请复制后自定义）；自定义方案可重命名 / 删除 */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label={`方案菜单-${scheme.name}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-ring"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" sideOffset={4} className="w-32 p-1">
            {!scheme.builtin && (
              <MenuBtn
                onClick={() => {
                  setDraft(scheme.name);
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                重命名
              </MenuBtn>
            )}
            <MenuBtn
              onClick={() => {
                onDuplicate();
                setMenuOpen(false);
              }}
            >
              复制为新方案
            </MenuBtn>
            {!scheme.builtin && (
              <MenuBtn
                danger
                onClick={() => {
                  onRemove();
                  setMenuOpen(false);
                }}
              >
                删除
              </MenuBtn>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* 当前方案就地展开：直接改四元素颜色（改动即时保存到本方案） */}
      {/* 自定义方案：就地展开编辑四元素颜色（改动即时保存） */}
      {active && !scheme.builtin && (
        <div className="space-y-2.5 border-t border-foreground/[0.07] px-2.5 pb-2.5 pt-2">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            元素颜色
          </span>
          <ColorRow label="经文颜色" value={textColor} onChange={(v) => onColor('textColor', v)} />
          <ColorRow label="节号颜色" value={verseNumberColor} onChange={(v) => onColor('verseNumberColor', v)} />
          <ColorRow label="标题颜色" value={titleColor} onChange={(v) => onColor('titleColor', v)} />
          <ColorRow label="背景颜色" value={backgroundColor} onChange={(v) => onColor('backgroundColor', v)} />
        </div>
      )}

      {/* 内置方案：只读（配色已调好，点击仅套用）；要改请「复制为新方案」后编辑 */}
      {active && scheme.builtin && (
        <div className="border-t border-foreground/[0.07] px-2.5 pb-2.5 pt-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            内置推荐配色，已调至最佳、不可直接修改。如需微调，请用右上「⋯ → 复制为新方案」。
          </p>
        </div>
      )}
    </div>
  );
}

function MenuBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors',
        danger ? 'text-red-400 hover:bg-red-400/10' : 'text-foreground/85 hover:bg-foreground/[0.06]',
      )}
    >
      {children}
    </button>
  );
}

/* ---------- 布局基元 ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  /* macOS System Settings 分组：无边框浅底容器 + 小号灰色组标题 */
  return (
    <section className="space-y-2.5">
      <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-2.5 rounded-[10px] bg-foreground/[0.035] p-3 ring-1 ring-inset ring-foreground/[0.06]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground/80">{label}</span>
        {value && <span className="tabular-nums text-xs text-muted-foreground">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-9 cursor-pointer items-center justify-between rounded-md px-2.5 text-sm transition-colors hover:bg-foreground/[0.04]">
      <span className="text-foreground/85">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function SegRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2" data-setting={label}>
      <span className="px-0.5 text-sm text-foreground/85">{label}</span>
      <div className="flex gap-[2px] rounded-[7px] bg-background/70 p-[2px] ring-1 ring-inset ring-foreground/[0.05]">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 flex-1 rounded-[5px] text-xs font-medium transition-all focus-ring',
              value === o.value
                ? 'bg-card text-foreground shadow-[0_1px_3px_hsl(var(--foreground)/0.12),0_0_0_0.5px_hsl(var(--foreground)/0.06)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 单行元素颜色：一个色圈，点击即进入调色（原生取色器）。
 * 用户反馈：不要一排预设圈，一个元素一个圈就够，点一下调色。
 */
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const shown = value || '#888888';
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md py-0.5">
      <span className="text-sm text-foreground/80">{label}</span>
      <span
        className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-black/15 transition-transform hover:scale-110"
        title="点击调色"
      >
        <input
          type="color"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span className="pointer-events-none block h-full w-full" style={{ backgroundColor: shown }} />
      </span>
    </label>
  );
}
