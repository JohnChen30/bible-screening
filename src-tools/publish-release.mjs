#!/usr/bin/env node
/**
 * publish-release.mjs — 一键发布（push + 开 Pages + 发 Release + 上传资产）
 *
 * 前置：npm run tauri build -- --bundles nsis  +  npm run manifest
 * 用法：node src-tools/publish-release.mjs --token ghp_xxx
 *       或 GITHUB_TOKEN=ghp_xxx node src-tools/publish-release.mjs
 *
 * 通道策略（实测）：
 *   - api.github.com / uploads.github.com：可直连
 *   - github.com（git push）：需 127.0.0.1:7890 代理
 * 全部 HTTP 走 node:https（本环境 curl 不可用）
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { request, uploadFile, probeProxy } from './lib/http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'JohnChen30';
const REPO = 'bible-screening';
const PROXY = { host: '127.0.0.1', port: 7890 };

const argIdx = process.argv.indexOf('--token');
const TOKEN = (argIdx > -1 ? process.argv[argIdx + 1] : null) || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('✗ 缺少 GitHub Token（或先跑 device-auth-publish.mjs）');
  process.exit(1);
}

const conf = JSON.parse(readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
const tag = `v${version}`;
const productName = conf.productName ?? 'bible_screening';
const exeName = `${productName}_${version}_x64-setup.exe`;
const bundleDir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle');
const nsisDir = path.join(bundleDir, 'nsis');

const assets = [
  path.join(nsisDir, exeName),
  path.join(nsisDir, `${exeName}.sig`),
  path.join(bundleDir, 'latest.json'),
];
for (const f of assets) {
  if (!existsSync(f)) {
    console.error(`✗ 缺少文件: ${f}`);
    process.exit(1);
  }
}

const apiHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function api(method, url, body) {
  const headers = { ...apiHeaders };
  if (body) headers['Content-Type'] = 'application/json';
  return request({ url, method, headers, body: body ? JSON.stringify(body) : null });
}

/** POST 优先直连，失败则回退代理 */
async function apiWithFallback(method, url, body, useProxy = false) {
  try {
    return await api(method, url, body);
  } catch (e) {
    if (useProxy) throw e;
    return request({
      url,
      method,
      headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null,
      proxy: PROXY,
    });
  }
}

const main = async () => {
  const proxyOk = await probeProxy(PROXY.host, PROXY.port);
  console.log(`▶ 发布 ${tag}（${OWNER}/${REPO}）· 代理${proxyOk ? '可用' : '不可用'}`);

  // 1. git push
  console.log('\n[1/5] 推送代码…');
  try {
    const remoteUrl = `https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git`;
    const proxyArgs = proxyOk ? ['-c', `http.proxy=http://${PROXY.host}:${PROXY.port}`, '-c', `https.proxy=http://${PROXY.host}:${PROXY.port}`] : [];
    execFileSync('git', [...proxyArgs, 'push', remoteUrl, 'main'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 300000,
    });
    console.log('  ✓ 推送成功');
  } catch (e) {
    const se = (e.stderr?.toString() || '').split('\n').filter(Boolean).slice(-2).join(' ');
    console.log(`  ⚠ 推送未成功：${(se || e.message).slice(0, 200)}`);
  }

  // 2. 开启 Pages
  console.log('\n[2/5] 开启 GitHub Pages…');
  try {
    const cur = await apiWithFallback('GET', `https://api.github.com/repos/${OWNER}/${REPO}/pages`);
    if (cur.status === 200) {
      console.log('  ✓ 已开启');
    } else {
      const r = await apiWithFallback('POST', `https://api.github.com/repos/${OWNER}/${REPO}/pages`, { build_type: 'workflow' });
      if (r.status === 201) console.log('  ✓ 开启成功（source = GitHub Actions）');
      else console.log(`  ⚠ HTTP ${r.status}：${(r.json?.message ?? r.text).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  ⚠ ${e.message}`);
  }

  // 3. 创建 Release
  console.log('\n[3/5] 创建 Release…');
  let releaseId = null;
  {
    const ex = await apiWithFallback('GET', `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
    if (ex.status === 200 && ex.json?.id) {
      releaseId = ex.json.id;
      console.log(`  ✓ 已存在（id=${releaseId}）`);
    } else {
      let notes = `Bible Screening ${tag}`;
      try {
        notes = JSON.parse(readFileSync(path.join(bundleDir, 'latest.json'), 'utf8')).notes || notes;
      } catch {
        /* ignore */
      }
      const r = await apiWithFallback('POST', `https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
        tag_name: tag,
        name: tag,
        body: notes,
        draft: false,
        prerelease: false,
        make_latest: 'true',
      });
      if (r.status === 201) {
        releaseId = r.json.id;
        console.log(`  ✓ 创建成功（id=${releaseId}）`);
      } else {
        console.error(`  ✗ HTTP ${r.status}：${(r.json?.message ?? r.text).slice(0, 300)}`);
        process.exit(1);
      }
    }
  }

  // 4. 上传资产
  console.log('\n[4/5] 上传资产…');
  {
    const list = await apiWithFallback('GET', `https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`);
    const existing = new Set((list.json ?? []).map((a) => a.name));
    for (const file of assets) {
      const name = path.basename(file);
      if (existing.has(name)) {
        console.log(`  · 已存在，跳过：${name}`);
        continue;
      }
      const ct = name.endsWith('.json') ? 'application/json' : name.endsWith('.sig') ? 'text/plain' : 'application/octet-stream';
      const url = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
      try {
        const r = await uploadFile({ url, filePath: file, contentType: ct, token: TOKEN });
        if (r.status === 201) console.log(`  ✓ ${name}`);
        else console.log(`  ⚠ ${name} HTTP ${r.status}：${(r.json?.message ?? r.text).slice(0, 150)}`);
      } catch (e) {
        console.log(`  ⚠ ${name} 上传异常：${e.message.slice(0, 120)}`);
      }
    }
  }

  // 5. 验证
  console.log('\n[5/5] 验证更新清单…');
  try {
    const r = await request({
      url: `https://github.com/${OWNER}/${REPO}/releases/latest/download/latest.json`,
      proxy: proxyOk ? PROXY : null,
    });
    if (r.status === 200 && r.json?.version) console.log(`  ✓ 可访问，最新 v${r.json.version}`);
    else console.log(`  ⚠ HTTP ${r.status}（CDN 可能有延迟）`);
  } catch (e) {
    console.log(`  ⚠ ${e.message}`);
  }

  console.log('\n────────────────────────────────');
  console.log('✓ 发布流程结束');
  console.log(`  Release : https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
  console.log(`  网页版  : https://johnchen30.github.io/${REPO}/`);
  console.log(`  更新源  : https://github.com/${OWNER}/${REPO}/releases/latest/download/latest.json`);
};

main().catch((e) => {
  console.error('发布失败：', e.message);
  process.exit(1);
});
