import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// 仓库 / 网页版地址（供「软件版本」菜单外链使用）
const REPO_URL = "https://github.com/JohnChen30/bible-screening";
const WEB_URL = "https://johnchen30.github.io/bible-screening/";

// 版本号直接从 package.json 读取，避免多处手写漏改
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // base 默认 "/"（Tauri 桌面端打包用）；网页版构建用 `vite build --base=./`
  // 覆盖为相对路径，使其能挂到 GitHub Pages 子路径 /bible-screening/ 下。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_URL__: JSON.stringify(REPO_URL),
    __WEB_URL__: JSON.stringify(WEB_URL),
  },
  server: {
    // 强制监听 IPv4：Windows 上 localhost 可能被 Node 解析为 IPv6 ::1，
    // 而 WebView2 访问 localhost 走 IPv4 127.0.0.1，二者不匹配会导致 Tauri 窗口白屏。
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      // 关键：忽略 src-tauri 目录，避免监听 Rust 编译产物导致 EBUSY
      ignored: ["**/src-tauri/**"],
    },
  },
});
