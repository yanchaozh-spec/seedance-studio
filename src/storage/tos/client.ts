/**
 * 火山云 TOS (对象存储) 客户端
 * 支持 S3 兼容接口
 * 支持环境变量配置和用户动态配置
 */

import { S3Storage } from "coze-coding-dev-sdk";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// TOS 配置类型
export interface TosConfig {
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
}

// 缓存的存储客户端
let cachedStorage: S3Storage | null = null;
let cachedConfig: TosConfig | null = null;

/**
 * 从环境变量获取配置
 */
function getEnvConfig(): TosConfig {
  return {
    endpoint: process.env.COZE_TOS_ENDPOINT,
    accessKey: process.env.COZE_TOS_ACCESS_KEY || process.env.COZE_TOS_ACCESS_KEY_ID,
    secretKey: process.env.COZE_TOS_SECRET_KEY || process.env.COZE_TOS_SECRET_ACCESS_KEY,
    bucket: process.env.COZE_TOS_BUCKET || process.env.COZE_BUCKET_NAME,
  };
}

/**
 * 检查配置是否有效
 */
function isConfigValid(config: TosConfig): boolean {
  return !!(config.endpoint && config.accessKey && config.secretKey && config.bucket);
}

/**
 * 创建存储客户端
 */
function createStorage(config: TosConfig): S3Storage {
  console.log("[TOS] createStorage - endpoint:", config.endpoint, "bucket:", config.bucket);
  return new S3Storage({
    endpointUrl: config.endpoint!,
    accessKey: config.accessKey!,
    secretKey: config.secretKey!,
    bucketName: config.bucket!,
    region: process.env.COZE_TOS_REGION || "cn-beijing",
  });
}

/**
 * 获取 TOS 存储客户端（单例，基于环境变量）
 */
export function getTosStorage(): S3Storage | null {
  const config = getEnvConfig();
  
  if (!isConfigValid(config)) {
    return null;
  }

  // 如果缓存的配置相同，返回缓存
  if (cachedStorage && cachedConfig && 
      cachedConfig.endpoint === config.endpoint &&
      cachedConfig.accessKey === config.accessKey &&
      cachedConfig.bucket === config.bucket) {
    return cachedStorage;
  }

  // 创建新客户端
  cachedStorage = createStorage(config);
  cachedConfig = config;
  console.log("[TOS] Storage client initialized from environment");
  return cachedStorage;
}

/**
 * 创建临时存储客户端（用于用户动态配置）
 */
export function createTosStorage(config: TosConfig): S3Storage {
  if (!isConfigValid(config)) {
    throw new Error("TOS 配置不完整，请填写所有必填项");
  }
  return createStorage(config);
}

/**
 * 检查 TOS 是否已配置（基于环境变量）
 */
export function isTosConfigured(): boolean {
  return isConfigValid(getEnvConfig());
}

/**
 * 检查用户配置是否有效
 */
export function isUserTosConfigured(config: TosConfig | null): boolean {
  return !!config && isConfigValid(config);
}

/**
 * 上传素材文件
 * @param buffer 文件内容
 * @param fileName 文件名
 * @param contentType MIME 类型
 * @param projectId 项目 ID（用于组织文件路径）
 * @param type 素材类型（image/audio/keyframe）
 * @param config 可选的用户配置
 */
