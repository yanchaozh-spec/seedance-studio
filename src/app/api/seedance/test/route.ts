import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();
    
    if (!apiKey) {
      return NextResponse.json({ error: "API Key 不能为空" }, { status: 400 });
    }
    
    // 调用 Seedance API 测试连通性
    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "ep-20250416153929-9r28j",
        messages: [
          {
            role: "user",
            content: "你好，请回复'连接测试成功'",
          },
        ],
        max_tokens: 10,
      }),
    });
    
    if (response.ok) {
      return NextResponse.json({ success: true });
    } else {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.error?.message || `API 返回错误: ${response.status}` 
        }, 
        { status: response.status }
      );
    }
  } catch (error) {
    console.error("Seedance API test error:", error);
    return NextResponse.json(
      { success: false, error: "网络请求失败，请检查 API 地址和网络连接" },
      { status: 500 }
    );
  }
}
