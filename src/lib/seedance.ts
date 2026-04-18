/**
 * Seedance API 请求体构建工具
 * 前后端共享的请求参数构建逻辑
 */

export interface SeedanceParams {
  ratio: string;
  duration: number;
  resolution: string;
  return_last_frame?: boolean;
  service_tier?: "default" | "flex";
  tools?: Array<{ type: "web_search" }>;
  model_id?: string;
}

/**
 * 通用的 Content Item 类型（兼容前端和后端的各种格式）
 */
export type SeedanceContentItem = Record<string, unknown>;

/**
 * 检查是否为 Seedance 2.0 模型
 */
export function isSeedance2Model(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes("seedance-2-0") || id.includes("seedance-2.0");
}

/**
 * 构建 Seedance API 请求体
 * 自动处理 seedance 2.0 模型不支持 service_tier 的问题
 */
export function buildSeedanceRequestBody(
  modelId: string,
  content: SeedanceContentItem[],
  params: SeedanceParams
): Record<string, unknown> {
  const isS2 = isSeedance2Model(modelId);

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

  // service_tier 仅非 seedance 2.0 模型支持
  if (!isS2 && params.service_tier) {
    requestBody.service_tier = params.service_tier;
  }

  // 联网搜索工具
  if (params.tools && params.tools.length > 0) {
    requestBody.tools = params.tools;
  }

  return requestBody;
}
