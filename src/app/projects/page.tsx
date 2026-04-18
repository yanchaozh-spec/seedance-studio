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
} from "lucide-react";
import { getProjects, createProject, deleteProject, renameProject, getProjectTaskCount, Project } from "@/lib/projects";
import { GlobalAvatar, getGlobalAvatars, addGlobalAvatar, deleteGlobalAvatar } from "@/lib/global-avatars";
import { uploadFile } from "@/lib/upload";
import { ThumbnailUpload } from "@/components/thumbnail-upload";
import { formatDistanceToNow } from "date-fns";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { toast } from "sonner";

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
  const [avatarForm, setAvatarForm] = useState({ assetId: "", thumbnailUrl: "", description: "" });
  const [avatarThumbnailFile, setAvatarThumbnailFile] = useState<File | null>(null);
  const [avatarThumbnailPreview, setAvatarThumbnailPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarAdding, setAvatarAdding] = useState(false);
  const [deletingAvatarId, setDeletingAvatarId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    loadGlobalAvatars();
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

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    try {
      setCreating(true);
      const project = await createProject(newProjectName.trim());
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
      await deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
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
      let thumbnailUrl = avatarForm.thumbnailUrl.trim() || undefined;
      if (avatarThumbnailFile) {
        try {
          setAvatarUploading(true);
          const uploadResult = await uploadFile(avatarThumbnailFile, {
            // global_avatars 没有 project_id，使用临时目录占位
            projectId: "global-avatars",
            type: "image",
          });
          thumbnailUrl = uploadResult.url;
        } catch (uploadError) {
          console.error("缩略图上传失败:", uploadError);
          toast.error("缩略图上传失败");
        } finally {
          setAvatarUploading(false);
        }
      }

      await addGlobalAvatar({
        asset_id: avatarForm.assetId.trim(),
        thumbnail_url: thumbnailUrl,
        description: avatarForm.description.trim(),
      });

      toast.success("虚拟人像已添加到全局库");
      setAvatarForm({ assetId: "", thumbnailUrl: "", description: "" });
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
    setAvatarForm({ assetId: "", thumbnailUrl: "", description: "" });
    setAvatarThumbnailFile(null);
    setAvatarThumbnailPreview(null);
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
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
            <Button size="sm" onClick={() => setGlobalAvatarDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              添加人像
            </Button>
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
                  className="group relative bg-card border rounded-xl overflow-hidden hover:border-purple-500/50 hover:shadow-md transition-all"
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
                        alt={avatar.asset_id}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserRound className="w-10 h-10 text-purple-400" />
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="p-3 space-y-1.5">
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
              <Label>缩略图 <span className="text-muted-foreground font-normal">(可选)</span></Label>
              <div className="mt-1.5">
                <ThumbnailUpload
                  url={avatarForm.thumbnailUrl}
                  onUrlChange={(v) => setAvatarForm((prev) => ({ ...prev, thumbnailUrl: v }))}
                  preview={avatarThumbnailPreview}
                  onPreviewChange={setAvatarThumbnailPreview}
                  file={avatarThumbnailFile}
                  onFileChange={setAvatarThumbnailFile}
                  uploading={avatarUploading}
                />
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
    </>
  );
}
