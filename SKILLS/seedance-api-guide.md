# 方舟平台视频生成 API 文档

本文档整合了火山方舟平台视频生成相关的 API 调用指南，涵盖 API Key 配置、SDK 安装、鉴权方式以及视频生成任务的完整 API 调用规范。

---

## 目录

1. [API Key 配置](#1-api-key-配置)
2. [SDK 安装指南](#2-sdk-安装指南)
3. [API 鉴权方式](#3-api-鉴权方式)
4. [视频生成 API](#4-视频生成-api)
   - [创建视频生成任务](#41-创建视频生成任务)
   - [查询视频生成任务](#42-查询视频生成任务)
   - [批量查询视频生成任务](#43-批量查询视频生成任务)
   - [删除视频生成任务](#44-删除视频生成任务)

---

## 1. API Key 配置

### 1.1 获取 API Key

1. 打开并登录 [API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) 页面
2. （可选）单击左上角 **账号全部资源** 下拉箭头，切换项目空间
3. 单击 **创建 API Key** 按钮
4. 在弹出框的 **名称** 文本框中确认/更改 API Key 名称，单击创建

### 1.2 配置 API Key

**推荐将 API Key 配置在环境变量中**，而不是硬编码进代码中，避免 API Key 随代码泄露。

本项目中，API Key 通过 `ARK_API_KEY` 环境变量配置，在调用 API 时通过请求头传递：
```
Authorization: Bearer $ARK_API_KEY
```

### 1.3 使用说明

- **API Key 配额**：一个主账号下支持创建 50 个 API Key
- **API Key 权限控制**：API Key 创建于当前项目，用于访问当前项目下的资源
- **跨项目限制**：API Key 仅支持访问指定项目下的接入点，不支持跨项目访问

---

## 2. SDK 安装指南

方舟提供了 Python、Go 和 Java 的 SDK，方便使用对应编程语言快速调用方舟的模型服务。

### 2.1 Python SDK

**前提条件**：Python 版本不低于 3.7

```bash
# 安装 Python SDK
pip install 'volcengine-python-sdk[ark]'

# 或使用 uv
uv pip install 'volcengine-python-sdk[ark]'

# 升级 SDK
pip install 'volcengine-python-sdk[ark]' -U
```

### 2.2 Go SDK

**前提条件**：Go 1.18 或以上

```bash
# 初始化 go mod
go mod init <YOUR_PROJECT_NAME>

# 安装 SDK
go get -u github.com/volcengine/volcengine-go-sdk

# 在代码中引入
import "github.com/volcengine/volcengine-go-sdk/service/arkruntime"

# 整理依赖
go mod tidy
```

### 2.3 Java SDK

**前提条件**：Java 1.8 或以上

**Maven 安装**：
```xml
<dependency>
  <groupId>com.volcengine</groupId>
  <artifactId>volcengine-java-sdk-ark-runtime</artifactId>
  <version>LATEST</version>
</dependency>
```

**Gradle 安装**：
```groovy
implementation 'com.volcengine:volcengine-java-sdk-ark-runtime:LATEST'
```

### 2.4 第三方 SDK（兼容 OpenAI）

火山方舟 API 与 OpenAI API 协议兼容，可使用兼容 OpenAI API 协议的多语言社区 SDK。

---

## 3. API 鉴权方式

### 3.1 Base URL

- **数据面 API**：https://ark.cn-beijing.volces.com/api/v3
- **管控面 API**：https://ark.cn-beijing.volcengineapi.com/

### 3.2 API Key 签名鉴权（推荐）

在 HTTP 请求 header 中添加 `Authorization` header：

```bash
Authorization: Bearer $ARK_API_KEY
```

**调用示例**：
```bash
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Hello!"
        }
    ]
  }'
```

### 3.3 Access Key 签名鉴权

适用于传统云上资源权限管控场景，具体方法请参考[官方文档](https://www.volcengine.com/docs/6369/67269)。

---

## 4. 视频生成 API

### 4.1 创建视频生成任务

**接口**：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`

**鉴权**：仅支持 API Key 鉴权

#### 请求参数

**model** `string` **必填**
- 需要调用的模型 ID（Model ID）或自定义推理节点接入点 ID
- 可通过 [模型列表](https://www.volcengine.com/docs/82379/1330310) 查询
- 本系统使用自定义推理节点接入点 ID：`ep-m-20260417004442-42dzs`

**content** `object[]` **必填**
- 输入给模型生成视频的信息，支持文本、图片、音频、视频

**文本信息**：
```json
{
  "type": "text",
  "text": "小猫对着镜头打哈欠"
}
```

**图片信息**：
```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://example.com/image.jpg"  // 或 Base64: "data:image/png;base64,xxx"
  },
  "role": "first_frame"  // first_frame | last_frame | reference_image
}
```

**视频信息**（仅 seedance 2.0）：
```json
{
  "type": "video_url",
  "video_url": {
    "url": "https://example.com/video.mp4"
  },
  "role": "reference_video"
}
```

**音频信息**（仅 seedance 2.0）：
```json
{
  "type": "audio_url",
  "audio_url": {
    "url": "https://example.com/audio.wav"
  },
  "role": "reference_audio"
}
```

**resolution** `string`
- 视频分辨率：`480p` | `720p` | `1080p`
- 默认值：seedance 2.0/1.5 pro/lite 为 `720p`，seedance 1.0 pro 为 `1080p`

**ratio** `string`
- 视频宽高比：`16:9` | `4:3` | `1:1` | `3:4` | `9:16` | `21:9` | `adaptive`
- 默认值：seedance 2.0/1.5 pro 为 `adaptive`

**duration** `integer`
- 生成视频时长（秒）
- seedance 2.0: [4, 15] 或 `-1`（智能指定）
- seedance 1.5 pro: [4, 12] 或 `-1`
- seedance 1.0: [2, 12]

**seed** `integer`
- 种子整数，用于控制生成内容的随机性
- 取值范围：[-1, 2^32-1]
- `-1` 表示随机

**return_last_frame** `boolean`
- 是否返回生成视频的尾帧图像
- 默认值：`false`

**generate_audio** `boolean`
- 是否生成同步音频（仅 seedance 2.0/1.5 pro）
- 默认值：`true`

**watermark** `boolean`
- 生成视频是否包含水印
- 默认值：`false`

**service_tier** `string`
- 服务等级：`default`（在线推理）| `flex`（离线推理）
- 默认值：`default`

**callback_url** `string`
- 回调通知地址，任务状态变化时推送 POST 请求

**execution_expires_after** `integer`
- 任务超时阈值（秒）
- 默认值：172800（48小时）
- 取值范围：[3600, 259200]

#### 请求示例

**文生视频**：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "text",
      "text": "日落海边，镜头缓慢推进"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true
}
```

**图生视频（首帧）**：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/first_frame.jpg"
      },
      "role": "first_frame"
    },
    {
      "type": "text",
      "text": "小猫伸懒腰，转身离开"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5
}
```

**图生视频（首尾帧）**：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/first.jpg"
      },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/last.jpg"
      },
      "role": "last_frame"
    },
    {
      "type": "text",
      "text": "小猫从起点走向终点"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5
}
```

**多模态参考生视频**（seedance 2.0）：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/ref1.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/ref2.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "text",
      "text": "两个角色在草地上对话"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 10
}
```

#### 响应参数

```json
{
  "id": "cgt-20250417001234-abc123"
}
```

返回任务 ID 后，需要通过查询接口轮询任务状态。

---

### 4.2 查询视频生成任务

**接口**：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`

**鉴权**：API Key 鉴权

#### 请求参数

**id** `string` **必填**
- 需要查询的视频生成任务 ID

#### 响应参数

**id** `string`
- 视频生成任务 ID

**model** `string`
- 任务使用的模型名称和版本

**status** `string`
- 任务状态：`queued` | `running` | `cancelled` | `succeeded` | `failed` | `expired`

**error** `object | null`
- 错误信息，失败时返回
  - `code`: 错误码
  - `message`: 错误提示

**created_at** `integer`
- 任务创建时间的 Unix 时间戳（秒）

**updated_at** `integer`
- 任务状态更新时间的 Unix 时间戳（秒）

**content** `object`
- 视频生成任务的输出内容
  - `video_url`: 生成视频的 URL（mp4）
  - `last_frame_url`: 视频尾帧图像 URL

**resolution** `string`
- 生成视频的分辨率

**ratio** `string`
- 生成视频的宽高比

**duration** `integer`
- 生成视频的时长（秒）

**usage** `object`
- Token 用量
  - `completion_tokens`: 消耗的 token 数量
  - `total_tokens`: 总 token 数量

#### 响应示例

**任务进行中**：
```json
{
  "id": "cgt-20250417001234-abc123",
  "model": "doubao-seedance-2-0-260128",
  "status": "running",
  "created_at": 1713302400,
  "updated_at": 1713302410
}
```

**任务成功**：
```json
{
  "id": "cgt-20250417001234-abc123",
  "model": "doubao-seedance-2-0-260128",
  "status": "succeeded",
  "created_at": 1713302400,
  "updated_at": 1713302500,
  "content": {
    "video_url": "https://ark.volcengine.com/video/xxx.mp4",
    "last_frame_url": "https://ark.volcengine.com/video/xxx_last.png"
  },
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "usage": {
    "completion_tokens": 1000,
    "total_tokens": 1000
  }
}
```

**任务失败**：
```json
{
  "id": "cgt-20250417001234-abc123",
  "model": "doubao-seedance-2-0-260128",
  "status": "failed",
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "图片尺寸不符合要求"
  }
}
```

---

### 4.3 批量查询视频生成任务

**接口**：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`

**鉴权**：API Key 鉴权

#### 请求参数（Query String）

**page_num** `integer`
- 页码，取值范围：[1, 500]

**page_size** `integer`
- 每页数量，取值范围：[1, 500]

**filter.status** `string`
- 按任务状态过滤：`queued` | `running` | `cancelled` | `succeeded` | `failed`

**filter.task_ids** `string[]`
- 精确搜索多个任务 ID，多个用 `&` 连接
- 示例：`filter.task_ids=id1&filter.task_ids=id2`

**filter.model** `string`
- 按推理接入点 ID 过滤

#### 响应参数

**items** `object[]`
- 查询到的视频生成任务列表，字段同单个查询接口

**total** `integer`
- 符合筛选条件的任务总数

---

### 4.4 删除视频生成任务

**接口**：`DELETE https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`

**鉴权**：API Key 鉴权

#### 请求参数

**id** `string` **必填**
- 需要取消或删除的视频生成任务 ID

#### 操作说明

| 当前任务状态 | 是否支持 DELETE | 操作含义 | DELETE 后状态 |
|-------------|----------------|----------|--------------|
| queued | 是 | 取消排队 | cancelled |
| running | 否 | - | - |
| succeeded | 是 | 删除任务记录 | - |
| failed | 是 | 删除任务记录 | - |
| cancelled | 否 | - | - |
| expired | 是 | 删除任务记录 | - |

#### 响应

本接口无返回参数，成功返回 HTTP 200。

---

## 5. 使用注意事项

### 5.1 费用说明

- 请确保账户余额大于等于 200 元，或已购买资源包
- seedance 2.0 系列模型存在最低 token 用量限制
- 生成的视频会在 24 小时后被清理，请及时转存
- 视频尾帧图像有效期为 24 小时

### 5.2 调用建议

1. **轮询策略**：创建任务后，建议每 3-5 秒轮询一次状态
2. **超时处理**：设置 `execution_expires_after` 避免任务无限等待
3. **错误处理**：注意处理 `failed` 和 `expired` 状态
4. **资源转存**：及时将生成的视频转存到自己的存储服务

### 5.3 常见问题

1. **真人脸图片限制**：seedance 2.0 系列模型不支持直接上传含有真人人脸的参考图/视频
2. **首尾帧宽高比**：首尾帧图片宽高比不一致时，以首帧图片为主
3. **音频限制**：不可单独输入音频，应至少包含 1 个参考视频或图片

---

## 6. 附录：视频生成模型能力对照表

| 模型 | 文生视频 | 图生视频-首帧 | 图生视频-首尾帧 | 多模态参考 | 有声视频 |
|-----|---------|--------------|----------------|-----------|---------|
| seedance 2.0 | ✅ | ✅ | ✅ | ✅（1-9张图） | ✅ |
| seedance 2.0 fast | ✅ | ✅ | ✅ | ✅（1-9张图） | ✅ |
| seedance 1.5 pro | ✅ | ✅ | ✅ | ❌ | ✅ |
| seedance 1.0 pro | ✅ | ✅ | ✅ | ❌ | ❌ |
| seedance 1.0 pro fast | ✅ | ✅ | ❌ | ❌ | ❌ |
| seedance 1.0 lite | ✅（T2V）| ✅ | ✅（I2V） | ✅（1-4张图） | ❌ |

---

*文档版本：2024-04*
*最后更新：基于火山方舟官方 API 文档整合*
