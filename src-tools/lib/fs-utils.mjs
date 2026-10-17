/**
 * fs-utils.mjs — UTF-8 安全 IO 工具
 *
 * 圣经数据是多语言混排（中文 / 英文 / 希腊音译符号），编码必须是硬约束：
 *   - readUtf8()：带 BOM 剥离、fatal 模式解码、非法字节偏移定位；
 *   - validateUtf8()：独立校验器，返回首个非法字节偏移（用于报错信息）；
 *   - listZipEntries() / readZipText()：压缩包条目列举与文本读取（adm-zip）。
 */

import { readFile } from 'node:fs/promises';
import AdmZip from 'adm-zip';

/** 剥离 UTF-8 / UTF-16 BOM */
export function stripBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3);
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2); // UTF-16 LE
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return buf.subarray(2); // UTF-16 BE
  return buf;
}

/**
 * 手动 UTF-8 校验，返回首个非法字节偏移；合法返回 -1。
 * 覆盖：过长序列 / 孤立延续字节 / 截断序列 / 代理区 / 超范围码位。
 */
export function validateUtf8(buf) {
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b <= 0x7f) { i += 1; continue; }
    let need;
    let cp;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; }
    else return i; // 0x80-0xc1 / 0xf5-0xff 均非法起始字节
    if (i + need >= buf.length + 0 && i + need > buf.length - 1) return i; // 截断
    for (let k = 1; k <= need; k++) {
      const cb = buf[i + k];
      if ((cb & 0xc0) !== 0x80) return i + k;
      cp = (cp << 6) | (cb & 0x3f);
    }
    if (need === 2 && cp < 0x800) return i;
    if (need === 3 && (cp < 0x10000 || cp > 0x10ffff)) return i;
    if (cp >= 0xd800 && cp <= 0xdfff) return i;
    i += need + 1;
  }
  return -1;
}

/**
 * 读取文本文件并严格按 UTF-8 解码。
 * @returns {Promise<{text: string, hadBom: boolean}>}
 * @throws {EncodingError} 含非法字节偏移信息
 */
export async function readUtf8(filePath) {
  const raw = await readFile(filePath);
  const bad = validateUtf8(raw);
  if (bad !== -1) {
    const hex = raw.subarray(Math.max(0, bad - 8), bad + 8).toString('hex');
    throw new EncodingError(filePath, bad, hex);
  }
  const hadBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  return { text: stripBom(raw).toString('utf8'), hadBom };
}

/** 编码错误：携带文件路径与字节偏移，便于定位问题文件 */
export class EncodingError extends Error {
  constructor(filePath, offset, hex) {
    super(`非法 UTF-8 序列 @ ${filePath} 偏移 ${offset}（上下文 ${hex}）`);
    this.name = 'EncodingError';
    this.filePath = filePath;
    this.offset = offset;
  }
}

/** 列举 zip 内条目（跳过目录与 macOS 元数据） */
export function listZipEntries(zipPath, filterExt = null) {
  const zip = new AdmZip(zipPath);
  return zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX'))
    .map((e) => e.entryName)
    .filter((name) => (filterExt ? name.toLowerCase().endsWith(filterExt) : true));
}

/** 读取 zip 内指定条目文本（UTF-8，带 fatal 校验） */
export function readZipText(zipPath, entryName) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(entryName);
  if (!entry) throw new Error(`zip 条目不存在: ${zipPath} :: ${entryName}`);
  const buf = entry.getData();
  const bad = validateUtf8(buf);
  if (bad !== -1) throw new EncodingError(`${zipPath}::${entryName}`, bad, '');
  return stripBom(buf).toString('utf8');
}

/** 读取 zip 内指定条目 Buffer（供 JSON.parse 前自行校验） */
export function readZipBuffer(zipPath, entryName) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(entryName);
  if (!entry) throw new Error(`zip 条目不存在: ${zipPath} :: ${entryName}`);
  return entry.getData();
}
