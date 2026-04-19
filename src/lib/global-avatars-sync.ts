/**
 * 全局虚拟人像库 TOS 同步工具
 * 将本地 SQLite 数据同步到 TOS，确保跨设备可用
 */

import { getDb } from "@/storage/database/sqlite-client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { isUserTosConfigured, isTosConfigured } from "@/storage/tos/client";
import type { TosConfig } from "@/storage/tos/client";

const GLOBAL_AVATARS_KEY = "global-avatars/global-avatars.json";

function createS3ClientFromConfig(config: TosConfig) {
  let endpointUrl = config.endpoint || "";
  if (endpointUrl && !endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
    endpointUrl = "https://" + endpointUrl;
  }
  endpointUrl = endpointUrl.replace(".ivolces.com", ".volces.com");

  return new S3Client({
    region: process.env.COZE_TOS_REGION || "cn-beijing",
    endpoint: endpointUrl,
    credentials: {
      accessKeyId: config.accessKey!,
      secretAccessKey: config.secretKey!,
    },
  });
}

/**
 * 从请求中获取的 TOS 配置，或从环境变量构建配置
 */
function resolveTosConfig(config?: TosConfig): TosConfig | null {
  if (config && isUserTosConfigured(config)) return config;

  // 降级到环境变量
  if (isTosConfigured()) {
    return {
      endpoint: process.env.COZE_TOS_ENDPOINT?.replace(".ivolces.com", ".volces.com"),
      accessKey: process.env.COZE_TOS_ACCESS_KEY || process.env.COZE_TOS_ACCESS_KEY_ID,
      secretKey: process.env.COZE_TOS_SECRET_KEY || process.env.COZE_TOS_SECRET_ACCESS_KEY,
      bucket: process.env.COZE_TOS_BUCKET || process.env.COZE_BUCKET_NAME,
    };
  }

  return null;
}

/**
 * 将全局虚拟人像库数据同步到 TOS
 * 在每次写入操作（创建/更新/删除）后异步调用
 */
export async function syncGlobalAvatarsToTos(config?: TosConfig): Promise<void> {
  const resolvedConfig = resolveTosConfig(config);
  if (!resolvedConfig) {
    console.log("[global-avatars-sync] TOS not configured, skip sync");
    return;
  }

  try {
    const db = getDb();
    const avatars = db
      .prepare("SELECT * FROM global_avatars ORDER BY created_at DESC")
      .all() as Record<string, unknown>[];

    const jsonContent = JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      avatars,
    });

    const s3Client = createS3ClientFromConfig(resolvedConfig);
    await s3Client.send(new PutObjectCommand({
      Bucket: resolvedConfig.bucket,
      Key: GLOBAL_AVATARS_KEY,
      Body: Buffer.from(jsonContent, "utf-8"),
      ContentType: "application/json",
    }));

    console.log("[global-avatars-sync] Synced", avatars.length, "avatars to TOS");
  } catch (error) {
    console.error("[global-avatars-sync] Failed:", error);
    throw error;
  }
}
