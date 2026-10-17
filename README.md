# 圣经投影与阅读软件 · Bible Screening

一款面向讲台 / 查经场景的**专业级圣经投影与阅读软件**，基于 **Tauri v2 + React + TypeScript** 构建。桌面端为原生窗口，支持多显示器投影、逐节 / 分屏对照、划词高亮、多面板等。

---

## 一、下载与安装（推荐）

1. 打开本仓库右侧的 **Releases** 页面；
2. 下载最新的 `bible_screening_<版本>_x64-setup.exe`；
3. 双击运行安装包，按向导完成安装；
4. 从开始菜单 / 桌面快捷方式启动 **Bible Screening**。

> 系统要求：Windows 10 / 11（x64）。首次运行若提示缺少 WebView2，按提示安装即可（Windows 11 已内置）。

---

## 二、软件使用方法

### 1. 选择经文（左侧）
左侧是 Finder 风格的多列选择器：**书卷 → 章节 → 起始节 → 结束节**。
- 单击即选中，阅读区与投影画面实时更新；
- 可只选整章，也可精确到某一节或某段区间。

### 2. 阅读区
- **排版模式**：逐节（每节一行）/ 段落（多节成段，首行缩进）；
- **多译本对照**：单版、逐节上下对照、左右分屏；
- **字体与行距**：字号、行距、加粗、衬线 / 无衬线、页边距均可调；
- **神 / 上帝互换**：一键切换和合本用词；
- **标题**：可设显示方式（常驻顶部 / 随文滚动 / 不显示）与对齐（左 / 中 / 右）。

### 3. 选择与标注
- **单击某一节**：给整节加「强调色」（选中态），可多选；再次点击取消；
- **拖选一段文字**：只对选中的文字应用**高亮颜色 / 下划线**（底部工具条）；
- **清除格式**：一键清掉本页所有高亮、下划线与选中态；
- **复制经文**：选中后底部弹出「复制经文」，自动整理为「每节一行 + 标题」的格式复制到剪贴板。

### 4. 多面板
底部面板栏可新建多个面板，每个面板可保存不同的经文段，方便在一场分享中切换不同经文。

### 5. 投影（核心）
- 顶部工具栏点 **「投影」** 按钮开始投影，再点 **「退出投影」** 结束；
- 在 **设置 → 投影屏** 里可选择投影到哪块显示器（多屏时可指定某块屏，单屏则全屏）；
- 投影时底部控件条提供：**黑屏 / 清屏 / 自动滚动（5 档）/ 打开投影窗口 / 退出投影**；
- 投影窗口按 **Esc** 即可退出。

### 6. 设置
右上角「排版」按钮打开设置，分「用词与排版 / 面板 / 配色」等分类：颜色方案、标题对齐、页面比例、投影屏幕等都在这里。

---

## 三、从源码开发 / 构建

### 开发运行（浏览器预览）
```bash
npm install
node src-tools/import-bible.mjs      # 首次：导入经文库（生成 SQLite）
node src-tools/export-snapshot.mjs   # 首次：导出前端 JSON 快照 public/data/*.json
npm run dev                          # → http://localhost:5173
```

### 桌面端开发
```bash
npm run tauri dev
```

### 打包 Windows 安装包
需本机已安装 **Rust（MSVC 工具链）** 与 **Microsoft C++ Build Tools**。
> 若遇到 `schemars` 相关编译报错，需在编译前注入环境变量：`RUSTFLAGS="--cfg has_std"`。

```powershell
# 在 PowerShell（已激活 MSVC 环境）中：
$env:RUSTFLAGS = '--cfg has_std'
npx tauri build --bundles nsis
```
产物：
- 安装包：`src-tauri/target/release/bundle/nsis/bible_screening_<版本>_x64-setup.exe`
- 主程序：`src-tauri/target/release/app.exe`

### 更换应用 / 安装包图标
准备一张**正方形、带透明背景、≥1024×1024** 的 PNG，命名 `app-icon.png` 放项目根目录，然后：
```bash
npx tauri icon          # 生成全套图标到 src-tauri/icons/
npx tauri build --bundles nsis
```

---

## 四、技术栈
- **外壳**：Tauri v2（Rust + WebView2）
- **前端**：React 18 + TypeScript + Vite
- **样式**：Tailwind CSS + Radix UI + Framer Motion
- **状态**：Zustand（持久化）
- **数据**：Rust `rusqlite`（打包内嵌 SQLite）/ 浏览器回退 JSON 快照；三屏（阅读 / 预览 / 投影）同源同排版

---

## 五、目录结构
```
src-tools/            经文导入模块（Node）：解析 → SQLite → JSON 快照
resources/            bible.db（全量库，打包时作为资源内嵌）
public/data/          前端数据快照（books / versions / 各译本经文）
src/
  routes/             主控台、投影输出页
  components/         reader / projection / settings / miller-columns / panels / ui
  stores/             Zustand 状态
  lib/                数据层、投影通道、滚动同步、工具
src-tauri/            Rust 后端（SQLite 命令、窗口管理）、图标、配置
```

---

## 六、数据说明
和合本源数据集存在少量缺失（约 0.8% 章节），解析器为无损导入。如需替换更完整的译本数据，重跑 `src-tools/` 下的导入脚本即可。
