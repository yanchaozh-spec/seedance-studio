# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

---

# Seedance 2.0 视频生成工具

## 项目概述

基于 Seedance 2.0 API 的 AI 视频生成工具，支持项目管理、素材库管理和任务管理。

## 页面结构

| 页面 | 路由 | 描述 |
|------|------|------|
| 项目管理 | `/projects` | 项目列表、新建项目、删除项目 |
| 视频生成 | `/projects/[id]` | 视频生成主界面 + 素材库抽屉 |
| 素材库 | `/projects/[id]/materials` | 全屏素材管理（图片 + 音频） |
| 任务管理 | `/projects/[id]/tasks` | 任务列表 + 视频预览抽屉 |

## 核心功能

### 视频生成模块
- 动态添加/删除提示词输入框（默认激活素材引用）
- 素材池：支持拖拽素材从素材库抽屉
- 参数配置：时长(5s/10s)、画幅(16:9/9:16/1:1)、分辨率(720p/1080p)
- 预览最终提示词（调试功能）

### 素材库模块
- 拖拽上传图片/音频
- 图片绑定音频（声线描述）
- 右侧悬浮按钮快速访问抽屉

### 任务管理模块
- 任务列表：状态、进度、时间
- 视频预览抽屉（音量控制、静音）
- 回滚功能：恢复历史提示词和素材
- 下载视频

## 数据库表

- `projects`: 项目表
- `assets`: 素材表（图片+音频统一存储）
- `tasks`: 任务表

## 环境变量

- `ARK_API_KEY`: Seedance API 密钥（必需）
- Supabase 相关变量由平台自动注入

## API 路由

- `POST /api/projects` - 创建项目
- `GET /api/projects` - 获取项目列表
- `DELETE /api/projects/[id]` - 删除项目
- `GET /api/projects/[id]/assets` - 获取素材列表
- `GET /api/projects/[id]/tasks` - 获取任务列表
- `POST /api/seedance/tasks` - 创建视频生成任务
- `GET /api/assets/[id]` - 获取单个素材
- `PATCH /api/assets/[id]` - 更新素材
- `DELETE /api/assets/[id]` - 删除素材
