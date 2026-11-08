#!/usr/bin/env node
/**
 * device-auth-publish.mjs — GitHub 设备授权 + 自动发布（可断点续跑）
 *
 * device_code / token 落盘到 .workbuddy/gh-device.json（已被 .gitignore 忽略），
 * 进程中断后可 --resume 复用，不会浪费用户已完成的授权。
 *
 * 用法：
 *   node src-tools/device-auth-publish.mjs           # 发起授权并轮询
 *   node src-tools/device-auth-publish.mjs --resume  # 复用已存 device_code/token
 *   node src-tools/device-auth-publish.mjs --publish-only  # 已有 token 时直接发布
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, probeProxy } from './lib/http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_ID = '178c6fc778ccc68e1d6a';
const STORE_DIR = path.join(ROOT, '.workbuddy');
const STORE = path.join(STORE_DIR, 'gh-device.json');
const PROXY = { host: '127.0.0.1', port: 7890 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 通过代理 POST 表单（github.com 需代理） */
async function postForm(url, fields, useProxy = true) {
  const body = new URLSearchParams(fields).toString();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  return request({ url, method: 'POST', headers, body, proxy: useProxy ? PROXY : null, timeout: 30000 });
}

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'));
  } catch {
    return null;
  }
}
function saveStore(obj) {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE, JSON.stringify(obj, null, 2), 'utf8');
}

const main = async () => {
  const proxyOk = await probeProxy(PROXY.host, PROXY.port);
  if (!proxyOk) {
    console.error('✗ 代理 127.0.0.1:7890 不可用，无法访问 github.com/login');
    console.error('  请确认代理软件已开启（允许局域网 / 混合端口 7890）');
    process.exit(1);
  }

  let store = loadStore();

  // 已有 token → 直接发布
  if (store?.access_token && process.argv.includes('--publish-only')) {
    return publish(store.access_token);
  }

  const needNew = !store?.device_code || store.expires_at <= Date.now();
  if (needNew) {
    const r = await postForm('https://github.com/login/device/code', { client_id: CLIENT_ID, scope: 'repo workflow' });
    const dc = r.json;
    if (!dc?.device_code) {
      console.error('✗ 申请设备码失败：', (r.text || '').slice(0, 300));
      process.exit(1);
    }
    store = {
      device_code: dc.device_code,
      user_code: dc.user_code,
      verification_uri: dc.verification_uri,
      interval: dc.interval || 5,
      expires_at: Date.now() + (dc.expires_in || 900) * 1000,
    };
    saveStore(store);
    console.log('════════════════════════════════════════');
    console.log('  1) 打开：' + store.verification_uri);
    console.log('  2) 输入：' + store.user_code);
    console.log(`  （${Math.floor((dc.expires_in || 900) / 60)} 分钟内有效）`);
    console.log('════════════════════════════════════════');
  } else {
    console.log(`↻ 复用已存授权（user_code=${store.user_code}）`);
  }

  let interval = (store.interval || 5) * 1000;
  while (Date.now() < store.expires_at) {
    await sleep(interval);
    let r;
    try {
      r = await postForm('https://github.com/login/oauth/access_token', {
        client_id: CLIENT_ID,
        device_code: store.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
    } catch {
      continue; // 网络抖动，继续等
    }
    const j = r.json;
    if (j?.access_token) {
      store.access_token = j.access_token;
      saveStore(store);
      console.log('\n✓ 授权成功，开始发布…\n');
      return publish(j.access_token);
    }
    if (j?.error === 'authorization_pending') continue;
    if (j?.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (j?.error === 'expired_token') {
      console.error('✗ 授权码已过期，重跑本脚本（不带参数）即可重新发起');
      process.exit(1);
    }
    if (j?.error === 'access_denied') {
      console.error('✗ 授权被拒绝');
      process.exit(1);
    }
  }
  console.error('✗ 等待超时');
  process.exit(1);
};

function publish(token) {
  execFileSync('node', [path.join(ROOT, 'src-tools', 'publish-release.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, GITHUB_TOKEN: token },
    timeout: 900000,
  });
}

main().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
