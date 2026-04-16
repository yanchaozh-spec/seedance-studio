import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config } from "coze-coding-dev-sdk";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// 审阅使用的模型
const REVIEW_MODELS = [
  "kimi-k2-5-260127",      // 模型1: Kimi K2.5 - 代码能力强
  "deepseek-v3-2-251201"    // 模型2: DeepSeek V3.2 - 推理能力强
];

// Seedance 2.0 API 文档信息
const SEEDANCE_API_INFO = `
## Seedance 2.0 API 信息

### API 端点
- 基础 URL: https://ark.cn-beijing.volces.com/api/v3
- 模型 ID: doubao-seedance-2-0-260128

### 核心 API

#### 1. 创建视频生成任务
POST /contents/generations/tasks

请求体:
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "提示词文本" },
    { "type": "image_url", "image_url": { "url": "图片URL" } }
  ],
  "generate_audio": true,        // 是否生成音频
  "ratio": "16:9",               // 画幅: 16:9, 9:16, adaptive
  "duration": 5,                 // 时长: 5-15秒
  "watermark": false,            // 是否添加水印
  "first_frame_image": {         // 首帧图片（可选）
    "url": "图片URL"
  },
  "first_frame_description": ""  // 首帧描述（可选）
}

响应:
{
  "id": "task_id",
  "status": "queued"
}

#### 2. 获取任务状态
GET /contents/generations/tasks/{task_id}

响应:
{
  "id": "task_id",
  "status": "queued|running|succeeded|failed",
  "content": {
    "video_url": "生成的视频URL"
  },
  "resolution": "720p|1080p",
  "duration": 5,
  "error": { "message": "错误信息" }
}

### 提示词格式要求
1. 图片引用格式: "图片名"@这张图片
2. 声线描述: ，声线为"声线描述"
3. 首帧格式: 视频首帧@"图片名"，描述内容
`;

// 需要审阅的代码文件列表
const CODE_FILES_TO_REVIEW = [
  { path: "src/app/projects/[id]/layout.tsx", name: "项目布局和拖拽组件", category: "frontend" },
  { path: "src/app/projects/[id]/page.tsx", name: "视频生成主页面", category: "frontend" },
  { path: "src/app/projects/[id]/materials/page.tsx", name: "素材管理页面", category: "frontend" },
  { path: "src/app/projects/[id]/tasks/page.tsx", name: "任务管理页面", category: "frontend" },
  { path: "src/hooks/use-draggable.ts", name: "拖拽 Hook", category: "frontend" },
  { path: "src/lib/drag-store.ts", name: "拖拽状态管理", category: "frontend" },
  { path: "src/lib/assets.ts", name: "素材 API 封装", category: "frontend" },
  { path: "src/lib/tasks.ts", name: "任务 API 封装", category: "frontend" },
  { path: "src/app/api/seedance/tasks/route.ts", name: "Seedance 任务 API", category: "backend" },
  { path: "src/app/api/seedance/poll/route.ts", name: "Seedance 轮询 API", category: "backend" },
  { path: "src/app/api/assets/[id]/route.ts", name: "素材 CRUD API", category: "backend" },
  { path: "src/app/api/assets/upload/route.ts", name: "素材上传 API", category: "backend" },
];

// 模型 temperature 配置（Kimi K2.5 有特殊限制）
const MODEL_TEMPERATURE: Record<string, number> = {
  "kimi-k2-5-260127": 0.6,  // Kimi K2.5 非思考模式固定 0.6
  "deepseek-v3-2-251201": 0.3,
  "doubao-seed-2-0-pro-260215": 0.3,
};

