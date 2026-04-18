#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

NODE_VERSION="20.18.0"
NODE_EXE_URL="https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe"
NODE_EXE_PATH="${COZE_WORKSPACE_PATH}/src-tauri/resources/node.exe"

echo "=== Tauri 构建脚本 ==="

echo "[1/6] 安装依赖..."
pnpm install --prefer-frozen-lockfile

echo "[2/6] 构建 Next.js (standalone 模式)..."
pnpm next build

echo "[3/6] 定位 standalone 输出目录..."
STANDALONE_ROOT="${COZE_WORKSPACE_PATH}/.next/standalone"
SERVER_JS=$(find "${STANDALONE_ROOT}" -name "server.js" -not -path "*/node_modules/*" | head -1)

if [ -z "${SERVER_JS}" ]; then
  echo "  ✗ 未找到 standalone server.js，请检查 next.config.ts 是否配置了 output: 'standalone'"
  exit 1
fi

STANDALONE_DIR=$(dirname "${SERVER_JS}")
echo "  ✓ 找到 standalone 目录: ${STANDALONE_DIR}"

echo "[4/6] 补全 standalone 输出目录..."
if [ -d "${COZE_WORKSPACE_PATH}/.next/static" ]; then
  mkdir -p "${STANDALONE_DIR}/.next/static"
  cp -r "${COZE_WORKSPACE_PATH}/.next/static/." "${STANDALONE_DIR}/.next/static/"
  echo "  ✓ 已复制 .next/static"
fi

if [ -d "${COZE_WORKSPACE_PATH}/public" ]; then
  mkdir -p "${STANDALONE_DIR}/public"
  cp -r "${COZE_WORKSPACE_PATH}/public/." "${STANDALONE_DIR}/public/"
  echo "  ✓ 已复制 public"
fi

echo "[5/6] 下载 Node.js 便携版 (v${NODE_VERSION})..."
mkdir -p "$(dirname "${NODE_EXE_PATH}")"

if [ -f "${NODE_EXE_PATH}" ]; then
  echo "  ✓ node.exe 已存在，跳过下载"
else
  echo "  正在下载 ${NODE_EXE_URL} ..."
  curl -L -o "${NODE_EXE_PATH}" "${NODE_EXE_URL}"
  if [ $? -eq 0 ] && [ -f "${NODE_EXE_PATH}" ]; then
    FILE_SIZE=$(stat -f%z "${NODE_EXE_PATH}" 2>/dev/null || stat -c%s "${NODE_EXE_PATH}" 2>/dev/null || echo "0")
    echo "  ✓ 下载完成 (${FILE_SIZE} bytes)"
  else
    echo "  ✗ 下载失败！请手动下载 node.exe 放到: ${NODE_EXE_PATH}"
    echo "    下载地址: ${NODE_EXE_URL}"
    exit 1
  fi
fi

echo "[6/6] 复制资源到 Tauri 资源目录..."
TAURI_RESOURCES="${COZE_WORKSPACE_PATH}/src-tauri/resources/server"
rm -rf "${TAURI_RESOURCES}"
mkdir -p "${TAURI_RESOURCES}"
cp -r "${STANDALONE_DIR}/." "${TAURI_RESOURCES}/"
echo "  ✓ 已复制 standalone 到 src-tauri/resources/server/"
echo "  ✓ node.exe 已就绪"
echo "  ✓ 构建完成！现在可以运行 'pnpm tauri:build' 打包 EXE"
