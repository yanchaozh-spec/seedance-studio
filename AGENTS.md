# 焰超 — Seedance 2.0 视频生成工作台

## 产品简介

焰超是一个 AI 视频生成工具，让你通过文字描述和素材（图片、音频、虚拟人像）快速生成高质量视频。整个流程如下：

```
创建项目 → 上传素材（图片/音频/虚拟人像）→ 编写提示词 → 选择素材 → 生成视频 → 预览/下载
```

### 核心功能一览

| 功能 | 说明 |
|------|------|
| **项目管理** | 创建、重命名、删除项目，每个项目独立管理素材和任务 |
| **素材库** | 上传图片/音频/视频，添加虚拟人像（Asset ID），图片可绑定音频实现声线对口 |
| **视频生成** | 多提示词框 + 素材池拖拽 + 参数配置（时长/画幅/分辨率），一键提交生成 |
| **任务管理** | 查看任务状态（排队/生成中/完成/失败），视频预览播放，下载视频 |
| **关键帧抽帧** | 从已生成视频中抽取关键帧作为下一轮生成的素材 |
| **虚拟人像** | 全局虚拟人像库，跨项目共享；项目内可设角色名，用 `@角色名` 在提示词中引用 |
| **云端同步** | 配置火山云 TOS 后，项目数据自动推送到云端，换设备可拉取恢复 |

### 技术架构概览

```
浏览器（React 前端）
  ├── 页面路由 → Next.js App Router
  ├── 状态管理 → React useState + Zustand（设置）
  └── 数据获取 → fetch API → Next.js API Routes

服务端（Next.js API Routes）
  ├── 数据库 → SQLite（better-sqlite3），单文件存储
  ├── 对象存储 → 火山云 TOS（S3 兼容协议）
  └── AI 推理 → Seedance 2.0 API（火山方舟）

数据流向：
  前端操作 → API Route → SQLite 写入 → 触发自动推送（8s 防抖）→ TOS 云端
  页面加载 → API Route → 自动拉取（检测云端版本差异）→ SQLite 覆盖 → 刷新页面
```

---

## 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: better-sqlite3
- **Object Storage**: 火山云 TOS（@aws-sdk/client-s3 兼容）
- **AI API**: Seedance 2.0（火山方舟）
- **工具库**: pinyin-pro（中文转拼音）、date-fns（时间格式化）、dnd-kit（拖拽排序）

---

## 目录结构

```
├── public/                     # 静态资源
├── scripts/                    # 构建与启动脚本
│   ├── build.sh                # 构建脚本
│   ├── dev.sh                  # 开发环境启动脚本
│   ├── prepare.sh              # 预处理脚本
│   └── start.sh                # 生产环境启动脚本
├── src/
│   ├── app/                    # 页面路由与布局
│   │   ├── projects/           # 项目管理页面
│   │   │   ├── page.tsx        # 项目列表页
│   │   │   └── [id]/           # 项目详情
│   │   │       ├── layout.tsx  # 项目详情布局（素材库侧边栏 + 导航）
│   │   │       ├── page.tsx    # 视频生成主界面
│   │   │       ├── materials/  # 素材库全屏页
│   │   │       └── tasks/      # 任务管理页
│   │   └── api/                # API 路由（详见下方 API 章节）
│   ├── components/             # 业务组件
│   │   ├── asset-card.tsx      # 素材卡片（支持拖拽）
│   │   ├── asset-detail-dialog.tsx  # 素材详情对话框
│   │   ├── prompt-textarea.tsx # 提示词输入框（支持 @角色名 引用）
│   │   ├── thumbnail-upload.tsx # 缩略图上传组件
│   │   ├── settings/           # 设置对话框
│   │   ├── tasks/              # 任务相关组件
│   │   ├── layout/             # 布局组件
│   │   └── ui/                 # shadcn/ui 基础组件库
│   ├── hooks/                  # 自定义 Hooks
│   ├── lib/                    # 工具库（详见下方 Lib 章节）
│   └── storage/                # 存储层
│       ├── database/           # SQLite 数据库客户端
│       └── tos/                # TOS 对象存储客户端
├── .coze                       # 部署配置
├── next.config.ts              # Next.js 配置
├── package.json                # 项目依赖
└── tsconfig.json               # TypeScript 配置
```

