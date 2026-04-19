/**
 * Slug 生成工具
 * 将项目名转为 ASCII 安全的路径段，用于 TOS 存储路径
 */

import { pinyin } from "pinyin-pro";

/**
 * 从项目名生成 TOS 路径 slug
 * 规则：
 * - ID 前 8 位 + "_" + 名称转换
 * - 中文字符 → 拼音首字母大写
 * - 英文/数字 → 原样保留
 * - 空格/符号 → 跳过
 * - 如果名称部分为空，用 "proj" 兜底
 *
 * @example
 *   generateSlug("婚礼视频", "d4c1c0950f0fa974") => "d4c1c095_HLSP"
 *   generateSlug("Updated Project", "d4c1c0950f0fa974") => "d4c1c095_UpdatedProject"
 *   generateSlug("Project婚礼", "d4c1c0950f0fa974") => "d4c1c095_ProjectHL"
 *   generateSlug("视频V2", "e5f6a7b8") => "e5f6a7b8_SPV2"
 */
export function generateSlug(name: string, id: string): string {
  const idPrefix = id.slice(0, 8);

  let label = "";
  for (const char of name) {
    if (/[a-zA-Z0-9]/.test(char)) {
      label += char;
    } else if (/[\u4e00-\u9fff]/.test(char)) {
      // 中文 → 拼音首字母大写
      const initial = pinyin(char, { pattern: "first", toneType: "none" });
      label += initial.toUpperCase();
    }
    // 其他字符（空格、符号等）跳过
  }

  return `${idPrefix}_${label || "proj"}`;
}

/**
 * 构建 TOS 存储路径前缀
 * @param slug 项目的 slug
 * @returns projects/{slug}/
 */
export function getProjectPath(slug: string): string {
  return `projects/${slug}/`;
}

/**
 * 构建素材 TOS 存储路径
 * @param slug 项目的 slug
 * @param type 素材类型
 * @returns projects/{slug}/assets/{type}/
 */
export function getAssetPath(slug: string, type: "image" | "audio" | "video" | "keyframe"): string {
  return `projects/${slug}/assets/${type}/`;
}

/**
 * 构建视频 TOS 存储路径
 * @param slug 项目的 slug
 * @returns projects/{slug}/videos/
 */
export function getVideoPath(slug: string): string {
  return `projects/${slug}/videos/`;
}

/**
 * 构建全局人像缩略图路径
 * @param assetId 虚拟人像的 Asset ID
 * @param ext 文件扩展名
 * @returns global-avatars/thumbnails/{assetId}.{ext}
 */
export function getGlobalAvatarThumbnailPath(assetId: string, ext: string): string {
  return `global-avatars/thumbnails/${assetId}.${ext}`;
}
