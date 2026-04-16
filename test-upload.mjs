import { createReadStream } from 'fs';
import { writeFileSync } from 'fs';

// 创建一个测试文件
writeFileSync('/tmp/test-upload.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

console.log('Test file created');