---

## 页面结构

| 页面 | 路由 | 功能描述 |
|------|------|---------|
| 项目列表 | `/projects` | 项目卡片网格、新建项目、重命名、删除、全局虚拟人像库管理、同步状态指示器 |
| 视频生成 | `/projects/[id]` | 提示词编辑器 + 素材池 + 参数配置 + 生成按钮，右侧素材库抽屉 |
| 素材库 | `/projects/[id]/materials` | 全屏素材管理：上传图片/音频/视频、添加虚拟人像、绑定音频、排序 |
| 任务管理 | `/projects/[id]/tasks` | 任务列表（状态/进度/时间）、视频预览抽屉、回滚、下载、抽帧 |

---

## 数据库表结构

### projects — 项目表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 自动生成的 32 位十六进制 ID |
| `name` | TEXT | 项目名称 |
| `slug` | TEXT | TOS 存储路径标识（创建后不可变，如 `d4c1c095_HLSP`） |
| `description` | TEXT | 项目描述 |
| `cloud_version` | INTEGER | 云端同步版本号（默认 0，每次推送原子 +1） |
| `last_pushed_at` | TEXT | 最后推送时间（用于判断本地是否有未推送变更） |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### assets — 素材表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 素材 ID |
| `project_id` | TEXT FK | 所属项目（级联删除） |
| `name` | TEXT | 文件名 |
| `display_name` | TEXT | 显示名称（虚拟人像角色名） |
| `type` | TEXT | 素材类型：`image` / `audio` / `video` |
| `asset_category` | TEXT | 细分类：`image` / `audio` / `video` / `virtual_avatar` / `keyframe` |
| `asset_id` | TEXT | 虚拟人像的 Asset ID（仅 virtual_avatar 类型有值） |
| `is_keyframe` | INTEGER | 是否关键帧（0/1） |
| `keyframe_description` | TEXT | 关键帧描述 |
| `keyframe_source_task_id` | TEXT | 关键帧来源任务 ID |
| `url` | TEXT | 素材文件 URL（TOS 公网地址） |
| `thumbnail_url` | TEXT | 缩略图 URL |
| `size` | INTEGER | 文件大小（字节） |
| `duration` | REAL | 音频/视频时长（秒） |
| `storage_key` | TEXT | TOS 存储键 |
| `bound_audio_id` | TEXT | 绑定的音频素材 ID（图片绑定音频实现声线对口） |
| `sort_order` | INTEGER | 排序顺序 |

### tasks — 任务表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 任务 ID |
| `project_id` | TEXT FK | 所属项目 |
| `task_id_external` | TEXT | Seedance API 返回的任务 ID |
| `status` | TEXT | 状态：`queued` / `running` / `succeeded` / `failed` / `cancelled` |
| `model_mode` | TEXT | 模型模式 |
| `model_id` | TEXT | 模型 ID |
| `progress` | INTEGER | 生成进度（0-100） |
| `prompt_boxes` | TEXT JSON | 提示词框配置 |
| `selected_assets` | TEXT JSON | 选中素材列表 |
| `params` | TEXT JSON | 生成参数（时长/画幅/分辨率） |
| `result` | TEXT JSON | 生成结果 |
| `error_message` | TEXT | 错误信息 |
| `api_key` | TEXT | 使用的 API Key |
| `permanent_video_url` | TEXT | 视频永久 URL |
| `video_storage_key` | TEXT | 视频 TOS 存储键 |
| `queued_at` / `started_at` / `completed_at` | TEXT | 时间节点 |
| `queue_duration` / `generation_duration` | INTEGER | 耗时（毫秒） |
| `completion_tokens` / `total_tokens` | INTEGER | Token 消耗 |

