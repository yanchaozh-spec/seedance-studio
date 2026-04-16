import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config } from "coze-coding-dev-sdk";

const CONSENSUS_PROMPT = `你是代码架构师。请根据以下三个模型的审阅意见，总结出需要修复的关键问题，并给出具体的修复方案。

三个模型的审阅意见：

模型1 (doubao-seed-2-0-pro-260215) 发现的问题：
1. layout.tsx - 缺少素材池的Drop事件处理逻辑，重复监听冲突，未阻止素材池以外区域的Drop默认行为
2. page.tsx - 拖放数据类型校验缺失，重复添加素材未做拦截，拖拽状态可能不一致
3. use-draggable.ts - 拖拽触发逻辑错误，点击就会进入拖拽状态，拖拽数据设置不匹配
4. drag-store.ts - 拖拽状态管理逻辑存在漏洞，无法防止点击误触发

模型2 (kimi-k2-5-260127) 发现的问题：
1. layout.tsx - useEffect 监听全局 dragend 导致状态可能被重复重置，拖拽数据传递方式不安全
2. page.tsx - 拖拽功能依赖不完整，拖拽数据传递可能不匹配，素材池拖放区域未阻止默认行为
3. use-draggable.ts - 拖拽数据传递机制不匹配，缺少原生HTML5拖拽事件绑定
4. drag-store.ts - 状态管理不完整，缺少拖拽目标状态

模型3 (deepseek-v3-2-251201) 发现的问题：
1. layout.tsx - 拖拽触发逻辑问题，点击就进入拖拽状态，全局事件监听冲突
2. page.tsx - 拖拽状态重置逻辑缺失，useDropZone 实现细节不明确
3. use-draggable.ts - 缺少原生拖拽事件支持，触摸事件与指针事件状态不同步
4. drag-store.ts - 缺少拖拽目标验证，状态重置容错机制不足

请分析这些意见的共同点，识别最关键的问题，并给出：
1. 需要修复的核心问题列表（按优先级排序）
2. 每个问题的具体修复方案
3. 修复后的代码结构说明

用中文回复。`;

export async function POST(request: NextRequest) {
  try {
    const config = new Config();
    const client = new LLMClient(config);
    
    const messages = [
      { role: "user", content: CONSENSUS_PROMPT }
    ];

    const response = await client.invoke(messages, { 
      model: "doubao-seed-2-0-pro-260215",
      temperature: 0.3
    });

    return NextResponse.json({
      success: true,
      consensus: response.content
    });
  } catch (error) {
    console.error("共识讨论失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