function getTemperature(modelId: string): number {
  return MODEL_TEMPERATURE[modelId] || 0.3;
}
const getReviewPrompt = (modelName: string) => `
你是专业的代码审阅专家和 AI 应用架构师。请审阅以下基于 Seedance 2.0 的视频生成工具的完整代码。

## 你的角色
你是 ${modelName}，专注于：
1. 代码质量和最佳实践
2. 功能完整性
3. Seedance 2.0 API 的正确使用
4. 用户体验和交互逻辑

## 项目概述
这是一个基于 Next.js + React 的 AI 视频生成工具，核心功能包括：
- 项目管理：创建、删除、查看项目
- 素材库管理：上传图片/音频、绑定音频、抽帧
- 视频生成：通过 Seedance 2.0 API 生成视频
- 任务管理：查看任务状态、预览视频、回滚

## Seedance 2.0 API 参考
${SEEDANCE_API_INFO}

## 审阅重点
请重点关注以下方面：

### 1. 拖拽功能（核心问题）
- 素材必须只在拖拽到素材池并释放（drop）后才添加
- 禁止点击就添加到素材池
- "拖拽中"提示只在真正拖拽时显示
- 拖拽结束后状态要正确重置

### 2. Seedance API 调用
- API 请求参数是否正确
- 提示词格式是否符合要求
- 图片/音频素材是否正确传递
- 首帧功能是否正确实现

### 3. 前端功能
- 素材上传和管理
- 任务创建和状态轮询
- 视频预览和下载
- 回滚功能

### 4. 数据流
- 前端 -> API -> Seedance API -> 数据库
- 状态管理是否正确

## 代码文件列表
{fileList}

## 代码内容
{code}

## 输出要求
请按以下格式输出审阅结果：

### 1. 核心问题列表（按严重程度排序）
- [P0] 问题描述（必须立即修复）
- [P1] 问题描述（应该修复）
- [P2] 问题描述（建议修复）

### 2. 功能完整性检查
- [x] 已实现的功能
- [ ] 未实现或有问题 的功能

### 3. 具体修复建议
对于每个问题，提供：
- 问题位置
- 问题原因
- 修复方案（包含代码示例）

### 4. 代码质量评分（1-10分）
- 前端代码质量
- 后端 API 质量
- 整体架构

请用中文回复，确保审阅意见具体、可操作。
`;

// 读取所有代码文件
function readAllCodeFiles(): { path: string; name: string; content: string; category: string }[] {
  const results: { path: string; name: string; content: string; category: string }[] = [];
  
  for (const file of CODE_FILES_TO_REVIEW) {
    try {
      const content = readFileSync(join(process.cwd(), file.path), "utf-8");
      results.push({
        ...file,
        content
      });
    } catch {
      results.push({
        ...file,
        content: `// 无法读取文件: ${file.path}`
      });
    }
  }
  
  return results;
}

// 让单个模型审阅所有代码
async function reviewWithModel(model: string, modelDisplayName: string, codeFiles: { path: string; name: string; content: string; category: string }[]): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config);
  
  const fileList = codeFiles.map(f => `- ${f.path} (${f.name}) [${f.category}]`).join("\n");
  
  // 按类别组织代码
  const frontendFiles = codeFiles.filter(f => f.category === "frontend");
  const backendFiles = codeFiles.filter(f => f.category === "backend");
  
  const prompt = getReviewPrompt(modelDisplayName)
    .replace("{fileList}", fileList)
    .replace("{code}", `
=== 前端代码 (${frontendFiles.length} 个文件) ===
${frontendFiles.map(f => `
--- ${f.path} ---
${f.content}
`).join("\n\n")}

=== 后端 API 代码 (${backendFiles.length} 个文件) ===
${backendFiles.map(f => `
--- ${f.path} ---
${f.content}
`).join("\n\n")}
`);

  try {
    const temperature = getTemperature(model);
    const response = await client.invoke(
      [{ role: "user", content: prompt }],
      { 
        model,
        temperature
      }
    );
    return response.content;
  } catch (error) {
    return `模型 ${modelDisplayName} 审阅失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 并行审阅入口
export async function POST(request: NextRequest) {
  try {
    const { model } = await request.json().catch(() => ({}));
    
    // 如果指定了特定模型，只运行该模型
    const targetModels = model 
      ? [{ id: model, name: model }] 
      : REVIEW_MODELS.map(m => ({ 
          id: m, 
          name: m.includes("kimi") ? "Kimi K2.5" : "DeepSeek V3.2" 
        }));
    
    // 读取所有代码文件
    const codeFiles = readAllCodeFiles();
    
    console.log(`开始代码审阅，${targetModels.length} 个模型，${codeFiles.length} 个文件`);
    
    // 并行让所有模型审阅
    const reviews = await Promise.all(
      targetModels.map(async ({ id, name }) => {
        console.log(`调用模型: ${id} (${name})`);
        const review = await reviewWithModel(id, name, codeFiles);
        return { model: name, modelId: id, review };
      })
    );
    
    return NextResponse.json({
      success: true,
      reviews,
      summary: {
        totalFiles: codeFiles.length,
        modelsUsed: targetModels.map(m => m.name),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("代码审阅失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// 获取支持的模型列表
export async function GET() {
  return NextResponse.json({
    models: REVIEW_MODELS.map(m => ({
      id: m,
      name: m.includes("kimi") ? "Kimi K2.5" : "DeepSeek V3.2",
      description: "代码审阅专家"
    })),
    files: CODE_FILES_TO_REVIEW
  });
}