### global_avatars — 全局虚拟人像表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 记录 ID |
| `asset_id` | TEXT UNIQUE | 火山方舟 Asset ID |
| `display_name` | TEXT | 显示名称 |
| `thumbnail_url` | TEXT | 缩略图 URL |
| `description` | TEXT | 描述 |
| `source_project_id` | TEXT | 来源项目 ID |
| `created_at` / `updated_at` | TEXT | 时间戳 |

---

## API 路由总览

### 项目管理

| 方法 | 路径 | 功能 | 请求体/参数 |
|------|------|------|------------|
| `POST` | `/api/projects` | 创建项目 | `{ name: string }` |
| `GET` | `/api/projects` | 获取项目列表 | — |
| `PATCH` | `/api/projects/[id]` | 更新项目（重命名，slug 不可变） | `{ name: string }` |
| `DELETE` | `/api/projects/[id]` | 删除项目（级联删除素材和任务） | — |

### 素材管理

| 方法 | 路径 | 功能 | 请求体/参数 |
|------|------|------|------------|
| `GET` | `/api/projects/[id]/assets` | 获取项目素材列表 | `?type=image\|audio\|video` |
| `POST` | `/api/assets/upload` | 上传素材（FormData） | `file, projectId, type, assetCategory, assetId?, displayName?, boundAudioId?` |
| `GET` | `/api/assets/[id]` | 获取单个素材 | — |
| `PATCH` | `/api/assets/[id]` | 更新素材 | `{ display_name?, bound_audio_id?, ... }` |
| `DELETE` | `/api/assets/[id]` | 删除素材 | — |
| `PATCH` | `/api/assets/reorder` | 素材排序 | `{ projectId, assetIds: string[] }` |
| `POST` | `/api/assets/extract-frame` | 从视频抽取关键帧 | `{ taskId, timeSeconds?, projectId }` |
| `GET` | `/api/assets/[id]/download` | 获取素材下载签名 URL | — |

### 任务管理

| 方法 | 路径 | 功能 | 请求体/参数 |
|------|------|------|------------|
| `GET` | `/api/projects/[id]/tasks` | 获取项目任务列表 | — |
| `POST` | `/api/seedance/tasks` | 创建视频生成任务 | `{ project_id, prompt_boxes, selected_assets, params, model_id? }` |
| `GET` | `/api/seedance/tasks` | 查询外部任务列表 | `?taskIds=xxx,yyy` |
| `DELETE` | `/api/seedance/tasks/[id]` | 取消/删除 Seedance 任务 | — |
| `DELETE` | `/api/tasks/[id]` | 删除本地任务记录 | `?taskIdExternal=xxx` |
| `GET` | `/api/tasks/[id]/poll` | 轮询任务状态 | — |
| `POST` | `/api/seedance/poll` | 批量轮询任务状态 | `{ tasks: [{id, taskIdExternal}] }` |
| `POST` | `/api/seedance/test` | 测试 Seedance API 连通性 | `{ arkApiKey }` |

### 云端同步

| 方法 | 路径 | 功能 | 请求体/参数 |
|------|------|------|------------|
| `POST` | `/api/projects/sync` | 推送项目到云端 | `{ projectId, tosConfig }` |
| `GET` | `/api/projects/sync` | 获取云端同步状态 | `?tosConfig={...}` |
| `PUT` | `/api/projects/sync` | 从云端拉取项目 | `{ key, tosConfig, forceOverwrite? }` |

**同步流程说明：**

