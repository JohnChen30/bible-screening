# 本地经文导入模块（src-tools）

圣经投影软件的数据层：扫描本地数据目录 → 自动识别格式 → 解析清洗 → 写入 SQLite。

## 快速开始

```bash
cd src-tools
npm install          # 依赖：better-sqlite3 + adm-zip
npm run import       # 等价于 node import-bible.mjs
```

默认读取 `<项目根>/bible_vasion`，输出 `<项目根>/resources/bible.db`。

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--data <目录>` | 数据根目录（含子目录与 *.zip） |
| `--db <文件>` | 输出 SQLite 路径 |
| `--only cuv,kjv` | 只导入指定译本 |
| `--report <路径>` | 导出机器可读 JSON 报告 |
| `--clean` | 导入前清空整个数据库（默认按译本幂等替换，可反复重跑） |

## 支持的数据格式（自动探测）

| 格式 | 标识 | 来源示例 | 解析器 |
| --- | --- | --- | --- |
| 嵌套字典 JSON | `cuv` | `和合本/和合本.json` `{书卷:{章:{节:文本}}}` | `parsers/cuv-parser.mjs` |
| 分卷 JSON | `book-json` | `KJV.zip` / `NIV.zip` `{book, chapters:[{chapter, verses:[{verse,text}]}]}` | `parsers/book-json-parser.mjs` |
| USFM | `usfm` | `当代译本.zip` `\id/\c/\v` 标记文本 | `parsers/usfm-parser.mjs` |

新增数据源无需改代码：放入目录或 zip 即可被探测；已知名称（和合本 / KJV / NIV / 当代译本 / 新译本…）命中预设元数据，未知来源自动推断语言与神称呼。

## 数据清洗规则

- **USFM 脚注 / 交叉引用**（`\f...\f*` `\x...\x*`）：连同内容整体剔除，不落入经文；
- **成对字符标记**（`\pn` `\w` `\nd`…）：去标记、留内容；
- **范围节号**（`\v 3-4`）：展开为多节共用文本；
- **空文本 / 重复节 / 越界节号**：跳过并记入报告；
- **UTF-8**：BOM 剥离 + 逐字节校验，非法序列报错并给出字节偏移。

## 错误处理模型

单文件失败不中断整轮导入：parser 内部隔离错误 → `ImportReport` 分级记录
（info / warn / error）→ 事务落库保证单译本原子性 → `import_runs` 表留痕 →
退出码 0/1/2 供上层（Tauri 命令或 CI）判断。

## 与 Tauri 的集成方式（第二步）

`resources/bible.db` 由本模块生成后，Tauri 端通过 `tauri-plugin-sql`
（SQLite）只读访问；应用内“重新导入”按钮经 `tauri-plugin-shell` 调用
`node import-bible.mjs`（或打包为 sidecar 可执行文件）。
