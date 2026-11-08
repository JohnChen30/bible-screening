/**
 * http.mjs — 零依赖 HTTPS 请求（支持 HTTP CONNECT 代理）
 *
 * 背景：本环境 execFileSync('curl') 会 EBUSY（spawn 被限制），
 * 且 Node 内置 fetch 不支持代理、未安装 undici。
 * 因此用 node:https + 手写 CONNECT 隧道实现。
 */

import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs';

/** 通过 HTTP 代理建立 TLS 连接的 Agent */
class ProxyAgent extends https.Agent {
  constructor(proxyHost, proxyPort) {
    super({ keepAlive: false });
    this.proxyHost = proxyHost;
    this.proxyPort = proxyPort;
  }

  createConnection(options, cb) {
    const req = http.request({
      host: this.proxyHost,
      port: this.proxyPort,
      method: 'CONNECT',
      path: `${options.host}:${options.port || 443}`,
      headers: { Host: `${options.host}:${options.port || 443}` },
      timeout: 20000,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        cb(new Error(`proxy CONNECT ${res.statusCode}`));
        return;
      }
      cb(null, tls.connect({ socket, servername: options.host }));
    });
    req.on('error', cb);
    req.on('timeout', () => {
      req.destroy();
      cb(new Error('proxy connect timeout'));
    });
    req.end();
  }
}

/**
 * 发起 HTTPS 请求
 * @param {object} o {url, method, headers, body, proxy}
 *   proxy: {host, port} | null
 * @returns {Promise<{status:number, text:string, json:any}>}
 */
export function request({ url, method = 'GET', headers = {}, body = null, proxy = null, timeout = 60000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers: { 'User-Agent': 'bible-screening', ...headers },
      timeout,
    };
    if (proxy) opts.agent = new ProxyAgent(proxy.host, proxy.port);
    if (body && typeof body === 'string') opts.headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* 非 JSON */
        }
        resolve({ status: res.statusCode, text, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

/** 上传文件（流式，避免把 14MB 读进内存） */
export function uploadFile({ url, filePath, contentType, token, proxy = null, timeout = 300000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const size = fs.statSync(filePath).size;
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'User-Agent': 'bible-screening',
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': contentType,
        'Content-Length': size,
      },
      timeout,
    };
    if (proxy) opts.agent = new ProxyAgent(proxy.host, proxy.port);

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* ignore */
        }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('upload timeout'));
    });
    fs.createReadStream(filePath).pipe(req);
  });
}

/** 探测代理是否可用（CONNECT github.com:443） */
export function probeProxy(host = '127.0.0.1', port = 7890, timeout = 8000) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, method: 'CONNECT', path: 'github.com:443', timeout });
    req.on('connect', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
