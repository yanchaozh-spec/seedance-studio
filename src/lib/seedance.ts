/**
 * Seedance API 请求体构建工具
 * 前后端共享的请求参数构建逻辑
 */

import { getAssetKind, type AssetKindInput, type AssetType, type AssetCategory } from "./assets";

export interface SeedanceParams {
  ratio: string;
  duration: number;
  resolution: string;
  return_last_frame?: boolean;
  tools?: Array<{ type: "web_search" }>;
}

/**
 * 通用的 Content Item 类型（兼容前端和后端的各种格式）
 */
export type SeedanceContentItem = Record<string, unknown>;

/**
 * 统一的素材输入接口，前后端均可使用
 */
export interface SeedanceAssetInput {
  id: string;
  url: string;
  type: string;
  display_name?: string;
  name: string;
  asset_category?: string;
  asset_id?: string;
  bound_audio_id?: string;
  keyframe_description?: string;
  is_keyframe?: boolean;
  isActivated?: boolean;
}

/**
 * 提示词框接口
 */
export interface SeedancePromptBox {
  content: string;
  order: number;
  keyframeDescription?: string;
  assetId?: string;
}

/**
 * 构建 Seedance Content 的共享函数
 * 前端预览和后端 API 调用共用同一逻辑
 *
 * @param assets - 所有素材列表（仅使用激活的素材）
 * @param promptBoxes - 提示词框列表
 * @param onlyActivated - 是否只使用激活的素材（前端传 true，后端传 false 因为后端已预筛选）
 */