export async function uploadAsset(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  projectId: string,
  type: "image" | "audio" | "keyframe",
  config?: TosConfig
): Promise<{ key: string; url: string }> {
  // 详细日志：打印用户配置信息
  console.log("[TOS] uploadAsset called with config:", {
    hasConfig: !!config,
    endpoint: config?.endpoint,
    accessKey: config?.accessKey ? "***" + config.accessKey.slice(-4) : undefined,
    bucket: config?.bucket,
    hasSecretKey: !!config?.secretKey,
  });

  let storage: S3Storage | null = null;
  let s3Client: S3Client | null = null;
  let userBucket: string | undefined = undefined;
  let useNativeUpload = false; // 是否使用原生 AWS S3 SDK
  
  if (config) {
    // 使用用户配置创建 AWS S3 客户端
    userBucket = config.bucket;
    
    // 确保 endpoint 有协议前缀
    let endpointUrl = config.endpoint || "";
    if (endpointUrl && !endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
      endpointUrl = "https://" + endpointUrl;
    }
    
    // 火山 TOS: 普通 endpoint 格式为 tos-cn-beijing.volces.com
    // S3 兼容 endpoint 格式为 tos-s3-cn-beijing.volces.com
    // AWS S3 SDK 必须使用 S3 Endpoint
    endpointUrl = endpointUrl
      .replace("://tos-cn-", "://tos-s3-cn-")
      .replace("://tos-guangzhou-", "://tos-s3-guangzhou-")
      .replace("://tos-shanghai-", "://tos-s3-shanghai-")
      .replace("://tos-ap-", "://tos-s3-ap-")
      .replace(".volces.com", ".volces.com") // 保持不变
      .replace(".ivolces.com", ".ivolces.com"); // 保持不变
    
    s3Client = new S3Client({
      region: process.env.COZE_TOS_REGION || "cn-beijing",
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: config.accessKey!,
        secretAccessKey: config.secretKey!,
      },
      forcePathStyle: true, // S3 兼容模式必须
    });
    useNativeUpload = true;
    console.log("[TOS] Using native AWS S3 SDK with S3 Endpoint:", endpointUrl, "bucket:", userBucket);
  } else {
    // 使用环境变量配置的存储
    storage = getTosStorage();
    console.log("[TOS] Using SDK for platform storage");
  }
  
  if (!storage && !s3Client) {
    throw new Error("TOS not configured");
  }
  
  // 生成路径：assets/{projectId}/{type}/{timestamp}-{uuid}.{ext}
  const ext = fileName.split(".").pop() || "bin";
  const key = `assets/${projectId}/${type}/${Date.now()}.${ext}`;
  
  console.log("[TOS] Uploading to key:", key, "with contentType:", contentType);
  
  let uploadResult: string;
  
  if (useNativeUpload && s3Client && userBucket) {
    // 使用原生 AWS S3 SDK 上传
    console.log("[TOS] Using native PutObjectCommand");
    const putCommand = new PutObjectCommand({
      Bucket: userBucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await s3Client.send(putCommand);
    uploadResult = key;
    console.log("[TOS] Native upload successful, key:", uploadResult);
    
    // 使用原生 AWS S3 SDK 生成签名 URL
    console.log("[TOS] Generating presigned URL using native AWS S3 SDK for bucket:", userBucket);
    const getCommand = new GetObjectCommand({
      Bucket: userBucket,
      Key: uploadResult,
    });
    const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 7 * 24 * 60 * 60 }); // 7 天
    console.log("[TOS] Native presigned URL generated");
    return { key: uploadResult, url };
  }
  
  // 使用 SDK 上传（平台存储）
  if (!storage) {
    throw new Error("TOS not configured");
  }
  
  uploadResult = await storage.uploadFile({
    fileContent: buffer,
    fileName: key,
    contentType,
    bucket: userBucket,
  });

  console.log("[TOS] SDK upload result key:", uploadResult);

  // 使用 SDK 的 generatePresignedUrl
  console.log("[TOS] Using SDK generatePresignedUrl for platform storage");
  const url = await storage.generatePresignedUrl({
    key: uploadResult,
    bucket: userBucket,
    expireTime: 7 * 24 * 60 * 60,
  });

  console.log("[TOS] Generated URL:", url);

  return { key: uploadResult, url };
}

/**
 * 上传视频文件
 * @param bufferOrUrl 视频内容或 URL
 * @param taskId 任务 ID（用于组织文件路径）
 * @param isUrl 是否为 URL（如果是 URL 则下载后上传）
 * @param config 可选的用户配置
 */
export async function uploadVideo(
  bufferOrUrl: Buffer | string,
  taskId: string,
  isUrl: boolean = false,
  config?: TosConfig
): Promise<{ key: string; url: string }> {
  const storage = config 
    ? createTosStorage(config) 
    : getTosStorage();
  
  if (!storage) {
    throw new Error("TOS not configured");
  }
  
  let key: string;
  
  if (isUrl && typeof bufferOrUrl === "string") {
    // 从 URL 下载并上传
    console.log("[TOS] Downloading video from URL:", bufferOrUrl);
    key = await storage.uploadFromUrl({
      url: bufferOrUrl,
      timeout: 60000,
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
    expireTime: 7 * 24 * 60 * 60,
  });

  return { key, url };
}

/**
 * 生成文件访问 URL
 * @param key 存储的 key
 * @param expireSeconds 过期时间（秒）
 * @param config 可选的用户配置
 */
export async function getFileUrl(
  key: string,
  expireSeconds: number = 7 * 24 * 60 * 60,
  config?: TosConfig
): Promise<string> {
  const storage = config 
    ? createTosStorage(config) 
    : getTosStorage();
  
  if (!storage) {
    throw new Error("TOS not configured");
  }
  
  return storage.generatePresignedUrl({
    key,
    expireTime: expireSeconds,
  });
}

/**
 * 删除文件
 * @param key 存储的 key
 * @param config 可选的用户配置
 */
export async function deleteFile(key: string, config?: TosConfig): Promise<boolean> {
  const storage = config 
    ? createTosStorage(config) 
    : getTosStorage();
  
  if (!storage) {
    throw new Error("TOS not configured");
  }
  
  return storage.deleteFile({ fileKey: key });
}
