"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  MoreVertical,
  Plus,
  Trash2,
  FolderOpen,
  Calendar,
  ListTodo,
  Settings,
  Pencil,
  UserRound,
  RefreshCw,
  Cloud,
  CloudUpload,
  CloudDownload,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { getProjects, createProject, deleteProject, renameProject, getProjectTaskCount, Project } from "@/lib/projects";
import { GlobalAvatar, getGlobalAvatars, addGlobalAvatar, updateGlobalAvatar, deleteGlobalAvatar } from "@/lib/global-avatars";
import { uploadFile } from "@/lib/upload";
import { formatDistanceToNow } from "date-fns";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useSettingsStore } from "@/lib/settings";
import { toast } from "sonner";
import { schedulePush, cancelPush, checkAndPullUpdates, getSyncStatusDisplay } from "@/lib/auto-sync";
import { SyncStatus } from "@/lib/projects";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { taskCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameProjectName, setRenameProjectName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const router = useRouter();

  // 全局虚拟人像库
  const [globalAvatars, setGlobalAvatars] = useState<GlobalAvatar[]>([]);
  const [globalAvatarDialogOpen, setGlobalAvatarDialogOpen] = useState(false);
  const [avatarForm, setAvatarForm] = useState({ assetId: "", displayName: "", description: "" });
  const [avatarThumbnailFile, setAvatarThumbnailFile] = useState<File | null>(null);
  const [avatarThumbnailPreview, setAvatarThumbnailPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarAdding, setAvatarAdding] = useState(false);
  const [deletingAvatarId, setDeletingAvatarId] = useState<string | null>(null);

  // 编辑显示名称
  const [editingAvatarId, setEditingAvatarId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  // 人像详情对话框
  const [detailAvatar, setDetailAvatar] = useState<GlobalAvatar | null>(null);
  // 详情页编辑态
  const [detailEditingField, setDetailEditingField] = useState<"display_name" | "description" | null>(null);
  const [detailEditValue, setDetailEditValue] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  // 详情页缩略图更换
  const [detailThumbnailFile, setDetailThumbnailFile] = useState<File | null>(null);
  const [detailThumbnailPreview, setDetailThumbnailPreview] = useState<string | null>(null);
  const [detailThumbnailUploading, setDetailThumbnailUploading] = useState(false);

  // TOS 同步状态
  const [syncingUp, setSyncingUp] = useState(false);
  const [syncingDown, setSyncingDown] = useState(false);
  // 项目同步状态映射：projectId -> SyncStatus
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  // 冲突项目列表
  const [conflictProjects, setConflictProjects] = useState<{ name: string; slug: string }[]>([]);

  const { tosEnabled, tosSettings } = useSettingsStore();

  useEffect(() => {
    loadProjects();
    loadGlobalAvatars();
    // 页面加载时检查云端更新并自动拉取
    autoPullFromCloud();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await getProjects();
      const projectsWithCount = await Promise.all(
        data.map(async (project) => {
          const count = await getProjectTaskCount(project.id);
          return { ...project, taskCount: count };
        })
      );
      setProjects(projectsWithCount);
    } catch (error) {
      console.error("加载项目失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadGlobalAvatars = async () => {
    try {
      const data = await getGlobalAvatars();
      setGlobalAvatars(data);
    } catch (error) {
      console.error("加载虚拟人像库失败:", error);
    }
  };

  // 自动拉取云端更新
  const autoPullFromCloud = async () => {
    const config = getTosConfig();
    if (!config) return;

    try {
      const { pulled, conflicts } = await checkAndPullUpdates(config);
      if (pulled.length > 0) {
        toast.success(`已从云端同步 ${pulled.length} 个项目`);
        await loadProjects(); // 刷新列表
      }
      if (conflicts.length > 0) {
        setConflictProjects(conflicts.map((c) => ({ name: c.name, slug: c.slug })));
      }
      // 刷新同步状态指示器
      await refreshSyncStatuses();
    } catch (error) {
      console.warn("[AutoSync] 自动拉取失败:", error);
    }
  };

  // 刷新项目同步状态
  const refreshSyncStatuses = async () => {
    const config = getTosConfig();
    if (!config) return;

    try {
      const { getSyncStatus } = await import("@/lib/projects");
      const { projects } = await getSyncStatus(config);
      const statusMap: Record<string, SyncStatus> = {};
      for (const cp of projects) {
        if (cp.localId) {
          statusMap[cp.localId] = cp.syncStatus;
        }
      }
      setSyncStatuses(statusMap);
    } catch (error) {
      console.warn("[AutoSync] 刷新同步状态失败:", error);
    }
  };

  const getTosConfig = () => {
    if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey && tosSettings.secretKey && tosSettings.bucket) {
      return tosSettings;
    }
    return undefined;
  };

  // 从 TOS 拉取数据并合并
  const syncFromTos = async () => {
    const config = getTosConfig();
    if (!config) return;

    try {
      setSyncingDown(true);
      const response = await fetch(`/api/global-avatars/sync?tosConfig=${encodeURIComponent(JSON.stringify(config))}`);
      const result = await response.json();
      if (result.success && result.synced > 0) {
        await loadGlobalAvatars();
        toast.success(`已从云端同步 ${result.synced} 个人像`);
      }
    } catch (error) {
      console.warn("从 TOS 同步失败:", error);
    } finally {
      setSyncingDown(false);
    }
  };

  // 上传到 TOS
  const syncToTos = async () => {
    const config = getTosConfig();
    if (!config) {
      toast.error("请先配置 TOS 存储");
      return;
    }

    try {
      setSyncingUp(true);
      const response = await fetch("/api/global-avatars/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tosConfig: config }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`已上传 ${result.count} 个人像到云端`);
      } else {
        toast.error("上传失败");
      }
    } catch (error) {
      console.error("上传到 TOS 失败:", error);
      toast.error("上传失败");
    } finally {
      setSyncingUp(false);
    }
  };

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    try {
      setCreating(true);
      const project = await createProject(newProjectName.trim());
      // 自动推送到云端
      schedulePush(project.id, getTosConfig() ?? null);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error("创建项目失败:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      cancelPush(id); // 取消待执行的推送
      await deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
      // 从同步状态中移除
      setSyncStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      console.error("删除项目失败:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async () => {
    if (!renameProjectId || !renameProjectName.trim()) return;
    try {
      setRenaming(true);
      await renameProject(renameProjectId, renameProjectName.trim());
      setProjects(projects.map((p) =>
        p.id === renameProjectId ? { ...p, name: renameProjectName.trim() } : p
      ));
      // 重命名后自动推送
      schedulePush(renameProjectId, getTosConfig() ?? null);
      setRenameDialogOpen(false);
      setRenameProjectId(null);
      setRenameProjectName("");
    } catch (error) {
      console.error("重命名项目失败:", error);
    } finally {
      setRenaming(false);
    }
  };

  const openRenameDialog = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameProjectId(id);
    setRenameProjectName(name);
    setRenameDialogOpen(true);
  };

  const openProject = (id: string) => {
    router.push(`/projects/${id}`);
  };

  // 添加全局虚拟人像
  const handleAddGlobalAvatar = async () => {
    if (!avatarForm.assetId.trim()) {
      toast.error("请输入 Asset ID");
      return;
    }

    try {
      setAvatarAdding(true);

      // 如果有本地缩略图文件，先上传到 TOS
      let thumbnailUrl: string | undefined;
      if (avatarThumbnailFile) {
        try {
          setAvatarUploading(true);
          const uploadResult = await uploadFile(avatarThumbnailFile, {
            projectId: "global-avatars",
            type: "image",
            skipDb: true,
          });
          thumbnailUrl = uploadResult.url;
        } catch (uploadError) {
          console.error("缩略图上传失败:", uploadError);
          toast.error("缩略图上传失败");
        } finally {
          setAvatarUploading(false);
        }
      }

      const tosConfig = getTosConfig();
      await addGlobalAvatar({
        asset_id: avatarForm.assetId.trim(),
        display_name: avatarForm.displayName.trim(),
        thumbnail_url: thumbnailUrl,
        description: avatarForm.description.trim(),
        // 传递 TOS 配置以触发同步
      }, tosConfig);

      toast.success("虚拟人像已添加到全局库");
      setAvatarForm({ assetId: "", displayName: "", description: "" });
      setAvatarThumbnailFile(null);
      setAvatarThumbnailPreview(null);
      setGlobalAvatarDialogOpen(false);
      loadGlobalAvatars();
    } catch (error) {
      console.error("添加虚拟人像失败:", error);
      toast.error("添加虚拟人像失败");
    } finally {
      setAvatarAdding(false);
    }
  };

  // 更新显示名称
  const handleSaveDisplayName = async (avatarId: string) => {
    if (!editingDisplayName.trim()) {
      setEditingAvatarId(null);
      return;
    }

    try {
      setSavingDisplayName(true);
      const tosConfig = getTosConfig();
      await updateGlobalAvatar(avatarId, {
        display_name: editingDisplayName.trim(),
      }, tosConfig);

      setGlobalAvatars(globalAvatars.map((a) =>
        a.id === avatarId ? { ...a, display_name: editingDisplayName.trim() } : a
      ));
      setEditingAvatarId(null);
      toast.success("名称已更新");
    } catch (error) {
      console.error("更新名称失败:", error);
      toast.error("更新失败");
    } finally {
      setSavingDisplayName(false);
    }
  };

  // 删除全局虚拟人像
  const handleDeleteGlobalAvatar = async (id: string) => {
    try {
      setDeletingAvatarId(id);
      await deleteGlobalAvatar(id);
      setGlobalAvatars(globalAvatars.filter((a) => a.id !== id));
      toast.success("已从全局库删除");
    } catch (error) {
      console.error("删除虚拟人像失败:", error);
      toast.error("删除失败");
    } finally {
      setDeletingAvatarId(null);
    }
  };

  // 重置人像对话框
  const closeAvatarDialog = () => {
    setGlobalAvatarDialogOpen(false);
    setAvatarForm({ assetId: "", displayName: "", description: "" });
    setAvatarThumbnailFile(null);
    setAvatarThumbnailPreview(null);
  };

  // 详情页保存字段
  const handleDetailSave = async (field: "display_name" | "description", value: string) => {
    if (!detailAvatar) return;
    const trimmed = value.trim();
    if (field === "display_name" && !trimmed) {
      setDetailEditingField(null);
      return;
    }
    try {
      setDetailSaving(true);
      const tosConfig = getTosConfig();
      const updated = await updateGlobalAvatar(detailAvatar.id, {
        [field]: trimmed,
      }, tosConfig);
      setDetailAvatar(updated);
      setGlobalAvatars(globalAvatars.map((a) => a.id === updated.id ? updated : a));
      toast.success("已保存");
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败");
    } finally {
      setDetailSaving(false);
      setDetailEditingField(null);
    }
  };

  // 详情页更换缩略图
  const handleDetailThumbnailChange = async () => {
    if (!detailAvatar || !detailThumbnailFile) return;
    try {
      setDetailThumbnailUploading(true);
      let thumbnailUrl = detailAvatar.thumbnail_url || undefined;
      const uploadResult = await uploadFile(detailThumbnailFile, {
        projectId: "global-avatars",
        type: "image",
        skipDb: true,
      });
      thumbnailUrl = uploadResult.url;
      const tosConfig = getTosConfig();
      const updated = await updateGlobalAvatar(detailAvatar.id, {
        thumbnail_url: thumbnailUrl,
      }, tosConfig);
      setDetailAvatar(updated);
      setGlobalAvatars(globalAvatars.map((a) => a.id === updated.id ? updated : a));
      setDetailThumbnailFile(null);
      setDetailThumbnailPreview(null);
      toast.success("缩略图已更新");
    } catch (error) {
      console.error("缩略图更换失败:", error);
      toast.error("缩略图更换失败");
    } finally {
      setDetailThumbnailUploading(false);
    }
  };

  // 打开详情页时重置编辑态
  const openDetailAvatar = (avatar: GlobalAvatar) => {
    setDetailAvatar(avatar);
    setDetailEditingField(null);
    setDetailThumbnailFile(null);
    setDetailThumbnailPreview(null);
  };

  return (
    <>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Logo & 标题 */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-600 dark:from-neutral-200 dark:to-neutral-400 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white dark:text-neutral-900" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold tracking-tight">焱超</span>
              <span className="text-xs text-muted-foreground -mt-0.5">Seedance 工作台</span>
            </div>
          </div>

          {/* 右侧操作 */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="gap-2">
              <Settings className="w-4 h-4" />
              设置
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              新建项目
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="px-6 py-8 max-w-6xl mx-auto">
        {/* 项目列表 */}
        <div className="mb-12">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-1">我的项目</h1>
            <p className="text-muted-foreground">管理和创建您的视频生成项目</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
                <FolderOpen className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">暂无项目</h3>
              <p className="text-muted-foreground mb-6">创建您的第一个项目开始生成视频</p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                新建项目
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative bg-card border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => openProject(project.id)}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => openRenameDialog(project.id, project.name, e)}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project.id);
                        }}
                        disabled={deletingId === project.id}
                      >
                        <Trash2 className="w-4 h-4" />
                        删除项目
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate mb-1">{project.name}</h3>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ListTodo className="w-3 h-3" />
                          {project.taskCount || 0} 个任务
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                        </span>
                        {syncStatuses[project.id] && syncStatuses[project.id] !== "synced" && syncStatuses[project.id] !== "local_only" && (
                          <span className={`flex items-center gap-1 ${getSyncStatusDisplay(syncStatuses[project.id]).color}`}>
                            <Cloud className="w-3 h-3" />
                            {getSyncStatusDisplay(syncStatuses[project.id]).label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 同步冲突提示 */}
        {conflictProjects.length > 0 && (
          <div className="mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <p className="font-medium text-amber-600 mb-1">检测到同步冲突</p>
            <p className="text-muted-foreground">
              以下项目本地和云端均有修改：{conflictProjects.map((p) => p.name).join("、")}
              。请手动选择保留版本。
            </p>
          </div>
        )}

        {/* 虚拟人像库 */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                <UserRound className="w-5 h-5 text-purple-500" />
                虚拟人像库
              </h2>
              <p className="text-sm text-muted-foreground">跨项目共享的虚拟人像，在项目中使用时可分别设置角色名</p>
            </div>
            <div className="flex items-center gap-2">
              {tosEnabled && tosSettings.endpoint && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={syncFromTos}
                    disabled={syncingDown}
                    title="从云端拉取"
                    className="gap-1"
                  >
                    {syncingDown ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                    拉取
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={syncToTos}
                    disabled={syncingUp}
                    title="上传到云端"
                    className="gap-1"
                  >
                    {syncingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                    上传
                  </Button>
                </>
              )}
              <Button size="sm" onClick={() => setGlobalAvatarDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                添加人像
              </Button>
            </div>
          </div>

          {globalAvatars.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-xl bg-muted/20">
              <UserRound className="w-10 h-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">暂无虚拟人像</h3>
              <p className="text-xs text-muted-foreground mb-4">添加虚拟人像，在所有项目中复用</p>
              <Button size="sm" variant="outline" onClick={() => setGlobalAvatarDialogOpen(true)} className="gap-2">
                <Plus className="w-3.5 h-3.5" />
                添加人像
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {globalAvatars.map((avatar) => (
                <div
                  key={avatar.id}
                  className="group relative bg-card border rounded-xl overflow-hidden hover:border-purple-500/50 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => openDetailAvatar(avatar)}
                >
                  {/* 删除按钮 */}
                  <button
                    onClick={() => handleDeleteGlobalAvatar(avatar.id)}
                    disabled={deletingAvatarId === avatar.id}
                    className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  {/* 缩略图 */}
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {avatar.thumbnail_url ? (
                      <img
                        src={avatar.thumbnail_url}
                        alt={avatar.display_name || avatar.asset_id}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserRound className="w-10 h-10 text-purple-400" />
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="p-3 space-y-1.5">
                    {/* 显示名称 - 可编辑 */}
                    {editingAvatarId === avatar.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingDisplayName}
                          onChange={(e) => setEditingDisplayName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveDisplayName(avatar.id);
                            if (e.key === "Escape") setEditingAvatarId(null);
                          }}
                          onBlur={() => handleSaveDisplayName(avatar.id)}
                          className="h-6 text-xs px-1.5 py-0"
                          autoFocus
                          disabled={savingDisplayName}
                        />
                        {savingDisplayName && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-1 cursor-pointer group/name"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAvatarId(avatar.id);
                          setEditingDisplayName(avatar.display_name || "");
                        }}
                      >
                        <span className="text-sm font-medium truncate flex-1" title="点击编辑名称">
                          {avatar.display_name || "未命名"}
                        </span>
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <UserRound className="w-3 h-3 text-purple-500 shrink-0" />
                      <span className="text-[10px] font-mono text-muted-foreground truncate" title={avatar.asset_id}>
                        {avatar.asset_id}
                      </span>
                    </div>
                    {avatar.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2" title={avatar.description}>
                        {avatar.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 设置弹窗 */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* 新建项目对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>创建一个新的视频生成项目</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="请输入项目名称"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newProjectName.trim()}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名项目对话框 */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
            <DialogDescription>修改项目名称</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="请输入新名称"
              value={renameProjectName}
              onChange={(e) => setRenameProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRename} disabled={renaming || !renameProjectName.trim()}>
              {renaming ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加全局虚拟人像对话框 */}
      <Dialog open={globalAvatarDialogOpen} onOpenChange={(open) => { if (!open) closeAvatarDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="w-5 h-5 text-purple-500" />
              添加虚拟人像
            </DialogTitle>
            <DialogDescription>添加一个虚拟人像到全局库</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Asset ID <span className="text-destructive">*</span></Label>
              <Input
                placeholder="如：asset-202604011823-6d4x2"
                value={avatarForm.assetId}
                onChange={(e) => setAvatarForm((prev) => ({ ...prev, assetId: e.target.value.trim() }))}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                从
                <a
                  href="https://www.volcengine.com/docs/82379/2223965"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary transition-colors mx-0.5"
                >
                  官方虚拟人像库
                </a>
                获取 Asset ID
              </p>
            </div>
            <div>
              <Label>显示名称 <span className="text-muted-foreground font-normal">(便于管理，仅在此库中显示)</span></Label>
              <Input
                placeholder="如：美妆博主小美"
                value={avatarForm.displayName}
                onChange={(e) => setAvatarForm((prev) => ({ ...prev, displayName: e.target.value }))}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">仅用于人像库管理辨识，不影响项目内的角色名设置</p>
            </div>
            <div>
              <Label>缩略图 <span className="text-muted-foreground font-normal">(可选)</span></Label>
              <div className="mt-1.5 space-y-2">
                {avatarThumbnailPreview ? (
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={avatarThumbnailPreview}
                      alt="缩略图预览"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarThumbnailFile(null);
                        setAvatarThumbnailPreview(null);
                      }}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-1.5 h-9 w-full border border-dashed border-muted-foreground/25 rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                    {avatarUploading ? (
                      <span className="animate-pulse">上传中...</span>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>上传缩略图</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={avatarUploading}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setAvatarThumbnailFile(file);
                        const reader = new FileReader();
                        reader.onload = (ev) => setAvatarThumbnailPreview(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">上传本地图片作为缩略图，仅用于 UI 预览</p>
              </div>
            </div>
            <div>
              <Label>描述 <span className="text-muted-foreground font-normal">(可选)</span></Label>
              <Input
                placeholder="如：30岁女性，短发，专业形象"
                value={avatarForm.description}
                onChange={(e) => setAvatarForm((prev) => ({ ...prev, description: e.target.value }))}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">人像的特征描述，方便在不同项目中辨识</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAvatarDialog}>
              取消
            </Button>
            <Button
              onClick={handleAddGlobalAvatar}
              disabled={avatarAdding || !avatarForm.assetId.trim()}
            >
              {avatarAdding ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 人像详情对话框（可编辑） */}
      <Dialog open={!!detailAvatar} onOpenChange={(open) => { if (!open) setDetailAvatar(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="w-5 h-5 text-purple-500" />
              虚拟人像详情
            </DialogTitle>
            <DialogDescription>查看和编辑虚拟人像信息</DialogDescription>
          </DialogHeader>
          {detailAvatar && (
            <div className="space-y-4 py-2">
              {/* 缩略图区域 - 可更换 */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">缩略图</Label>
                <div className="w-full aspect-video max-w-xs mx-auto rounded-xl overflow-hidden bg-muted relative group/thumb">
                  {(detailThumbnailPreview || detailAvatar.thumbnail_url) ? (
                    <img
                      src={detailThumbnailPreview || detailAvatar.thumbnail_url!}
                      alt={detailAvatar.display_name || detailAvatar.asset_id}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <UserRound className="w-16 h-16 text-purple-300" />
                    </div>
                  )}
                  {/* 有缩略图时 hover 显示更换按钮 */}
                  {(detailThumbnailPreview || detailAvatar.thumbnail_url) && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                      <label className="flex items-center justify-center gap-1.5 h-9 px-4 bg-white/90 text-black rounded-md cursor-pointer hover:bg-white transition-colors text-xs">
                        {detailThumbnailUploading ? (
                          <span className="animate-pulse">上传中...</span>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>更换图片</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={detailThumbnailUploading}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setDetailThumbnailUploading(true);
                            uploadFile(file, {
                              projectId: "global-avatars",
                              type: "image",
                            }).then(async (result) => {
                              const tosConfig = getTosConfig();
                              const updated = await updateGlobalAvatar(detailAvatar.id, {
                                thumbnail_url: result.url,
                              }, tosConfig);
                              setDetailAvatar(updated);
                              setGlobalAvatars(globalAvatars.map((a) => a.id === updated.id ? updated : a));
                              toast.success("缩略图已更新");
                            }).catch((err) => {
                              console.error("缩略图更换失败:", err);
                              toast.error("缩略图更换失败");
                            }).finally(() => {
                              setDetailThumbnailUploading(false);
                              setDetailThumbnailFile(null);
                              setDetailThumbnailPreview(null);
                            });
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
                {/* 无缩略图时，显示上传按钮 */}
                {!detailAvatar.thumbnail_url && !detailThumbnailPreview && (
                  <label className="flex items-center justify-center gap-1.5 h-9 w-full border border-dashed border-muted-foreground/25 rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                    {detailThumbnailUploading ? (
                      <span className="animate-pulse">上传中...</span>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>上传缩略图</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={detailThumbnailUploading}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setDetailThumbnailUploading(true);
                        uploadFile(file, {
                          projectId: "global-avatars",
                          type: "image",
                        }).then(async (result) => {
                          const tosConfig = getTosConfig();
                          const updated = await updateGlobalAvatar(detailAvatar.id, {
                            thumbnail_url: result.url,
                          }, tosConfig);
                          setDetailAvatar(updated);
                          setGlobalAvatars(globalAvatars.map((a) => a.id === updated.id ? updated : a));
                          toast.success("缩略图已更新");
                        }).catch((err) => {
                          console.error("缩略图更换失败:", err);
                          toast.error("缩略图更换失败");
                        }).finally(() => {
                          setDetailThumbnailUploading(false);
                          setDetailThumbnailFile(null);
                          setDetailThumbnailPreview(null);
                        });
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Asset ID - 只读 */}
              <div>
                <Label className="text-muted-foreground text-xs">Asset ID</Label>
                <p className="font-mono text-sm mt-0.5 break-all select-all">{detailAvatar.asset_id}</p>
              </div>

              {/* 显示名称 - 可编辑 */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">显示名称</Label>
                  {detailEditingField !== "display_name" && (
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        setDetailEditingField("display_name");
                        setDetailEditValue(detailAvatar.display_name || "");
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {detailEditingField === "display_name" ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Input
                      value={detailEditValue}
                      onChange={(e) => setDetailEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleDetailSave("display_name", detailEditValue);
                        if (e.key === "Escape") setDetailEditingField(null);
                      }}
                      onBlur={() => handleDetailSave("display_name", detailEditValue)}
                      className="h-7 text-sm"
                      autoFocus
                      disabled={detailSaving}
                    />
                    {detailSaving && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  </div>
                ) : (
                  <p className="text-sm mt-0.5">{detailAvatar.display_name || "未命名"}</p>
                )}
              </div>

              {/* 描述 - 可编辑 */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">描述</Label>
                  {detailEditingField !== "description" && (
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        setDetailEditingField("description");
                        setDetailEditValue(detailAvatar.description || "");
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {detailEditingField === "description" ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Input
                      value={detailEditValue}
                      onChange={(e) => setDetailEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleDetailSave("description", detailEditValue);
                        if (e.key === "Escape") setDetailEditingField(null);
                      }}
                      onBlur={() => handleDetailSave("description", detailEditValue)}
                      placeholder="如：30岁女性，短发，专业形象"
                      className="h-7 text-sm"
                      autoFocus
                      disabled={detailSaving}
                    />
                    {detailSaving && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  </div>
                ) : (
                  <p className="text-sm mt-0.5">{detailAvatar.description || "暂无描述"}</p>
                )}
              </div>

              {/* 添加时间 - 只读 */}
              <div>
                <Label className="text-muted-foreground text-xs">添加时间</Label>
                <p className="text-sm mt-0.5">{formatDistanceToNow(new Date(detailAvatar.created_at), { addSuffix: true })}</p>
              </div>

              {/* 删除按钮 */}
              <div className="pt-2 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => {
                    handleDeleteGlobalAvatar(detailAvatar.id);
                    setDetailAvatar(null);
                  }}
                  disabled={deletingAvatarId === detailAvatar.id}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}