1. **推送（POST）**：原子递增 `cloud_version` → 导出项目数据为 `project.json` → 上传到 TOS `projects/{slug}/project.json` → 更新 `last_pushed_at`
2. **状态查询（GET）**：扫描 TOS 中所有 `projects/*/project.json` → 对比本地 `cloud_version` → 返回每个项目的同步状态
3. **拉取（PUT）**：下载云端 `project.json` → 事务内删除旧数据 → 导入新数据（重新映射素材/任务 ID）→ 更新 `cloud_version`

**同步状态类型：**

| 状态 | 含义 | 自动处理 |
|------|------|---------|
| `synced` | 本地与云端一致 | 无需操作 |
| `local_ahead` | 本地有未推送变更 | 自动推送（8s 防抖） |
| `cloud_ahead` | 云端有更新版本 | 自动拉取 |
| `cloud_only` | 仅云端存在 | 自动拉取为新项目 |
| `conflict` | 本地和云端都有变更 | 需用户手动处理 |
| `local_only` | 仅本地存在 | 推送后消失 |

### 全局虚拟人像

| 方法 | 路径 | 功能 | 请求体/参数 |
|------|------|------|------------|
| `GET` | `/api/global-avatars` | 获取全局虚拟人像列表 | — |
| `POST` | `/api/global-avatars` | 添加虚拟人像 | `{ asset_id, display_name?, thumbnail_url?, description? }` |
| `PATCH` | `/api/global-avatars/[id]` | 更新虚拟人像 | `{ display_name?, thumbnail_url?, description? }` |
| `DELETE` | `/api/global-avatars/[id]` | 删除虚拟人像 | — |
| `POST` | `/api/global-avatars/sync` | 推送虚拟人像到 TOS | `{ tosConfig }` |
| `GET` | `/api/global-avatars/sync` | 从 TOS 拉取虚拟人像 | `?tosConfig={...}` |

### 存储测试

| 方法 | 路径 | 功能 | 请求体/参数 |
|------|------|------|------------|
| `POST` | `/api/storage/test` | 测试 TOS 连通性 | `{ tosConfig }` |

---

## 工具库（src/lib）

| 文件 | 功能 |
|------|------|
| `assets.ts` | 素材 API 客户端：增删改查、排序、类型判断（`getAssetKind`） |
| `auto-sync.ts` | 自动同步工具：`schedulePush`（8s 防抖推送）、`cancelPush`（取消推送）、`checkAndPullUpdates`（自动拉取）、`getSyncStatusDisplay`（状态显示文案） |
| `drag-store.ts` | 拖拽状态管理（Zustand）：跨组件拖拽素材 |
| `events.ts` | 全局事件总线：`emitAssetsChanged` / `onAssetsChanged`（素材变更事件） |
| `global-avatars.ts` | 全局虚拟人像 API 客户端：增删改查 |
| `global-avatars-sync.ts` | 全局虚拟人像 TOS 同步逻辑 |
| `projects.ts` | 项目 API 客户端：增删改查 + 同步（`pushProjectToCloud`、`getSyncStatus`、`pullProjectFromCloud`） |
| `seedance.ts` | Seedance 请求体构建：素材排列、提示词组装、content 数组生成 |
| `settings.ts` | 应用设置（Zustand）：ARK API Key、TOS 配置、深色模式 |
| `slug.ts` | Slug 生成：中文→拼音首字母、英文原样、`{id前8位}_{label}` 格式 |
| `tasks.ts` | 任务 API 客户端：创建、查询、删除、取消、获取视频 URL |
| `upload.ts` | 文件上传：FormData → `/api/assets/upload` |
| `utils.ts` | 通用工具：`cn()`（Tailwind class 合并） |
| `video-thumbnail.ts` | 视频缩略图提取（Canvas 抽帧） |
| `virtual-avatar-resolve.ts` | 虚拟人像缩略图解析（本地 → TOS → 占位图降级链） |

---

## 自动同步机制

### 设计思路

用户配置 TOS 后，所有项目数据变更自动同步到云端，无需手动操作。

