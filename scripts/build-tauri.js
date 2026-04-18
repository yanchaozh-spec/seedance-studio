/**
 * Tauri 构建脚本（Windows 兼容，无需 bash）
 * 用法: node scripts/build-tauri.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = process.env.COZE_WORKSPACE_PATH || process.cwd();
const NODE_VERSION = "20.18.0";
const NODE_EXE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;
const NODE_EXE_PATH = path.join(ROOT, "src-tauri", "resources", "node.exe");

function run(cmd) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function findServerJs(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = findServerJs(fullPath);
      if (result) return result;
    } else if (entry.name === "server.js") {
      return fullPath;
    }
  }
  return null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;

    get(url, (resp) => {
      // 处理重定向
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        downloadFile(resp.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (resp.statusCode !== 200) {
        reject(new Error(`下载失败，HTTP 状态码: ${resp.statusCode}`));
        return;
      }
      resp.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log("=== Tauri 构建脚本 ===\n");

  // [1/6] 安装依赖
  log("1/6", "安装依赖...");
  run("pnpm install --prefer-frozen-lockfile");

  // [2/6] 构建 Next.js
  log("2/6", "构建 Next.js (standalone 模式)...");
  run("pnpm next build");

  // [3/6] 定位 standalone 输出
  log("3/6", "定位 standalone 输出目录...");
  const standaloneRoot = path.join(ROOT, ".next", "standalone");
  if (!fs.existsSync(standaloneRoot)) {
    log("✗", "未找到 standalone 输出，请检查 next.config.ts 是否配置了 output: 'standalone'");
    process.exit(1);
  }

  const serverJs = findServerJs(standaloneRoot);
  if (!serverJs) {
    log("✗", "未找到 standalone server.js");
    process.exit(1);
  }

  const standaloneDir = path.dirname(serverJs);
  log("✓", `standalone 目录: ${standaloneDir}`);

  // [4/6] 补全 standalone
  log("4/6", "补全 standalone 输出目录...");

  const staticSrc = path.join(ROOT, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  if (fs.existsSync(staticSrc)) {
    copyDirSync(staticSrc, staticDest);
    log("✓", "已复制 .next/static");
  }

  const publicSrc = path.join(ROOT, "public");
  const publicDest = path.join(standaloneDir, "public");
  if (fs.existsSync(publicSrc)) {
    copyDirSync(publicSrc, publicDest);
    log("✓", "已复制 public");
  }

  // [5/6] 下载 node.exe
  log("5/6", `下载 Node.js 便携版 (v${NODE_VERSION})...`);
  fs.mkdirSync(path.dirname(NODE_EXE_PATH), { recursive: true });

  if (fs.existsSync(NODE_EXE_PATH)) {
    log("✓", "node.exe 已存在，跳过下载");
  } else {
    log("⬇", `正在下载 ${NODE_EXE_URL} ...`);
    try {
      await downloadFile(NODE_EXE_URL, NODE_EXE_PATH);
      const stats = fs.statSync(NODE_EXE_PATH);
      log("✓", `下载完成 (${Math.round(stats.size / 1024 / 1024)}MB)`);
    } catch (err) {
      log("✗", `下载失败: ${err.message}`);
      log("!", `请手动下载 node.exe 放到: ${NODE_EXE_PATH}`);
      log("!", `下载地址: ${NODE_EXE_URL}`);
      process.exit(1);
    }
  }

  // [6/6] 复制到 Tauri 资源目录
  log("6/6", "复制资源到 Tauri 资源目录...");
  const tauriResources = path.join(ROOT, "src-tauri", "resources", "server");
  if (fs.existsSync(tauriResources)) {
    fs.rmSync(tauriResources, { recursive: true, force: true });
  }
  fs.mkdirSync(tauriResources, { recursive: true });
  copyDirSync(standaloneDir, tauriResources);
  log("✓", "已复制 standalone 到 src-tauri/resources/server/");
  log("✓", "node.exe 已就绪");
  log("✓", "构建完成！现在可以运行 'pnpm tauri:build' 打包 EXE");
}

main().catch((err) => {
  console.error("构建失败:", err);
  process.exit(1);
});
