import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

// 代码审阅的 system prompt
const CODE_REVIEW_SYSTEM_PROMPT = `你是一位资深的前端开发工程师，精通 React、TypeScript、Next.js、shadcn/ui 和 Tailwind CSS。你有丰富的代码审查经验，能够发现潜在的 bug、性能问题、安全隐患和最佳实践违规。

请审阅以下代码，关注以下方面：
1. **Bug 检测**：逻辑错误、空指针、类型错误等
2. **性能问题**：不必要的重渲染、内存泄漏等
3. **安全问题**：XSS、CSRF、敏感信息泄露等
4. **最佳实践**：React 规范、TypeScript 类型安全、Next.js 规范等
5. **用户体验**：交互逻辑、状态管理等

请用中文输出审阅结果，格式如下：
## 审阅结果

### 发现的问题

1. **[问题类型]** 文件:xxx 行号:xxx
   - 问题描述：...
   - 建议修复：...

### 优点

- ...

### 总体评价

...
`;

export async function POST(request: NextRequest) {
  const { code, model, task } = await request.json();
  
  if (!code && !task) {
    return NextResponse.json({ error: "缺少代码内容或任务描述" }, { status: 400 });
  }
  
  const config = new Config();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const client = new LLMClient(config, customHeaders);
  
  const modelId = model === "glm" ? "glm-5-0-260211" : 
                  model === "deepseek" ? "deepseek-r1-250528" : 
                  "doubao-seed-2-0-pro-260215";
  
  const prompt = task === "review" && code
    ? `请审阅以下代码：\n\n\`\`\`typescript\n${code}\n\`\`\`\n\n${CODE_REVIEW_SYSTEM_PROMPT}`
    : `你是一位资深代码审阅专家。请审阅这个项目的任务管理功能代码，关注：
1. 回滚功能是否正确实现
2. 左右侧任务管理的代码是否统一
3. 是否有潜在的 bug 或性能问题

项目描述：
- 这是一个基于 Seedance 2.0 的 AI 视频生成工具
- 使用 Next.js 16 (App Router)、React 19、TypeScript 5
- 使用 shadcn/ui 和 Tailwind CSS 4
- 使用 Supabase 进行数据存储
- 使用 Zustand 进行状态管理

核心功能包括：
- 项目管理
- 素材库管理（图片、音频）
- 任务管理（视频生成任务）
- 回滚功能（将任务数据恢复到视频生成页面）

请进行全面审阅并用中文输出结果。`;
  
  try {
    const response = await client.invoke(
      [{ role: "user", content: prompt }],
      { 
        model: modelId,
        temperature: 0.3,
      }
    );
    
    return NextResponse.json({ 
      content: response.content,
      model: modelId,
    });
  } catch (error) {
    console.error("LLM 调用失败:", error);
    return NextResponse.json({ error: "LLM 调用失败" }, { status: 500 });
  }
}