### 触发点

| 用户操作 | 触发行为 |
|---------|---------|
| 打开项目列表页 | `checkAndPullUpdates` — 自动拉取云端新项目/更新 |
| 创建项目 | `schedulePush` — 8 秒防抖后推送 |
| 重命名项目 | `schedulePush` |
| 删除项目 | `cancelPush` — 取消待执行的推送 |
| 上传/删除/排序素材 | `onAssetsChanged` 事件 → `schedulePush` |
| 素材绑定/解绑音频 | `onAssetsChanged` 事件 → `schedulePush` |
| 创建视频生成任务 | `schedulePush` |
| 删除任务 | `schedulePush` |

### 防抖策略

- 推送使用 8 秒防抖（`PUSH_DEBOUNCE_MS = 8000`），避免频繁写入 TOS
- 多次操作合并为一次推送，以最后一次操作时间为准
- 项目删除时立即取消待执行的推送

### 版本控制

- 每次推送原子递增 `cloud_version`（`UPDATE ... SET cloud_version = cloud_version + 1 RETURNING`）
- 拉取时对比本地 `cloud_version` 与云端 `cloudVersion` 判断同步状态
- 拉取操作使用 SQLite 事务保证原子性

### 已知限制

- **推送原子性**：TOS 上传与 SQLite 更新无法在同一事务中。极端情况下（TOS 上传成功但 `last_pushed_at` 更新失败），版本号已递增但推送时间未更新，下次加载会误判为 `local_ahead` 并再次推送。在单用户场景下风险极低。
- **冲突处理**：当检测到冲突（`conflict` 状态）时，目前仅显示警告提示，需用户手动选择保留版本。

---

## TOS 存储路径规范

```
TOS Bucket
├── projects/
│   └── {slug}/                        ← slug = ID前8位 + _ + 名称拼音首字母/英文
│       ├── project.json               ← 项目数据快照（含素材、任务、版本号）
│       ├── assets/
│       │   ├── image/xxx.jpg
│       │   ├── audio/xxx.wav
│       │   ├── video/xxx.mp4
│       │   └── keyframe/xxx.png
│       └── videos/
│           └── cgt-xxx.mp4
├── global-avatars/
│   ├── global-avatars.json            ← 全局虚拟人像数据
│   └── thumbnails/
│       └── xxx.jpg
```

### Slug 生成规则

- 中文 → 拼音首字母大写，英文/数字 → 原样保留，符号/空格 → 跳过
- 示例：`婚礼视频` → `HLSP`，`Project婚礼` → `ProjectHL`，`Updated Project` → `UpdatedProject`
- 完整格式：`{id前8位}_{label}`，如 `d4c1c095_HLSP`
- **Slug 创建后不可变**，重命名项目只更新 `name`，不更新 `slug`
- 工具函数：`src/lib/slug.ts` 的 `generateSlug()`

---

## Seedance API 提示词规范

### 素材类型

| 类型 | 标识 | URL 格式 | 说明 |
|------|------|---------|------|
| 普通图片 | `image` | TOS 公网 URL | 上传到 TOS 的图片 |
| 音频 | `audio` | TOS 公网 URL | 上传到 TOS 的音频 |
| 视频 | `video` | TOS 公网 URL | 上传到 TOS 的视频 |
| 关键帧 | `keyframe` | TOS 公网 URL | 从视频抽帧生成 |
| 虚拟人像 | `virtual_avatar` | `asset://<asset_id>` | 火山方舟虚拟人像库 |

### 素材引用格式

提示词中**必须使用"素材类型+序号"**格式引用素材，序号按请求体中同类素材的排列顺序（从 1 开始）：

- 正确：`图片1中美妆博主面带笑容`
- 错误：`asset-2026****是美妆博主`（禁止在提示词动作描述中直接使用 Asset ID）

### 提示词构建流程

