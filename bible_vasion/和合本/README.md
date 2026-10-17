# 圣经 (Chinese Bible JSON)

这是一个包含中文圣经文本及章节书目索引的开源项目副本，主要用于程序读取和快速检索经文。

## 项目内容
- `bible.json`：按卷（Book）->章（Chapter）->节（Verse）三级结构组织的 JSON 圣经文章库，示例：
  - `Genesis` -> `1` -> `1` : 第一章第一节文本
- `books.json`：中英文书卷映射（old / new testament），包含 key 与对应中文名称
- `圣经.txt`：与 `bible.json` 相同内容的纯文本副本（JSON 格式）

## 文件结构示例
```json
{
  "Genesis": {
    "1": {
      "1": "起初神创造天地。",
      "2": "地是空虚混沌，渊面黑暗；神的灵运行在水面上。"
    }
  }
}
```

## 使用说明
你可以用任意支持 JSON 的语言读取 `bible.json`，下面给出两个简单的示例：

### Python 示例
```python
import json

with open('bible.json', 'r', encoding='utf-8') as f:
    bible = json.load(f)

book = 'Genesis'
chapter = '1'
verse = '1'
print(bible[book][chapter][verse])
```

### Node.js 示例
```js
const fs = require('fs');

const bible = JSON.parse(fs.readFileSync('bible.json', 'utf8'));
const book = 'Genesis';
const chapter = '1';
const verse = '1';
console.log(bible[book][chapter][verse]);
```

## 贡献说明
- 如果你想补充修订或改进文本，请先 fork 本仓库并提交 PR。
- 请确保 JSON 格式规范、Unicode 编码为 UTF-8，且不要改变 key 命名（例如 `Genesis`, `Exodus`）。

## 版权与许可
- 当前仓库未包含明确的许可文件。请在使用或发布前确认文本来源的版权和许可（有些圣经译本为公有领域或可自由复用，但有些译本受版权保护）。
- 如果你是文本版权所有者或想添加许可证，请在仓库根目录添加合适的 `LICENSE` 文件。


