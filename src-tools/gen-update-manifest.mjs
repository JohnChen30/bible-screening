#!/usr/bin/env node
/**
 * gen-update-manifest.mjs — 生成 Tauri 自动更新用的 latest.json
 *
 * Tauri 桌面端 updater 会请求：
 *   https://github.com/<owner>/<repo>/releases/latest/download/latest.json
 * 该文件描述「当前最新版本号 + 各平台安装包地址 + 签名」。
 *
 * 用法（在 `npm run tauri build` 之后执行）：
 *   node src-tools/gen-update-manifest.mjs
 *   node src-tools/gen-update-manifest.mjs --notes "本次更新内容…"
 *
 * 产物：src-tauri/target/release/bundle/latest.json
 * 发布时把它和 exe、exe.sig 一起上传到 GitHub Release 即可。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const OWNER = 'JohnChen30';
const REPO = 'bible-screening';

const conf = JSON.parse(readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
const productName = conf.productName ?? 'bible_screening';

const nsisDir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
if (!existsSync(nsisDir)) {
  console.error(`✗ 找不到打包目录：${nsisDir}\n  请先执行 npm run tauri build`);
  process.exit(1);
}

// 找本次版本的安装包（排除旧版本）
const exeName = `${productName}_${version}_x64-setup.exe`;
const exePath = path.join(nsisDir, exeName);
const sigPath = `${exePath}.sig`;

if (!existsSync(exePath)) {
  console.error(`✗ 找不到安装包：${exeName}`);
  console.error(`  目录内现有：${readdirSync(nsisDir).filter((f) => f.endsWith('.exe')).join(', ') || '（空）'}`);
  process.exit(1);
}
if (!existsSync(sigPath)) {
  console.error(`✗ 找不到签名文件：${exeName}.sig`);
  console.error('  原因：打包时未提供签名私钥。请先设置环境变量后重新打包：');
  console.error('    $env:TAURI_SIGNING_PRIVATE_KEY = "C:\\Users\\afire\\.tauri\\bible-screening.key"');
  process.exit(1);
}

// .sig 文件内容即签名（base64 单行），作为 latest.json 的 signature 字段
const signature = readFileSync(sigPath, 'utf8').trim();

// 命令行 --notes
const notesArgIdx = process.argv.indexOf('--notes');
const notes =
  notesArgIdx > -1 && process.argv[notesArgIdx + 1]
    ? process.argv[notesArgIdx + 1]
    : `Bible Screening v${version}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      // GitHub Release 的固定下载地址（tag 用 v<version>）
      url: `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/${exeName}`,
    },
  },
};

const outPath = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'latest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log('✓ 已生成 latest.json');
console.log(`  版本: v${version}`);
console.log(`  安装包: ${exeName}`);
console.log(`  产物: ${outPath}`);
console.log('\n发布时需上传到 GitHub Release 的文件：');
console.log(`  1. ${exeName}`);
console.log(`  2. ${exeName}.sig`);
console.log('  3. latest.json');
