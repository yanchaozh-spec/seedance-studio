import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  const { code, problem } = await request.json();
  
  const config = new Config();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const client = new LLMClient(config, customHeaders);

  const messages: Array<{ role: "user"; content: string }> = [
    { 
      role: "user", 
      content: `你是一个前端 React/Next.js 专家。以下是一个布局组件的问题描述和代码片段。请分析问题并给出具体的修复方案，只需要返回修改后的代码片段（完整代码，不要省略）。\n\n问题：${problem}\n\n代码：\n${code}`
    }
  ];

  try {
    const response = await client.invoke(messages, { 
      model: "glm-5-0-260211",
      temperature: 0.3 
    });

    return NextResponse.json({ 
      success: true, 
      result: response.content 
    });
  } catch (error) {
    console.error("LLM Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "LLM 调用失败" 
    }, { status: 500 });
  }
}