export function buildSeedanceContent(
  assets: SeedanceAssetInput[],
  promptBoxes: SeedancePromptBox[],
  onlyActivated: boolean = true
): SeedanceContentItem[] {
  const content: SeedanceContentItem[] = [];
  const activatedAssets = onlyActivated
    ? assets.filter((a) => a.isActivated !== false)
    : assets;

  // 按类型分类素材
  const VALID_ASSET_TYPES = new Set<string>(["image", "audio", "video", "keyframe", "virtual_avatar"]);
  const VALID_CATEGORIES = new Set<string>(["keyframe", "image", "audio", "video"]);

  const toKindInput = (a: SeedanceAssetInput): AssetKindInput => ({
    type: (VALID_ASSET_TYPES.has(a.type) ? a.type : "image") as AssetType,
    asset_category: a.asset_category && VALID_CATEGORIES.has(a.asset_category) ? a.asset_category as AssetCategory : undefined,
    is_keyframe: a.is_keyframe,
  });

  // 预计算每个素材的 AssetKind，避免重复调用 getAssetKind
  const kindMap = new Map(activatedAssets.map((a) => [a.id, getAssetKind(toKindInput(a))]));
  const imageAssets = activatedAssets.filter((a) => kindMap.get(a.id) === "image");
  const keyframeAssets = activatedAssets.filter((a) => kindMap.get(a.id) === "keyframe");
  const virtualAvatarAssets = activatedAssets.filter((a) => kindMap.get(a.id) === "virtualAvatar");
  const audioAssets = activatedAssets.filter((a) => kindMap.get(a.id) === "audio");
  const videoAssets = activatedAssets.filter((a) => kindMap.get(a.id) === "video");

  // 所有图片类素材：关键帧在前，然后普通图片，最后虚拟人像
  const allImageAssets = [...keyframeAssets, ...imageAssets, ...virtualAvatarAssets];

  // 音频排序：已绑定的在前，未绑定的在后
  const usedAudioIds = new Set<string>();
  for (const asset of allImageAssets) {
    if (asset.bound_audio_id) {
      usedAudioIds.add(asset.bound_audio_id);
    }
  }
  const allAudioAssets = [
    ...audioAssets.filter((a) => usedAudioIds.has(a.id)),
    ...audioAssets.filter((a) => !usedAudioIds.has(a.id)),
  ];

  // 构建引用序号映射
  const imageRefMap = new Map<string, string>();
  let imageIndex = 0;
  for (const asset of allImageAssets) {
    imageIndex++;
    imageRefMap.set(asset.id, `图片${imageIndex}`);
  }

  const audioRefMap = new Map<string, string>();
  let audioIndex = 0;
  for (const audio of allAudioAssets) {
    audioIndex++;
    audioRefMap.set(audio.id, `音频${audioIndex}`);
  }

  const videoRefMap = new Map<string, string>();
  let videoIndex = 0;
  for (const video of videoAssets) {
    videoIndex++;
    videoRefMap.set(video.id, `视频${videoIndex}`);
  }

  // 反向映射: displayName → refName，用于提示词中 @角色名 替换
  const nameToRefMap = new Map<string, string>();
  for (const asset of allImageAssets) {
    const refName = imageRefMap.get(asset.id)!;
    const displayName = asset.display_name || asset.name;
    nameToRefMap.set(displayName, refName);
  }
  for (const audio of allAudioAssets) {
    const refName = audioRefMap.get(audio.id)!;
    const displayName = audio.display_name || audio.name;
    nameToRefMap.set(displayName, refName);
  }
  for (const video of videoAssets) {
    const refName = videoRefMap.get(video.id)!;
    const displayName = video.display_name || video.name;
    nameToRefMap.set(displayName, refName);
  }

  /**
   * 替换提示词中的 @角色名 为对应引用格式
   * Seedance API 要求：提示词中使用"素材类型+序号"引用
   * 按名字长度降序替换，避免短名误替换长名
   */
  function replaceMentions(text: string): string {
    const sortedNames = [...nameToRefMap.keys()].sort((a, b) => b.length - a.length);
    let result = text;
    for (const name of sortedNames) {
      const ref = nameToRefMap.get(name)!;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`@${escaped}`, "g");
      result = result.replace(regex, `${ref}(${name})`);
    }
    return result;
  }

  // 构建素材定义行
  const assetDefParts: string[] = [];

  for (const asset of keyframeAssets) {
    const refName = imageRefMap.get(asset.id)!;
    const desc = asset.keyframe_description || asset.display_name || asset.name;
    assetDefParts.push(`${refName}为${desc}`);
  }

  for (const asset of imageAssets) {
    const refName = imageRefMap.get(asset.id)!;
    const displayName = asset.display_name || asset.name;
    if (asset.bound_audio_id && audioRefMap.has(asset.bound_audio_id)) {
      const audioRef = audioRefMap.get(asset.bound_audio_id)!;
      assetDefParts.push(`${refName}为${displayName}，声线为${audioRef}`);
    } else {
      assetDefParts.push(`${refName}为${displayName}`);
    }
  }

  for (const asset of virtualAvatarAssets) {
    const refName = imageRefMap.get(asset.id)!;
    const displayName = asset.display_name || asset.name;
    if (asset.asset_id) {
      let defPart = `@${refName} 为 ${displayName}（资产 ID: [${asset.asset_id}]）`;
      if (asset.bound_audio_id && audioRefMap.has(asset.bound_audio_id)) {
        const audioRef = audioRefMap.get(asset.bound_audio_id)!;
        defPart += `，声线为${audioRef}`;
      }
      assetDefParts.push(defPart);
    } else {
      assetDefParts.push(`${refName}为${displayName}`);
    }
  }

  // 视频素材定义
  for (const video of videoAssets) {
    const refName = videoRefMap.get(video.id)!;
    const displayName = video.display_name || video.name;
    assetDefParts.push(`${refName}为${displayName}`);
  }

  // 构建文本内容
  const textParts: string[] = [];
  if (assetDefParts.length > 0) {
    textParts.push(assetDefParts.join("；"));
  }

  const sortedBoxes = promptBoxes
    .filter((box) => box.content.trim())
    .sort((a, b) => a.order - b.order);

  for (const box of sortedBoxes) {
    if (box.content.trim()) {
      textParts.push(replaceMentions(box.content.trim()));
    }
  }

  if (textParts.length > 0) {
    content.push({
      type: "text",
      text: textParts.join("\n"),
    });
  }

  // 按 allImageAssets 顺序添加所有图片
  for (const asset of allImageAssets) {
    const imageUrl = asset.type === "virtual_avatar" && asset.asset_id
      ? (asset.asset_id.startsWith("asset://") ? asset.asset_id : `asset://${asset.asset_id}`)
      : asset.url;
    content.push({
      type: "image_url",
      image_url: { url: imageUrl },
      role: "reference_image",
    });
  }

  // 添加所有视频
  for (const video of videoAssets) {
    content.push({
      type: "video_url",
      video_url: { url: video.url },
      role: "reference_video",
    });
  }

  // 添加所有音频（已绑定的在前，独立的在后）
  for (const audio of allAudioAssets) {
    content.push({
      type: "audio_url",
      audio_url: { url: audio.url },
      role: "reference_audio",
    });
  }

  return content;
}

/**
 * 构建 Seedance API 请求体
 */
export function buildSeedanceRequestBody(
  modelId: string,
  content: SeedanceContentItem[],
  params: SeedanceParams
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: modelId,
    content,
    generate_audio: true,
    ratio: params.ratio,
    duration: params.duration,
    resolution: params.resolution,
    watermark: false,
    return_last_frame: params.return_last_frame ?? false,
  };

  // 联网搜索工具
  if (params.tools && params.tools.length > 0) {
    requestBody.tools = params.tools;
  }

  return requestBody;
}
