/**
 * common.mjs — 解析器共享工具
 * 所有解析器统一输出 VerseRecord，由 orchestrator 负责落库。
 *
 * @typedef {{osis:string, chapter:number, verse:number, text:string}} VerseRecord
 */

/** 节号展开："3-4" → [3,4]；"12" → [12]；非法 → [] */
export function expandVerseRange(raw) {
  const s = String(raw ?? '').trim();
  let m = /^(\d+)$/.exec(s);
  if (m) return [Number(m[1])];
  m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b >= a && b - a <= 50) {
      const out = [];
      for (let v = a; v <= b; v++) out.push(v);
      return out;
    }
  }
  return [];
}

/**
 * 中文全角标点（仅用于排版美化；英文半角标点不受影响）
 * 说明：和合本有「神 / 上帝」字前留一个空格的尊称排版传统，清理时需保留。
 * 引号归入：左引号（“ ‘ 「 『）属起始类，右引号（” ’ 」 』）属结束类。
 */
const CJK_PUNCT = '，。！？；：、）」』】》”’';
const CJK_LEFT = '（「『《【“‘';

/**
 * 对话引号规范化：统一用中文引号，不再使用直角引号「」。
 *
 *   1) 「」→ “” ，『』→ ‘’（直角引号 → 中文标准引号，开闭明确，可直接替换）；
 *   2) ASCII 直引号 " → 按「上下文」配对为 “ / ”：
 *      前面是标点/空格/句首且后面接文字 → 开引号；后面是标点/空格/句尾 → 闭引号。
 *
 * 为什么用上下文而不是「节内奇偶交替」：对话常跨节（开引号在第 N 节、闭引号在第
 * N+1 节），单节内 " 常为奇数个，按位置交替会把闭合引号误判为开引号。
 * 英文译本本身已使用 “”，且不含「」与 ASCII "，故本规则对英文无副作用。
 */
function normalizeQuotes(t) {
  let s = t
    .replace(/「/g, '\u201C') // “
    .replace(/」/g, '\u201D') // ”
    .replace(/『/g, '\u2018') // ‘
    .replace(/』/g, '\u2019'); // ’
  if (!s.includes('"')) return s;

  let out = '';
  let open = true;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '"') { out += c; continue; }
    const prev = i > 0 ? s[i - 1] : '';
    // 按「前一个字符」的语义判断开 / 闭：
    //   冒号后 → 引导对话（开）；句末标点或中文字后 → 对话到此结束（闭）；
    //   其余（空格、逗号等）语义不明 → 退化为交替状态。
    let isOpen;
    if (prev === '') isOpen = true; // 句首只能是开引号
    else if (/[：:]/.test(prev)) isOpen = true; // 引导冒号，如「…说：」
    else if (/[。！？；.!?;]/.test(prev)) isOpen = false; // 句末标点，如「…光！」
    else if (/[\u4e00-\u9fff0-9]/.test(prev)) isOpen = false; // 接中文字/数字，内容结束
    else isOpen = open; // 语义不明 → 交替
    out += isOpen ? '\u201C' : '\u201D';
    open = !isOpen;
  }
  return out;
}

/**
 * 文本清洗：
 *   - 折叠连续空白为单个空格（保留英文所需空格，去掉 USFM 行尾对齐空格）；
 *   - 去除零宽字符 / BOM 残留；
 *   - 中文标点排版美化：去掉标点周围多余的空格，让中文标点紧贴文字（更好看）；
 *   - trim。
 */
export function cleanText(raw) {
  let t = String(raw ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, ' ');

  // 对话引号规范化：「」→ “”，ASCII " 按上下文配对为 “ / ”
  t = normalizeQuotes(t);

  // ---- 中文标点排版美化（只匹配全角标点，不影响英文译本）----
  t = t
    // 1) 「神 / 上帝」前的尊称空格统一保留一个（和合本传统，示尊敬）
    .replace(/\s+(?=神|上帝)/g, ' ')
    // 2) 标点后多余的空格（跳过「神 / 上帝」前的尊称空格）
    .replace(new RegExp(`([${CJK_PUNCT}])\\s+(?!神|上帝)`, 'g'), '$1')
    // 3) 标点 / 左引号前的多余空格
    .replace(new RegExp(`\\s+([${CJK_PUNCT}${CJK_LEFT}])`, 'g'), '$1')
    // 4) 左引号 / 左括号后的多余空格（同样跳过尊称空格，保持「神」前空格一致）
    .replace(new RegExp(`([${CJK_LEFT}])\\s+(?!神|上帝)`, 'g'), '$1');

  return t.trim();
}

/** 章 / 节号合法性（对齐 schema CHECK 约束） */
export function isValidChapterVerse(chapter, verse) {
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= 200 &&
    Number.isInteger(verse) && verse >= 1 && verse <= 200;
}
