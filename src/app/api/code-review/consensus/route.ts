import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config } from "coze-coding-dev-sdk";

const CONSENSUS_PROMPT = `
你是代码架构师和首席技术评审。请根据以下两个 AI 模型的代码审阅意见，分析共识和分歧，并给出最终的修复方案。

## 审阅任务背景
这是一个基于 Seedance 2.0 API 的 AI 视频生成工具，使用 Next.js + React + Supabase 构建。

核心问题需要解决：
1. 拖拽功能：素材只在 drop 时添加，禁止点击添加
2. Seedance API 调用：正确传递参数和提示词
3. 状态管理：拖拽状态、素材池、任务状态
4. 功能完整性：所有页面和 API 的正确实现

## 模型1 (Kimi K2.5) 的审阅意见
{review1}

## 模型2 (DeepSeek V3.2) 的审阅意见
{review2}

## 你的任务

### 1. 分析共识和分歧
- 两个模型都发现的问题（高优先级）
- 两个模型有分歧的问题
- 只有一个模型发现的问题

### 2. 生成最终修复方案
对于每个需要修复的问题，请提供：
- **问题 ID**: PRB-XXX
- **问题描述**: 简明扼要
- **严重程度**: P0/P1/P2
- **影响范围**: 哪些文件/功能受影响
- **修复方案**: 具体代码修改建议
- **验证方法**: 如何确认修复成功

### 3. 优先级排序
按以下顺序排列修复任务：
1. P0: 阻止功能正常工作的 bug
2. P0: 数据安全问题
3. P1: 功能不完整
4. P1: 性能问题
5. P2: 代码质量改进

### 4. 修改文件清单
列出所有需要修改的文件，并说明修改内容摘要。

## 输出格式

### 问题汇总表
| ID | 问题 | 严重度 | 涉及文件 | 状态 |
|----|------|--------|----------|------|
| PRB-001 | ... | P0 | ... | 待修复 |

### 详细修复方案
...

### 优先级计划
1. 第一优先级（P0）...
2. 第二优先级（P1）...
3. 第三优先级（P2）...

请用中文回复，确保方案具体、可执行。
`;

// 生成修复代码的提示词
const GENERATE_FIX_PROMPT = `
你是资深前端工程师。请根据以下修复方案，生成具体的代码修改。

## 需要修复的问题
{problems}

## 现有代码参考
{codeReference}

## 输出要求
对于每个问题，提供：
1. 修改的文件路径
2. 原始代码（相关部分）
3. 修改后的代码
4. 修改说明

请确保代码符合：
- TypeScript 严格模式
- React 最佳实践
- Next.js App Router 规范
- 拖拽功能正确实现

用中文回复。
`;

export async function POST(request: NextRequest) {
  try {
    const { reviews, action } = await request.json();
    
    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json(
        { success: false, error: "需要提供 reviews 数组" },
        { status: 400 }
      );
    }
    
    const review1 = reviews[0]?.review || "";
    const review2 = reviews[1]?.review || "";
    
    const config = new Config();
    const client = new LLMClient(config);
    
    // 生成共识
    const consensusPrompt = CONSENSUS_PROMPT
      .replace("{review1}", review1.slice(0, 10000))
      .replace("{review2}", review2.slice(0, 10000));
    
    console.log("生成共识分析...");
    const consensusResponse = await client.invoke(
      [{ role: "user", content: consensusPrompt }],
      { model: "doubao-seed-2-0-pro-260215", temperature: 0.3 }
    );
    
    let fixPlan = null;
    if (action === "generate_fixes") {
      // 如果要求生成修复代码
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      
      // 读取需要修复的文件
      const filesToRead = [
        "src/hooks/use-draggable.ts",
        "src/lib/drag-store.ts",
        "src/app/projects/[id]/layout.tsx",
        "src/app/projects/[id]/page.tsx"
      ];
      
      const codeRef = filesToRead.map(path => {
        try {
          return `--- ${path} ---\n${readFileSync(join(process.cwd(), path), "utf-8").slice(0, 3000)}`;
        } catch {
          return `--- ${path} ---\n// 无法读取`;
        }
      }).join("\n\n");
      
      const fixPrompt = GENERATE_FIX_PROMPT
        .replace("{problems}", consensusResponse.content.slice(0, 5000))
        .replace("{codeReference}", codeRef);
      
      console.log("生成修复代码...");
      const fixResponse = await client.invoke(
        [{ role: "user", content: fixPrompt }],
        { model: "doubao-seed-2-0-pro-260215", temperature: 0.2 }
      );
      
      fixPlan = fixResponse.content;
    }
    
    return NextResponse.json({
      success: true,
      consensus: consensusResponse.content,
      fixPlan
    });
  } catch (error) {
    console.error("共识生成失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
