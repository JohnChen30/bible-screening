/**
 * detect.mjs — 数据源发现 + 格式自动探测 + 译本元数据映射
 *
 * 扫描策略（对数据根目录）：
 *   1. 每个子目录视为一个“目录型数据源”（如 和合本/）；
 *   2. 每个 *.zip 视为一个“压缩包数据源”（如 KJV.zip）；
 *   3. 逐个探测格式：
 *        cuv        —— {书卷:{章:{节:文本}}} 嵌套字典（和合本.json）
 *        book-json  —— {book, chapters:[{chapter, verses:[{verse,text}]}]}（KJV/NIV）
 *        usfm       —— \id / \c / \v 标记文本（当代译本）
 *   4. 已知数据源命中预设元数据；未知数据源自动推断（语言、神称呼）并生成机器码，
 *      保证未来新增“新译本”文件夹即可直接导入，无需改代码。
 */

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { listZipEntries, readZipBuffer, readUtf8 } from './fs-utils.mjs';
import { detectLanguage, resolveBook } from './books.mjs';

/** 已知数据源预设（目录名 / 压缩包名 → 译本元数据） */
const VERSION_PRESETS = [
  { match: '和合本',          version: { code: 'cuv', name: '和合本',   nameEn: 'Chinese Union Version',        language: 'zh-Hans', godTerm: '神' } },
  { match: 'KJV',             version: { code: 'kjv', name: 'KJV',     nameEn: 'King James Version',           language: 'en',     godTerm: 'God' } },
  { match: 'NIV',             version: { code: 'niv', name: 'NIV',     nameEn: 'New International Version',    language: 'en',     godTerm: 'God' } },
  { match: '当代译本',        version: { code: 'ccb', name: '当代译本', nameEn: 'Chinese Contemporary Bible',   language: 'zh-Hans', godTerm: '上帝' } },
  { match: '新译本',          version: { code: 'cnv', name: '新译本',   nameEn: 'Chinese New Version',          language: 'zh-Hans', godTerm: '神' } },
  { match: '和合本修订版',    version: { code: 'rcuv', name: '和合本修订版', nameEn: 'Revised Chinese Union Version', language: 'zh-Hans', godTerm: '神' } },
];

/** 猜测神称呼（中文数据源） */
function guessGodTerm(sample) {
  if (/上帝/.test(sample)) return '上帝';
  if (/神/.test(sample)) return '神';
  return '神';
}

/** 为未知数据源生成机器码（取字母数字；无则用序号） */
function slugify(name, seq) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `custom-${seq}`;
}

/** 判断 JSON 是否为“嵌套字典型”（cuv）：顶层值均为 {章:{节:str}} */
function looksLikeCuv(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length < 10) return false;
  let hit = 0;
  for (const k of keys.slice(0, 10)) {
    const book = obj[k];
    if (!book || typeof book !== 'object' || Array.isArray(book)) continue;
    const chKeys = Object.keys(book);
    if (!chKeys.length) continue;
    const ch = book[chKeys[0]];
    if (ch && typeof ch === 'object' && !Array.isArray(ch)) {
      const vKeys = Object.keys(ch);
      if (vKeys.length && typeof ch[vKeys[0]] === 'string') hit++;
    }
  }
  return hit >= Math.min(5, keys.length);
}

/** 判断 JSON 是否为“分卷型”（book-json） */
function looksLikeBookJson(obj) {
  return !!obj && typeof obj === 'object' && Array.isArray(obj.chapters) &&
    obj.chapters.length > 0 && Array.isArray(obj.chapters[0]?.verses);
}

/** 从 Buffer 安全解析 JSON（UTF-8 fatal 由调用方保证） */
function parseJsonBuffer(buf, label) {
  const text = buf.toString('utf8');
  return JSON.parse(text);
}

/**
 * 发现数据根目录下的全部数据源。
 * @param {string} dataRoot 数据根目录（含子目录与 zip）
 * @returns {Promise<SourceInfo[]>}
 */
export async function discoverSources(dataRoot) {
  if (!existsSync(dataRoot)) {
    throw new Error(`数据目录不存在: ${dataRoot}`);
  }
  const entries = await readdir(dataRoot, { withFileTypes: true });
  /** @type {SourceInfo[]} */
  const sources = [];
  let seq = 0;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dataRoot, entry.name);

    if (entry.isDirectory()) {
      const jsonFiles = (await readdir(full)).filter((f) => f.toLowerCase().endsWith('.json'));
      if (!jsonFiles.length) continue;
      const source = await detectDirSource(full, entry.name, jsonFiles, seq++);
      if (source) sources.push(source);
    } else if (entry.name.toLowerCase().endsWith('.zip')) {
      const source = await detectZipSource(full, entry.name, seq++);
      if (source) sources.push(source);
    }
  }
  return sources;
}

