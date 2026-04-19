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
  // 确保使用外网域名（volces.com），替换内网域名（ivolces.com）
  // 云部署环境变量可能注入内网 endpoint，EXE 环境下用户无法访问内网
  const endpoint = process.env.COZE_TOS_ENDPOINT?.replace(".ivolces.com", ".volces.com");
  return {
    endpoint,
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
  // 确保使用外网域名（volces.com），替换内网域名（ivolces.com）
  // 用户可能从火山云控制台复制了内网 endpoint
  const endpointUrl = config.endpoint?.replace(".ivolces.com", ".volces.com");
  console.log("[TOS] createStorage - endpoint:", endpointUrl, "bucket:", config.bucket);
  return new S3Storage({
    endpointUrl: endpointUrl!,
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
 * @param projectId 项目 ID（用于查找 slug 构建路径）
 * @param type 素材类型（image/audio/keyframe/video）
 * @param config 可选的用户配置
 */
export async function uploadAsset(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  projectId: string,
  type: "image" | "audio" | "keyframe" | "video",
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
    
    // 直接使用用户提供的 endpoint（不自动转换）
    let endpointUrl = config.endpoint || "";
    if (endpointUrl && !endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
      endpointUrl = "https://" + endpointUrl;
    }
    
    // 确保使用外网 endpoint（volces.com）而不是内网（ivolces.com）
    // 因为浏览器需要从外网访问签名 URL
    endpointUrl = endpointUrl.replace(".ivolces.com", ".volces.com");
    
    s3Client = new S3Client({
      region: process.env.COZE_TOS_REGION || "cn-beijing",
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: config.accessKey!,
        secretAccessKey: config.secretKey!,
      },
    });
    useNativeUpload = true;
    console.log("[TOS] Using native AWS S3 SDK with endpoint:", endpointUrl, "bucket:", userBucket);
  } else {
    // 使用环境变量配置的存储
    storage = getTosStorage();
    console.log("[TOS] Using SDK for platform storage");
  }
  
  if (!storage && !s3Client) {
    throw new Error("TOS not configured");
  }
  
  // 生成路径
  const ext = fileName.split(".").pop() || "bin";
  let key: string;
  if (projectId === "global-avatars") {
    // 全局人像缩略图使用独立路径
    key = `global-avatars/thumbnails/${Date.now()}.${ext}`;
  } else {
    // 项目素材使用 slug 路径
    const slug = await getProjectSlug(projectId);
    key = slug
      ? `projects/${slug}/assets/${type}/${Date.now()}.${ext}`
      : `assets/${projectId}/${type}/${Date.now()}.${ext}`; // 兼容旧路径
  }
  
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
    // 火山 TOS 使用虚拟主机风格: https://bucket.endpoint/key
    console.log("[TOS] Generating presigned URL using native AWS S3 SDK for bucket:", userBucket);
    const getCommand = new GetObjectCommand({
      Bucket: userBucket,
      Key: uploadResult,
    });
    
    // S3Client 与 GetObjectCommand 与 getSignedUrl 之间存在 @smithy/types 版本冲突 (4.12 vs 4.14)，
    // 导致类型不兼容。运行时行为正确，使用类型断言绕过。
    const url = await getSignedUrl(
      s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      getCommand as unknown as Parameters<typeof getSignedUrl>[1],
      { expiresIn: 7 * 24 * 60 * 60 }
    );
    
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
 * @param projectId 项目 ID（用于查找 slug 构建路径）
 * @param isUrl 是否为 URL（如果是 URL 则下载后上传）
 * @param config 可选的用户配置
 */
export async function uploadVideo(
  bufferOrUrl: Buffer | string,
  taskId: string,
  projectId: string,
  isUrl: boolean = false,
  config?: TosConfig
): Promise<{ key: string; url: string }> {
  // 如果有用户配置，使用原生 AWS S3 SDK
  if (config && isUserTosConfigured(config)) {
    let endpointUrl = config.endpoint || "";
    if (endpointUrl && !endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
      endpointUrl = "https://" + endpointUrl;
    }
    // 确保使用外网 endpoint
    endpointUrl = endpointUrl.replace(".ivolces.com", ".volces.com");

    const s3Client = new S3Client({
      region: process.env.COZE_TOS_REGION || "cn-beijing",
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: config.accessKey!,
        secretAccessKey: config.secretKey!,
      },
    });
    
    let buffer: Buffer;
    
    if (isUrl && typeof bufferOrUrl === "string") {
      // 从 URL 下载
      console.log("[TOS] Downloading video from URL:", bufferOrUrl);
      const response = await fetch(bufferOrUrl);
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      buffer = bufferOrUrl as Buffer;
    }
    
    // 使用 slug 路径（如果有 slug）
    const slug = await getProjectSlug(projectId);
    const key = slug
      ? `projects/${slug}/videos/${taskId}.mp4`
      : `videos/${taskId}.mp4`;
    
    // 使用原生 SDK 上传
    const putCommand = new PutObjectCommand({
      Bucket: config.bucket!,
      Key: key,
      Body: buffer,
      ContentType: "video/mp4",
    });
    await s3Client.send(putCommand);
    
    // 生成签名 URL
    const getCommand = new GetObjectCommand({
      Bucket: config.bucket!,
      Key: key,
    });
    // 同上，@smithy/types 版本冲突，使用类型断言绕过
    const url = await getSignedUrl(
      s3Client as unknown as Parameters<typeof getSignedUrl>[0],
      getCommand as unknown as Parameters<typeof getSignedUrl>[1],
      { expiresIn: 7 * 24 * 60 * 60 }
    );
    
    console.log("[TOS] Video uploaded successfully:", url);
    return { key, url };
  }
  
  // 使用平台存储
  const storage = getTosStorage();
  if (!storage) {
    throw new Error("TOS not configured");
  }
  
  // 使用 slug 路径（如果有 slug）
  const slug = await getProjectSlug(projectId);
  const videoPath = slug
    ? `projects/${slug}/videos/${taskId}.mp4`
    : `videos/${taskId}.mp4`;
  
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
      fileName: videoPath,
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
 * 创建原生 AWS S3Client（用于用户动态配置）
 * 统一使用外网域名，与 uploadAsset/uploadVideo 保持一致
 */
function createS3Client(config: TosConfig): { client: S3Client; bucket: string } {
  let endpointUrl = config.endpoint || "";
  if (endpointUrl && !endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
    endpointUrl = "https://" + endpointUrl;
  }
  // 确保使用外网 endpoint（volces.com）而不是内网（ivolces.com）
  endpointUrl = endpointUrl.replace(".ivolces.com", ".volces.com");

  const client = new S3Client({
    region: process.env.COZE_TOS_REGION || "cn-beijing",
    endpoint: endpointUrl,
    credentials: {
      accessKeyId: config.accessKey!,
      secretAccessKey: config.secretKey!,
    },
  });
  return { client, bucket: config.bucket! };
}

/**
 * 确保签名 URL 使用外网域名
 * 兜底替换：防止 SDK 内部生成了内网域名
 */
function ensurePublicUrl(url: string): string {
  return url.replace(".ivolces.com", ".volces.com");
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
  // 用户配置路径：使用原生 S3Client 生成签名 URL（与 uploadAsset 保持一致）
  if (config && isUserTosConfigured(config)) {
    const { client, bucket } = createS3Client(config);
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    // @smithy/types 版本冲突，使用类型断言绕过
    const url = await getSignedUrl(
      client as unknown as Parameters<typeof getSignedUrl>[0],
      getCommand as unknown as Parameters<typeof getSignedUrl>[1],
      { expiresIn: expireSeconds }
    );
    return ensurePublicUrl(url);
  }

  // 环境变量路径：使用 SDK
  const storage = getTosStorage();
  if (!storage) {
    throw new Error("TOS not configured");
  }
  const url = await storage.generatePresignedUrl({
    key,
    expireTime: expireSeconds,
  });
  return ensurePublicUrl(url);
}

/**
 * 删除文件
 * @param key 存储的 key
 * @param config 可选的用户配置
 */
export async function deleteFile(key: string, config?: TosConfig): Promise<boolean> {
  // 用户配置路径：使用原生 S3Client
  if (config && isUserTosConfigured(config)) {
    const { client, bucket } = createS3Client(config);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  }

  // 环境变量路径：使用 SDK
  const storage = getTosStorage();
  if (!storage) {
    throw new Error("TOS not configured");
  }
  return storage.deleteFile({ fileKey: key });
}

/**
 * 从数据库获取项目 slug
 * 用于构建 TOS 存储路径
 */
async function getProjectSlug(projectId: string): Promise<string | null> {
  try {
    const { getDb } = await import("@/storage/database/sqlite-client");
    const db = getDb();
    const row = db.prepare("SELECT slug FROM projects WHERE id = ?").get(projectId) as { slug: string | null } | undefined;
    return row?.slug || null;
  } catch {
    return null;
  }
}
