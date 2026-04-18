#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "=== Tauri 构建脚本 ==="

echo "[1/5] 安装依赖..."
pnpm install --prefer-frozen-lockfile

echo "[2/5] 构建 Next.js (standalone 模式)..."
pnpm next build

echo "[3/5] 定位 standalone 输出目录..."
# Next.js standalone 会保留原始路径结构，需要找到实际的 server.js 位置
STANDALONE_ROOT="${COZE_WORKSPACE_PATH}/.next/standalone"
SERVER_JS=$(find "${STANDALONE_ROOT}" -name "server.js" -not -path "*/node_modules/*" | head -1)

if [ -z "${SERVER_JS}" ]; then
  echo "  ✗ 未找到 standalone server.js，请检查 next.config.ts 是否配置了 output: 'standalone'"
  exit 1
fi

# server.js 所在目录就是 standalone 的根
STANDALONE_DIR=$(dirname "${SERVER_JS}")
echo "  ✓ 找到 standalone 目录: ${STANDALONE_DIR}"

echo "[4/5] 补全 standalone 输出目录..."
# 复制 .next/static 到 standalone/.next/static
if [ -d "${COZE_WORKSPACE_PATH}/.next/static" ]; then
  mkdir -p "${STANDALONE_DIR}/.next/static"
  cp -r "${COZE_WORKSPACE_PATH}/.next/static/." "${STANDALONE_DIR}/.next/static/"
  echo "  ✓ 已复制 .next/static"
fi

# 复制 public 到 standalone/public
if [ -d "${COZE_WORKSPACE_PATH}/public" ]; then
  mkdir -p "${STANDALONE_DIR}/public"
  cp -r "${COZE_WORKSPACE_PATH}/public/." "${STANDALONE_DIR}/public/"
  echo "  ✓ 已复制 public"
fi

echo "[5/5] 复制 standalone 到 Tauri 资源目录..."
TAURI_RESOURCES="${COZE_WORKSPACE_PATH}/src-tauri/resources/server"
rm -rf "${TAURI_RESOURCES}"
mkdir -p "${TAURI_RESOURCES}"
cp -r "${STANDALONE_DIR}/." "${TAURI_RESOURCES}/"
echo "  ✓ 已复制到 src-tauri/resources/server/"
echo "  ✓ 构建完成！现在可以运行 'pnpm tauri:build' 打包 EXE"
