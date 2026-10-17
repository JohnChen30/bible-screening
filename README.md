# 圣经投影与阅读软件 · Scripture

Tauri + React + TypeScript + Tailwind CSS + Zustand + Framer Motion 的专业级圣经投影与阅读软件。

## 快速开始（浏览器预览）

```bash
# 1. 安装依赖
npm install

# 2. 生成数据（首次）：SQLite 全量库 → 前端 JSON 快照
node src-tools/import-bible.mjs        # 导入四译本（124,135 节）
node src-tools/export-snapshot.mjs     # 导出 public/data/*.json

# 3. 启动
npm run dev                            # → http://localhost:5173/console
```

投影窗口预览：控制台点「投影」→ 点右上角「打开投影窗口」在新标签页打开
`/output`（桌面端将由 Tauri 第二窗口承载，经 Tauri Event 同步）。

## 目录结构

```
src-tools/            本地经文导入模块（Node）：扫描/解压/解析 → SQLite
  import-bible.mjs    CLI 编排器（--sample 样本模式：和合本+当代译本 创1）
  export-snapshot.mjs SQLite → public/data/*.json 快照
  parsers/            cuv（嵌套JSON）/ book-json（分卷JSON）/ usfm 三种解析器
  lib/                66 卷规范表、格式探测、UTF-8 校验、报告收集
resources/            bible.db（全量库）、bible-sample.db（样本库）、import-report.json
public/data/          前端数据快照（verses/books + 四译本经文）
src/
  routes/console-page.tsx   主控台：Miller Columns + 阅读区 + PPT 投影动画
  components/
    miller-columns/  macOS Finder 风格四列选择器（书卷→章→起始节→结束节）
    reader/          阅读区：虚拟滚动、逐节/分屏对照、神上帝互换、划词高亮
    projection/      投影控制面板 + /output 投影页
    settings/        设置对话框（阅读/投影双 Tab）
    panels/          底部多面板系统
    ui/              shadcn/ui 风格基础组件（Radix + CVA）
  stores/            Zustand：bible / reader-settings / projection-settings / panels / highlights
  lib/               数据层双适配（Tauri SQL / JSON 快照）、投影通道、主题、类型
```

## 核心技术决策

- **数据层双适配**：桌面端 `window.__TAURI__` 调 Rust 命令读 SQLite；
  浏览器预览 fetch JSON 快照。上层 Store 无感。
- **投影同步**：Tauri Event（桌面）/ BroadcastChannel（浏览器双标签页）。
- **排版引擎**：阅读区与投影区设置完全分离，均经 CSS 变量 + Zustand 持久化下发。
- **虚拟滚动**：每节换行模式经 tanstack-virtual；流式模式渲染整章（上限 176 节）。

## 已知数据质量说明

和合本源数据集不完整：缺撒母耳记下 21–24 全章、创世记 1:11–31 等约 258 节
（0.8%）；NIV 有 16 节空文本（Textus Receptus 节）。解析器为无损导入，
建议后续更换完整和合本数据源后重跑 `npm run import`。

## 第三阶段（Tauri 壳）

```bash
npm run tauri dev     # 需 Rust + WebView2；src-tauri 中将实现：
                      #   bible_versions / bible_books / bible_load_version 命令
                      #   /output 无边框全屏第二窗口
```
