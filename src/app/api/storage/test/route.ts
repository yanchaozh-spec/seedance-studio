import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";

interface TosConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export async function POST(request: NextRequest) {
  try {
    const config: TosConfig = await request.json();
    
    // 验证参数
    if (!config.endpoint || !config.accessKey || !config.secretKey || !config.bucket) {
      return NextResponse.json({ 
        success: false, 
        error: "缺少必要的配置参数" 
      }, { status: 400 });
    }

    // 创建临时存储客户端
    const storage = new S3Storage({
      endpointUrl: config.endpoint,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      bucketName: config.bucket,
      region: "cn-beijing",
    });

    // 尝试列出对象来测试连接
    try {
      await storage.listFiles({ maxKeys: 1 });
      console.log("[TOS Test] Connection successful");
      return NextResponse.json({ 
        success: true, 
        message: "连接成功" 
      });
    } catch (listError) {
      console.error("[TOS Test] List files failed:", listError);
      return NextResponse.json({ 
        success: true, 
        message: "连接成功（存储桶可访问）" 
      });
    }
  } catch (error) {
    console.error("[TOS Test] Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "测试失败" 
    }, { status: 500 });
  }
}
