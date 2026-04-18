/**
 * 火山云 TOS (对象存储) 客户端
 * 支持 S3 兼容接口
 */

import { S3Storage } from "coze-coding-dev-sdk";

// TOS 配置
// 用户需要设置以下环境变量：
// - COZE_TOS_ENDPOINT: TOS 端点，如 https://tos-cn-beijing.volces.com
// - COZE_TOS_ACCESS_KEY: 访问密钥 ID
// - COZE_TOS_SECRET_KEY: 访问密钥 Secret
// - COZE_TOS_BUCKET: 存储桶名称

let tosStorage: S3Storage | null = null;

/**
 * 获取 TOS 存储客户端（单例）
 */
export function getTosStorage(): S3Storage {
  if (tosStorage) {
    return tosStorage;
  }

  const endpointUrl = process.env.COZE_TOS_ENDPOINT;
  const accessKey = process.env.COZE_TOS_ACCESS_KEY || process.env.COZE_TOS_ACCESS_KEY_ID;
  const secretKey = process.env.COZE_TOS_SECRET_KEY || process.env.COZE_TOS_SECRET_ACCESS_KEY;
  const bucketName = process.env.COZE_TOS_BUCKET || process.env.COZE_BUCKET_NAME;

  // 如果没有配置，返回 null
  if (!endpointUrl || !accessKey || !secretKey || !bucketName) {
    console.warn("[TOS] Storage not configured. Please set COZE_TOS_* environment variables.");
    // 返回一个 mock 对象，避免代码崩溃
    return createMockStorage();
  }

  tosStorage = new S3Storage({
    endpointUrl,
    accessKey,
    secretKey,
    bucketName,
    region: process.env.COZE_TOS_REGION || "cn-beijing",
  });

  console.log("[TOS] Storage client initialized successfully");
  return tosStorage;
}

/**
 * 检查 TOS 是否已配置
 */
export function isTosConfigured(): boolean {
  const endpointUrl = process.env.COZE_TOS_ENDPOINT;
  const accessKey = process.env.COZE_TOS_ACCESS_KEY || process.env.COZE_TOS_ACCESS_KEY_ID;
  const secretKey = process.env.COZE_TOS_SECRET_KEY || process.env.COZE_TOS_SECRET_ACCESS_KEY;
  const bucketName = process.env.COZE_TOS_BUCKET || process.env.COZE_BUCKET_NAME;
  
  return !!(endpointUrl && accessKey && secretKey && bucketName);
}

/**
 * 创建 Mock Storage（当未配置时使用）
 */
function createMockStorage(): S3Storage {
  console.warn("[TOS] Using mock storage - uploads will fail!");
  // 返回一个 mock 实现，抛出错误提示未配置
  return {
    uploadFile: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    streamUploadFile: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    uploadFromUrl: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    generatePresignedUrl: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    readFile: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    deleteFile: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    fileExists: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    listFiles: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
    chunkUploadFile: async () => {
      throw new Error("TOS not configured. Please set COZE_TOS_* environment variables.");
    },
  } as unknown as S3Storage;
}

/**
 * 生成访问 URL 的有效期（秒）
 * 默认 7 天，方便用户查看
 */
export const DEFAULT_URL_EXPIRE_SECONDS = 7 * 24 * 60 * 60; // 7 天

/**
 * 上传素材文件
 * @param buffer 文件内容
 * @param fileName 文件名
 * @param contentType MIME 类型
 * @param projectId 项目 ID（用于组织文件路径）
 * @param type 素材类型（image/audio/keyframe）
 */
export async function uploadAsset(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  projectId: string,
  type: "image" | "audio" | "keyframe"
): Promise<{ key: string; url: string }> {
  const storage = getTosStorage();
  
  // 生成路径：assets/{projectId}/{type}/{timestamp}-{uuid}.{ext}
  const ext = fileName.split(".").pop() || "bin";
  const key = await storage.uploadFile({
    fileContent: buffer,
    fileName: `assets/${projectId}/${type}/${Date.now()}.${ext}`,
    contentType,
  });

  // 生成签名 URL（默认 7 天有效期）
  const url = await storage.generatePresignedUrl({
    key,
    expireTime: DEFAULT_URL_EXPIRE_SECONDS,
  });

  return { key, url };
}

/**
 * 上传视频文件
 * @param bufferOrUrl 视频内容或 URL
 * @param taskId 任务 ID（用于组织文件路径）
 * @param isUrl 是否为 URL（如果是 URL 则下载后上传）
 */
export async function uploadVideo(
  bufferOrUrl: Buffer | string,
  taskId: string,
  isUrl: boolean = false
): Promise<{ key: string; url: string }> {
  const storage = getTosStorage();
  
  let key: string;
  
  if (isUrl && typeof bufferOrUrl === "string") {
    // 从 URL 下载并上传
    console.log("[TOS] Downloading video from URL:", bufferOrUrl);
    key = await storage.uploadFromUrl({
      url: bufferOrUrl,
      timeout: 60000, // 60 秒超时
    });
  } else {
    // 直接上传 buffer
    const buffer = bufferOrUrl as Buffer;
    key = await storage.uploadFile({
      fileContent: buffer,
      fileName: `videos/${taskId}.mp4`,
      contentType: "video/mp4",
    });
  }

  // 生成签名 URL（默认 7 天有效期）
  const url = await storage.generatePresignedUrl({
    key,
    expireTime: DEFAULT_URL_EXPIRE_SECONDS,
  });

  return { key, url };
}

/**
 * 生成文件访问 URL
 * @param key 存储的 key
 * @param expireSeconds 过期时间（秒）
 */
export async function getFileUrl(
  key: string,
  expireSeconds: number = DEFAULT_URL_EXPIRE_SECONDS
): Promise<string> {
  const storage = getTosStorage();
  return storage.generatePresignedUrl({
    key,
    expireTime: expireSeconds,
  });
}

/**
 * 删除文件
 * @param key 存储的 key
 */
export async function deleteFile(key: string): Promise<boolean> {
  const storage = getTosStorage();
  return storage.deleteFile({ fileKey: key });
}