async function detectDirSource(dirPath, label, jsonFiles, seq) {
  // 候选主文件：体积最大的 json；books.json 视为索引文件
  const { stat } = await import('node:fs/promises');
  const sized = await Promise.all(jsonFiles.map(async (f) => ({
    name: f,
    size: (await stat(path.join(dirPath, f))).size,
  })));
  sized.sort((a, b) => b.size - a.size);
  const indexFile = sized.find((f) => /^books\.json$/i.test(f.name));
  const mainFile = sized.find((f) => f !== indexFile && !/^books\.json$/i.test(f.name));
  if (!mainFile) return null;

  let format = null;
  let sample = '';
  try {
    const { text } = await readUtf8(path.join(dirPath, mainFile.name));
    sample = text.slice(0, 4000);
    const obj = JSON.parse(text);
    if (looksLikeCuv(obj)) format = 'cuv';
    else if (looksLikeBookJson(obj)) format = 'book-json';
  } catch (err) {
    // 主文件不可解析：尝试其余文件
    for (const f of sized) {
      if (f === mainFile || /^books\.json$/i.test(f.name)) continue;
      try {
        const { text } = await readUtf8(path.join(dirPath, f.name));
        const obj = JSON.parse(text);
        if (looksLikeBookJson(obj)) { format = 'book-json'; sample = text.slice(0, 4000); break; }
        if (looksLikeCuv(obj)) { format = 'cuv'; sample = text.slice(0, 4000); break; }
      } catch { /* 继续尝试下一个 */ }
    }
  }
  if (!format) return null;

  return buildSource({
    kind: 'dir', path: dirPath, label, format, seq,
    files: jsonFiles, indexFile: indexFile?.name ?? null, sample,
  });
}

async function detectZipSource(zipPath, label, seq) {
  let jsonNames = [];
  let usfmNames = [];
  try {
    jsonNames = listZipEntries(zipPath, '.json');
    usfmNames = listZipEntries(zipPath, '.usfm');
  } catch (err) {
    console.warn(`  ! zip 读取失败，跳过: ${label}（${err.message}）`);
    return null;
  }

  let format = null;
  let sample = '';
  if (usfmNames.length) {
    format = 'usfm';
  } else if (jsonNames.length) {
    // 跳过 Books.json（卷名索引，顶层为数组）
    const candidates = jsonNames.filter((n) => !/books\.json$/i.test(path.basename(n)));
    for (const name of candidates) {
      try {
        const obj = parseJsonBuffer(readZipBuffer(zipPath, name), name);
        if (looksLikeBookJson(obj)) { format = 'book-json'; sample = JSON.stringify(obj).slice(0, 2000); break; }
        if (looksLikeCuv(obj)) { format = 'cuv'; sample = JSON.stringify(obj).slice(0, 2000); break; }
      } catch { /* 尝试下一个条目 */ }
    }
  }
  if (!format) return null;

  return buildSource({
    kind: 'zip', path: zipPath, label, format, seq,
    files: format === 'usfm' ? usfmNames : jsonNames, indexFile: null, sample,
  });
}

/** 组装数据源描述（含译本元数据：预设命中 or 自动推断） */
function buildSource({ kind, path: srcPath, label, format, seq, files, indexFile, sample }) {
  const preset = VERSION_PRESETS.find((p) => label.includes(p.match));
  let version;
  if (preset) {
    version = { ...preset.version, sourceDir: srcPath };
  } else {
    const language = detectLanguage(sample);
    version = {
      code: slugify(label, seq),
      name: label,
      nameEn: '',
      language,
      godTerm: language === 'en' ? 'God' : guessGodTerm(sample),
      sourceDir: srcPath,
    };
  }
  return { kind, path: srcPath, label, format, version, files, indexFile };
}

/**
 * @typedef {Object} SourceInfo
 * @property {'dir'|'zip'} kind
 * @property {string} path        绝对路径
 * @property {string} label       显示名
 * @property {'cuv'|'book-json'|'usfm'} format
 * @property {{code:string,name:string,nameEn:string,language:string,godTerm:string,sourceDir:string}} version
 * @property {string[]} files     参与解析的文件/条目列表
 * @property {string|null} indexFile 书卷索引文件（cuv 的 books.json）
 */