1. **素材定义行**：
   - 普通素材：`图片1为角色描述；图片2为产品描述，声线为音频1`
   - 虚拟人像：`@图片1 为 角色名（资产 ID: [asset-xxx]）`（官方提示词工程最佳实践）
2. **用户提示词**：`@角色名` → 替换为 `图片1(角色名)`
3. **素材 URL**：按顺序添加到 `content` 数组（虚拟人像用 `asset://` 格式）

---

## 环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `ARK_API_KEY` | 是 | 火山方舟 API 密钥（用于 Seedance 视频生成） |
| `ARK_MODEL_ID` | 否 | Seedance 模型 ID（为空时使用默认模型） |
| `COZE_TOS_ENDPOINT` | 否 | TOS Endpoint（自动替换内网域名为外网） |
| `COZE_TOS_ACCESS_KEY` | 否 | TOS Access Key |
| `COZE_TOS_SECRET_KEY` | 否 | TOS Secret Key |
| `COZE_TOS_BUCKET` | 否 | TOS Bucket 名称 |
| `COZE_TOS_REGION` | 否 | TOS 区域（默认 `cn-beijing`） |

> TOS 配置也可通过页面「设置」对话框动态配置，存储在浏览器 localStorage 中。

---

## 包管理规范

**仅允许使用 pnpm**，严禁使用 npm 或 yarn。

```bash
pnpm add <package>        # 安装依赖
pnpm add -D <package>     # 安装开发依赖
pnpm install              # 安装所有依赖
pnpm remove <package>     # 移除依赖
```

---

## 开发规范

### 编码规范

- TypeScript `strict` 模式，禁止隐式 `any` 和 `as any`
- 函数参数、返回值、事件对象使用前必须有明确类型
- 优先复用当前作用域已声明的变量和导入，禁止引用未声明标识符

### next.config 配置规范

- 路径必须使用 `path.resolve(__dirname, ...)` 或 `process.cwd()` 动态拼接，禁止硬编码绝对路径

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 `typeof window`、`Date.now()`、`Math.random()` 等动态数据。**必须使用 `'use client'` + `useEffect` + `useState`** 确保动态内容仅在客户端挂载后渲染
2. 禁止使用 `<head>` 标签，优先使用 `metadata`
3. 三方 CSS/字体在 `globals.css` 顶部 `@import` 引入或使用 `next/font`
4. preload/preconnect 通过 `ReactDOM.preload`、`ReactDOM.preconnect` 方法引入

### UI 设计与组件规范

- 默认采用 `shadcn/ui` 组件、风格和规范（位于 `src/components/ui/`）
- 除非用户指定其他组件库

---

## 待完成 / 后续优化

### 功能层面

- [ ] **冲突解决 UI**：当前冲突仅显示警告，需增加版本对比 + 选择保留/合并的交互
- [ ] **推送前云端版本校验**：每次推送前先读取云端版本验证，避免极端情况覆盖他人数据
- [ ] **离线指示器**：TOS 不可用时显示离线状态，恢复后自动重试推送
- [ ] **批量操作优化**：素材批量上传时合并为一次 schedulePush
- [ ] **同步进度条**：推送/拉取大项目时显示进度（当前为静默后台操作）
- [ ] **项目导出/导入**：支持手动导出 project.json 文件，不依赖 TOS
- [ ] **视频编辑**：视频裁剪、拼接功能（当前仅支持生成和预览）

### 技术层面

- [ ] **数据库备份**：定时备份 SQLite 文件到 TOS
- [ ] **API 错误重试**：网络异常时自动重试（当前直接报错）
- [ ] **任务轮询优化**：从 setInterval 改为 WebSocket 推送（减少无效请求）
- [ ] **前端状态管理重构**：部分页面状态过于庞大（layout.tsx 1700+ 行），需拆分为独立 hooks
- [ ] **E2E 测试**：核心流程（创建项目→上传素材→生成视频）的端到端测试
