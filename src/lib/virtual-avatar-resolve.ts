/**
 * 虚拟人像缩略图解析工具
 * 从全局人像库获取缩略图，项目内虚拟人像统一使用全局库的缩略图
 */

import type { GlobalAvatar } from "@/lib/global-avatars";

/**
 * 获取虚拟人像的缩略图 URL
 * 优先从全局人像库取，fallback 到 asset 自身的 thumbnail_url
 *
 * @param assetAssetId 虚拟人像的 asset_id（如 asset-20260310030618-88hlb）
 * @param assetThumbnailUrl 虚拟人像自身的 thumbnail_url（fallback）
 * @param globalAvatars 全局人像库数据
 * @returns 缩略图 URL 或 null
 */
export function resolveVirtualAvatarThumbnail(
  assetAssetId: string | null | undefined,
  assetThumbnailUrl: string | null | undefined,
  globalAvatars: GlobalAvatar[]
): string | null {
  if (!assetAssetId) return assetThumbnailUrl || null;
  const globalAvatar = globalAvatars.find((g) => g.asset_id === assetAssetId);
  return globalAvatar?.thumbnail_url || assetThumbnailUrl || null;
}
