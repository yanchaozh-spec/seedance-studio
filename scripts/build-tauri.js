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

const IS_WINDOWS = process.platform === "win32";

function run(cmd) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

/**
 * 跨平台目录复制
 * Windows 下使用 xcopy（比 robocopy 更宽容）
 * 其他系统使用 cp -r
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    log("!", `源目录不存在，跳过: ${src}`);
    return;
  }

  log(" ", `${src} -> ${dest}`);

  if (IS_WINDOWS) {
    // Windows: 使用 xcopy，/E 递归，/I 假定目标是目录，/Y 静默覆盖，/H 复制隐藏文件
    const srcWin = src.replace(/\//g, "\\");
    const destWin = dest.replace(/\//g, "\\");
    try {
      execSync(
        `xcopy "${srcWin}" "${destWin}\\" /E /I /Y /H /Q`,
        { stdio: "pipe", windowsHide: true }
      );
    } catch (err) {
      // xcopy 非零退出码可能是正常情况（如没有文件需要复制）
      log("!", `xcopy 提示: 退出码 ${err.status || "unknown"}`);
      // 检查目标是否已存在来判断是否真的失败
      if (!fs.existsSync(dest)) {
        throw new Error(`复制失败: ${src} -> ${dest}`);
      }
    }
  } else {
    // macOS/Linux
    execSync(`cp -r "${src}/." "${dest}/"`, { stdio: "inherit" });
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
  console.log(`工作目录: ${ROOT}\n`);

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
    fs.mkdirSync(staticDest, { recursive: true });
    copyDirSync(staticSrc, staticDest);
    log("✓", "已复制 .next/static");
  } else {
    log("!", ".next/static 不存在，跳过");
  }

  const publicSrc = path.join(ROOT, "public");
  const publicDest = path.join(standaloneDir, "public");
  if (fs.existsSync(publicSrc)) {
    fs.mkdirSync(publicDest, { recursive: true });
    copyDirSync(publicSrc, publicDest);
    log("✓", "已复制 public");
  } else {
    log("!", "public 目录不存在，跳过");
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

  // 先清理旧目录
  if (fs.existsSync(tauriResources)) {
    try {
      fs.rmSync(tauriResources, { recursive: true, force: true });
    } catch (e) {
      // Windows 下 rmSync 可能失败，用系统命令删除
      if (IS_WINDOWS) {
        try {
          execSync(`rmdir /S /Q "${tauriResources.replace(/\//g, "\\")}"`, { windowsHide: true });
        } catch (_) {
          // 忽略
        }
      }
    }
  }
  fs.mkdirSync(tauriResources, { recursive: true });
  copyDirSync(standaloneDir, tauriResources);
  log("✓", "已复制 standalone 到 src-tauri/resources/server/");
  log("✓", "node.exe 已就绪");

  // 生成 Tauri 加载页面（out/index.html）
  log("6.5/6", "生成 Tauri 加载页面...");
  const outDir = path.join(ROOT, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const loadingHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>焱超视频工具</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #fff;
      overflow: hidden;
    }
    .container { text-align: center; }
    .spinner {
      width: 48px; height: 48px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: rgba(255,255,255,0.6); }
    .status { margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.4); }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>焱超视频工具</h1>
    <p>正在启动服务，请稍候...</p>
    <div class="status" id="status"></div>
  </div>
  <script>
    // 监听 Tauri 事件（服务器状态通知）
    if (window.__TAURI__) {
      window.__TAURI__.event.listen('server-status', function(event) {
        document.getElementById('status').textContent = event.payload;
      });
    }

    // 自动检测服务器就绪并跳转
    let attempts = 0;
    const maxAttempts = 120;
    const statusEl = document.getElementById('status');

    function checkServer() {
      attempts++;
      statusEl.textContent = '连接中... (' + Math.floor(attempts / 2) + 's)';

      fetch('http://localhost:5000', { method: 'HEAD' })
        .then(function(resp) {
          if (resp.ok || resp.status === 307) {
            statusEl.textContent = '服务已就绪，正在跳转...';
            window.location.href = 'http://localhost:5000';
          } else {
            if (attempts < maxAttempts) {
              setTimeout(checkServer, 500);
            } else {
              statusEl.textContent = '启动超时，请关闭占用端口 5000 的程序，然后重启应用';
            }
          }
        })
        .catch(function() {
          if (attempts < maxAttempts) {
            setTimeout(checkServer, 500);
          } else {
            statusEl.textContent = '启动超时，请关闭占用端口 5000 的程序，然后重启应用';
          }
        });
    }

    setTimeout(checkServer, 1000);
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, "index.html"), loadingHtml, "utf-8");
  log("✓", "已生成 out/index.html（Tauri 加载页面）");
  log("✓", "构建完成！现在可以运行 'pnpm tauri:build' 打包 EXE");
}

main().catch((err) => {
  console.error("构建失败:", err);
  process.exit(1);
});
