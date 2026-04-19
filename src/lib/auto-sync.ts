/**
 * 项目自动同步工具
 * 
 * 职责：
 * 1. 防抖推送：本地数据变更后，延迟推送至云端
 * 2. 页面加载拉取：打开项目列表时，检查云端更新并自动拉取
 * 3. 冲突检测：发现冲突时通知调用方处理
 */

import { pushProjectToCloud, getSyncStatus, pullProjectFromCloud, CloudProjectInfo, SyncStatus } from "@/lib/projects";

type TosConfig = {
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
};

// 防抖映射：projectId -> timer
const pushTimers = new Map<string, NodeJS.Timeout>();
const PUSH_DEBOUNCE_MS = 8000; // 8秒防抖

/**
 * 调度一次防抖推送
 * 多次调用只会在最后一次调用的 PUSH_DEBOUNCE_MS 毫秒后执行
 */
export function schedulePush(projectId: string, tosConfig: TosConfig | null): void {
  if (!tosConfig || !tosConfig.endpoint || !tosConfig.accessKey || !tosConfig.secretKey || !tosConfig.bucket) {
    return; // TOS 未配置，静默跳过
  }

  // 清除已有的定时器
  const existing = pushTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    pushTimers.delete(projectId);
    try {
      await pushProjectToCloud(projectId, tosConfig);
      console.log(`[AutoSync] Pushed project ${projectId} to cloud`);
    } catch (err) {
      console.error(`[AutoSync] Push failed for project ${projectId}:`, err);
    }
  }, PUSH_DEBOUNCE_MS);

  pushTimers.set(projectId, timer);
}

/**
 * 立即取消某项目的待执行推送
 * 用于项目删除等场景
 */
export function cancelPush(projectId: string): void {
  const timer = pushTimers.get(projectId);
  if (timer) {
    clearTimeout(timer);
    pushTimers.delete(projectId);
  }
}

/**
 * 检查云端同步状态并自动拉取更新
 * @returns 需要用户处理的冲突列表
 */
export async function checkAndPullUpdates(tosConfig: TosConfig | null): Promise<{
  pulled: { name: string; assetCount: number; taskCount: number }[];
  conflicts: CloudProjectInfo[];
}> {
  if (!tosConfig || !tosConfig.endpoint || !tosConfig.accessKey || !tosConfig.secretKey || !tosConfig.bucket) {
    return { pulled: [], conflicts: [] };
  }

  try {
    const { projects } = await getSyncStatus(tosConfig);
    const pulled: { name: string; assetCount: number; taskCount: number }[] = [];
    const conflicts: CloudProjectInfo[] = [];

    for (const cp of projects) {
      if (cp.syncStatus === "cloud_ahead" && cp.key) {
        // 云端有更新且本地无未推送变更，自动拉取
        try {
          const result = await pullProjectFromCloud(cp.key, tosConfig);
          pulled.push({
            name: result.project.name,
            assetCount: result.importedAssets,
            taskCount: result.importedTasks,
          });
        } catch (err) {
          console.error(`[AutoSync] Pull failed for ${cp.slug}:`, err);
        }
      } else if (cp.syncStatus === "cloud_only" && cp.key) {
        // 云端有但本地没有，自动拉取
        try {
          const result = await pullProjectFromCloud(cp.key, tosConfig);
          pulled.push({
            name: result.project.name,
            assetCount: result.importedAssets,
            taskCount: result.importedTasks,
          });
        } catch (err) {
          console.error(`[AutoSync] Pull failed for ${cp.slug}:`, err);
        }
      } else if (cp.syncStatus === "conflict") {
        // 冲突：需要用户处理
        conflicts.push(cp);
      }
    }

    return { pulled, conflicts };
  } catch (err) {
    console.error("[AutoSync] Check sync status failed:", err);
    return { pulled: [], conflicts: [] };
  }
}

/**
 * 根据同步状态返回显示用的颜色和文案
 */
export function getSyncStatusDisplay(status: SyncStatus): { label: string; color: string } {
  switch (status) {
    case "synced":
      return { label: "已同步", color: "text-green-500" };
    case "local_ahead":
      return { label: "待推送", color: "text-amber-500" };
    case "cloud_ahead":
      return { label: "待拉取", color: "text-blue-500" };
    case "conflict":
      return { label: "冲突", color: "text-red-500" };
    case "cloud_only":
      return { label: "仅云端", color: "text-gray-400" };
    case "local_only":
      return { label: "仅本地", color: "text-gray-400" };
    default:
      return { label: "", color: "" };
  }
}
