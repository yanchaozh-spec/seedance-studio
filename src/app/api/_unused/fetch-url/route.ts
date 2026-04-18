import { NextRequest, NextResponse } from 'next/server';
import { FetchClient, Config } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    const config = new Config();
    const client = new FetchClient(config);
    
    const response = await client.fetch(url);
    
    if (response.status_code !== 0) {
      return NextResponse.json({ 
        error: response.status_message || 'Failed to fetch URL' 
      }, { status: 500 });
    }
    
    // 提取文本内容
    const textContent = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
    
    return NextResponse.json({
      title: response.title,
      content: textContent,
      url: response.url,
      status: 'success'
    });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
