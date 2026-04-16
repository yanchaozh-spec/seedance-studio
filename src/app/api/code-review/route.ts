import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { readFileSync } from "fs";
import { join } from "path";

const MODELS = [
  "doubao-seed-2-0-pro-260215",
  "kimi-k2-5-260127", 
  "deepseek-v3-2-251201"
];

const CODE_FILES = [
  { path: "src/app/projects/[id]/layout.tsx", name: "布局和拖拽组件" },
  { path: "src/app/projects/[id]/page.tsx", name: "视频生成页面" },
  { path: "src/hooks/use-draggable.ts", name: "拖拽 hook" },
  { path: "src/lib/drag-store.ts", name: "拖拽状态管理" },
];

const REVIEW_PROMPT = `你是代码审阅专家。请审阅以下代码，重点关注拖拽功能的实现是否正确。

用户需求：
1. 从素材库抽屉拖拽素材到素材池
2. 素材必须只在鼠标拖拽到素材池并释放（drop）后才添加
3. 禁止点击就添加到素材池
4. "拖拽中"提示只在真正拖拽时显示
5. 拖拽结束后状态要正确重置

请仔细分析代码，指出：
1. 拖拽流程是否正确实现
2. 是否有会导致 bug 的代码
3. 具体的问题和修复建议

代码文件：{filename}
---
{code}
---

请用中文回复，格式：
### 问题列表
1. [问题描述]
2. [问题描述]
...

### 修复建议
1. [建议]
2. [建议]
...`;

async function reviewWithModel(model: string, code: string, filename: string): Promise<string> {
  const config = new Config();
  const client = new LLMClient(config);
  
  const messages = [
    { 
      role: "user", 
      content: REVIEW_PROMPT.replace("{filename}", filename).replace("{code}", code.slice(0, 8000))
    }
  ];

  try {
    const response = await client.invoke(messages, { 
      model,
      temperature: 0.3
    });
    return response.content;
  } catch (error) {
    return `模型 ${model} 审阅失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const results: { model: string; reviews: { file: string; review: string }[] }[] = [];
    
    // 读取代码文件
    const codes: { path: string; content: string }[] = [];
    for (const file of CODE_FILES) {
      try {
        const content = readFileSync(join(process.cwd(), file.path), "utf-8");
        codes.push({ path: file.path, content });
      } catch {
        codes.push({ path: file.path, content: `无法读取文件: ${file.path}` });
      }
    }

    // 并行让三个模型审阅所有文件
    const reviewsPromises = MODELS.map(async (model) => {
      const reviews = await Promise.all(
        codes.map(async (code) => ({
          file: code.path,
          review: await reviewWithModel(model, code.content, code.path)
        }))
      );
      return { model, reviews };
    });

    const allResults = await Promise.all(reviewsPromises);
    
    return NextResponse.json({
      success: true,
      models: MODELS,
      results: allResults
    });
  } catch (error) {
    console.error("审阅失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
