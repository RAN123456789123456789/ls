# 订阅消息系统使用指南

## 功能概述

本订阅系统支持以下类型的订阅消息：
- **借阅成功通知**：用户成功借阅图书时发送
- **归还提醒通知**：在归还日期前1天、3天、7天发送提醒
- **逾期提醒通知**：图书逾期后发送提醒
- **归还成功通知**：用户成功归还图书时发送

## 快速开始

### 1. 配置订阅消息模板

在微信公众平台配置订阅消息模板：

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **功能 -> 订阅消息**
3. 申请以下模板（根据实际需求调整字段）：

#### 借阅成功通知模板
```
图书名称：{{thing1.DATA}}
借阅日期：{{date2.DATA}}
归还日期：{{date3.DATA}}
借阅编号：{{character_string4.DATA}}
```

#### 归还提醒通知模板
```
图书名称：{{thing1.DATA}}
归还日期：{{date2.DATA}}
剩余天数：{{number3.DATA}}
借阅编号：{{character_string4.DATA}}
```

#### 逾期提醒通知模板
```
图书名称：{{thing1.DATA}}
应归还日期：{{date2.DATA}}
逾期天数：{{number3.DATA}}
借阅编号：{{character_string4.DATA}}
```

#### 归还成功通知模板
```
图书名称：{{thing1.DATA}}
归还日期：{{date2.DATA}}
借阅编号：{{character_string3.DATA}}
```

4. 将获取到的模板ID替换到 `miniprogram/utils/subscribeMessage.ts` 中的 `SUBSCRIBE_MESSAGE_TEMPLATES`

### 2. 配置后端API

订阅消息的发送需要在后端完成，因为需要使用 `access_token`。

#### 后端API接口要求

**接口地址**：`POST /api/subscribe/send`

**请求参数**：
```json
{
  "openId": "用户的openId",
  "templateId": "订阅消息模板ID",
  "page": "点击消息后跳转的页面路径（可选）",
  "data": {
    "thing1": { "value": "图书名称" },
    "date2": { "value": "2024-01-01" },
    "number3": { "value": "7" },
    "character_string4": { "value": "BR123456" }
  }
}
```

**响应格式**：
```json
{
  "success": true,
  "message": "发送成功"
}
```

#### 后端实现示例（Node.js）

```javascript
const axios = require('axios');

// 获取access_token（需要缓存，2小时有效期）
async function getAccessToken() {
  const appid = 'YOUR_APPID';
  const secret = 'YOUR_SECRET';
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  
  const response = await axios.get(url);
  return response.data.access_token;
}

// 发送订阅消息
async function sendSubscribeMessage(openId, templateId, page, data) {
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;
  
  const response = await axios.post(url, {
    touser: openId,
    template_id: templateId,
    page: page || '',
    data: data,
  });
  
  return response.data;
}
```

### 3. 更新API配置

在 `miniprogram/utils/subscribeService.ts` 中更新 `API_BASE_URL`：

```typescript
const API_BASE_URL = 'https://your-api-domain.com/api'; // 替换为实际的后端API地址
```

## 使用方法

### 用户授权订阅

用户可以通过订阅管理页面进行授权：

```typescript
// 跳转到订阅管理页面
wx.navigateTo({
  url: '/pages/subscribe/subscribe'
});
```

### 在关键操作前请求授权

在借阅、归还等操作前，可以主动请求用户授权：

```typescript
import { requestSubscribeBeforeAction, SubscribeMessageType } from '../../utils/subscribeMessage';

// 在借阅前请求授权
const authorized = await requestSubscribeBeforeAction([
  SubscribeMessageType.BORROW_SUCCESS,
  SubscribeMessageType.RETURN_REMINDER,
]);
```

### 发送订阅消息

#### 发送借阅成功通知

```typescript
import { sendBorrowSuccessNotification } from '../../utils/subscribeService';

await sendBorrowSuccessNotification(
  openId,           // 用户openId
  'JavaScript高级程序设计', // 图书名称
  '2024-01-01',    // 借阅日期
  '2024-01-08',    // 归还日期
  'BR123456',      // 借阅编号（可选）
  'pages/index/index' // 点击后跳转页面（可选）
);
```

#### 发送归还提醒

```typescript
import { sendReturnReminderNotification } from '../../utils/subscribeService';

await sendReturnReminderNotification(
  openId,
  'JavaScript高级程序设计',
  '2024-01-08',   // 归还日期
  3,               // 剩余天数
  'BR123456'
);
```

#### 发送逾期提醒

```typescript
import { sendOverdueReminderNotification } from '../../utils/subscribeService';

await sendOverdueReminderNotification(
  openId,
  'JavaScript高级程序设计',
  '2024-01-08',   // 应归还日期
  5,               // 逾期天数
  'BR123456'
);
```

#### 发送归还成功通知

```typescript
import { sendReturnSuccessNotification } from '../../utils/subscribeService';

await sendReturnSuccessNotification(
  openId,
  'JavaScript高级程序设计',
  '2024-01-08',   // 归还日期
  'BR123456'
);
```

### 定时提醒

系统会在小程序启动和显示时自动检查需要发送的提醒。对于更精确的定时提醒，建议使用云函数定时触发器。

**云函数定时触发器示例**：

```javascript
// cloudfunctions/subscribeScheduler/index.js
const cloud = require('wx-server-sdk');
cloud.init();

exports.main = async (event, context) => {
  // 每天执行一次，检查需要发送的提醒
  // 调用后端API检查并发送提醒
  // ...
};
```

**配置定时触发器**（在 `cloudfunctions/subscribeScheduler/config.json`）：

```json
{
  "triggers": [
    {
      "name": "dailyReminder",
      "type": "timer",
      "config": "0 0 9 * * * *"
    }
  ]
}
```

## 文件说明

- `miniprogram/utils/subscribeMessage.ts` - 订阅消息授权和管理工具
- `miniprogram/utils/subscribeService.ts` - 订阅消息发送服务
- `miniprogram/utils/subscribeScheduler.ts` - 定时提醒调度工具
- `miniprogram/utils/subscribeExample.ts` - 使用示例代码
- `miniprogram/pages/subscribe/subscribe.ts` - 订阅管理页面

## 注意事项

1. **模板ID配置**：必须在微信公众平台申请订阅消息模板，并将模板ID配置到代码中
2. **后端服务**：订阅消息的发送必须在后端完成，小程序端只负责调用后端API
3. **用户授权**：订阅消息需要用户主动授权，且授权有时效性（一次授权只能发送一次消息）
4. **定时提醒**：小程序无法长期后台运行，定时提醒建议使用云函数定时触发器
5. **API安全**：后端API需要做好安全验证，防止恶意调用

## 常见问题

### Q: 为什么用户授权后收不到消息？
A: 请检查：
1. 模板ID是否正确配置
2. 后端API是否正常
3. 后端是否正确调用了微信API
4. 用户是否真的授权了该模板

### Q: 如何实现定时发送提醒？
A: 推荐使用云函数定时触发器，每天定时检查需要发送的提醒。

### Q: 订阅消息可以发送多少次？
A: 每次用户授权后，该模板可以发送一次消息。如果需要多次发送，需要用户多次授权。

### Q: 如何测试订阅消息？
A: 可以在开发者工具中测试授权流程，但实际的消息发送需要在真机上测试。


