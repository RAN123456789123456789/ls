const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 小程序配置（从环境变量读取，如果没有则使用默认值）
const APPID = process.env.WX_APPID || 'YOUR_APPID';
const SECRET = process.env.WX_SECRET || 'YOUR_SECRET';

// 缓存access_token（2小时有效期）
let accessTokenCache = {
  token: '',
  expireTime: 0
};

/**
 * 获取access_token
 */
async function getAccessToken() {
  // 如果缓存有效，直接返回
  if (accessTokenCache.token && Date.now() < accessTokenCache.expireTime) {
    return accessTokenCache.token;
  }

  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`;
    const response = await axios.get(url);
    
    if (response.data.access_token) {
      // 缓存token，提前5分钟过期
      accessTokenCache.token = response.data.access_token;
      accessTokenCache.expireTime = Date.now() + (response.data.expires_in - 300) * 1000;
      return response.data.access_token;
    } else {
      throw new Error(response.data.errmsg || '获取access_token失败');
    }
  } catch (error) {
    console.error('获取access_token失败:', error);
    throw error;
  }
}

/**
 * 发送订阅消息
 */
async function sendSubscribeMessage(openId, templateId, page, data) {
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;
  
  try {
    const response = await axios.post(url, {
      touser: openId,
      template_id: templateId,
      page: page || '',
      data: data,
    });

    if (response.data.errcode === 0) {
      return { success: true, message: '发送成功' };
    } else {
      console.error('发送订阅消息失败:', response.data);
      return {
        success: false,
        message: response.data.errmsg || '发送失败'
      };
    }
  } catch (error) {
    console.error('调用微信API失败:', error);
    return {
      success: false,
      message: error.message || '发送失败'
    };
  }
}

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '服务运行正常' });
});

// 订阅消息发送接口
app.post('/api/subscribe/send', async (req, res) => {
  try {
    const { openId, templateId, page, data } = req.body;

    // 参数验证
    if (!openId || !templateId || !data) {
      return res.json({
        success: false,
        message: '参数不完整：缺少openId、templateId或data'
      });
    }

    // 发送订阅消息
    const result = await sendSubscribeMessage(openId, templateId, page, data);
    
    res.json(result);
  } catch (error) {
    console.error('处理订阅消息请求失败:', error);
    res.json({
      success: false,
      message: error.message || '服务器错误'
    });
  }
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: err.message || '服务器内部错误'
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
});

