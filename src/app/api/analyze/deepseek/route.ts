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
      content: "You are a senior frontend engineer specializing in React, TypeScript, Next.js. Analyze why the right-side rollback feature is not working. Provide detailed diagnosis and fix suggestions."
    },
    { 
      role: "user", 
      content: question
    }
  ];

  let fullResponse = "";
  const stream = client.stream(messages, { 
    model: "deepseek-v3-2-251201", 
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
