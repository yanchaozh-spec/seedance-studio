import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  const { question } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config();

  // 并行调用 GLM 和 DeepSeek
  const [glmResult, deepseekResult] = await Promise.all([
    callLLM(config, customHeaders, "glm-5-0-260211", question, "你是一位资深前端工程师，擅长React、TypeScript、Next.js开发。请分析以下问题，给出详细的诊断意见。"),
    callLLM(config, customHeaders, "deepseek-v3-2-251201", question, "You are a senior frontend engineer, expert in React, TypeScript, Next.js. Analyze the following issue and provide detailed diagnosis.")
  ]);

  return NextResponse.json({
    glm: glmResult,
    deepseek: deepseekResult
  });
}

async function callLLM(
  config: Config,
  customHeaders: Record<string, string>,
  model: string,
  question: string,
  systemPrompt: string
): Promise<string> {
  const client = new LLMClient(config, customHeaders);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { 
      role: "user", 
      content: question + "\n\n请分析这个回滚功能的问题，给出具体的代码修改建议。"
    }
  ];

  try {
    let fullResponse = "";
    const stream = client.stream(messages, { 
      model, 
      temperature: 0.7,
      thinking: "disabled"
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content.toString();
      }
    }
    return fullResponse;
  } catch (error) {
    return `Error calling ${model}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
