import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  const { question } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { 
      role: "system", 
      content: "你是一位资深前端工程师，擅长React、TypeScript、Next.js开发。你需要分析右侧回滚功能不工作的原因。请给出详细的诊断和修复建议。"
    },
    { 
      role: "user", 
      content: question
    }
  ];

  let fullResponse = "";
  const stream = client.stream(messages, { 
    model: "glm-5-0-260211", 
    temperature: 0.7,
    thinking: "enabled"
  });

  for await (const chunk of stream) {
    if (chunk.content) {
      fullResponse += chunk.content.toString();
    }
  }

  return NextResponse.json({ result: fullResponse });
}
