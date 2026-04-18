/**
 * Seedance API 请求体构建工具
 * 前后端共享的请求参数构建逻辑
 */

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
