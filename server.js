const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
// 使用8080端口（非特权端口），云托管会自动映射到80端口
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

// 获取用户openId接口
app.post('/api/user/getOpenId', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.json({
        success: false,
        message: '缺少code参数'
      });
    }

    // 调用微信API换取openId
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`;

    try {
      const response = await axios.get(url);

      if (response.data.openid) {
        res.json({
          success: true,
          data: {
            openId: response.data.openid
          }
        });
      } else {
        console.error('获取openId失败:', response.data);
        res.json({
          success: false,
          message: response.data.errmsg || '获取openId失败'
        });
      }
    } catch (error) {
      console.error('调用微信API失败:', error);
      res.json({
        success: false,
        message: error.message || '获取openId失败'
      });
    }
  } catch (error) {
    console.error('处理获取openId请求失败:', error);
    res.json({
      success: false,
      message: error.message || '服务器错误'
    });
  }
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

// 解密手机号接口（新版本：使用code）
app.post('/api/user/decryptPhone', async (req, res) => {
  try {
    const { code, openId, encryptedData, iv } = req.body;

    // 如果提供了code（新版本API），直接使用code获取手机号
    if (code) {
      try {
        const accessToken = await getAccessToken();
        const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;

        const response = await axios.post(url, {
          code: code
        });

        if (response.data.errcode === 0 && response.data.phone_info) {
          const phoneNumber = response.data.phone_info.phoneNumber;
          return res.json({
            success: true,
            data: {
              phoneNumber: phoneNumber
            }
          });
        } else {
          console.error('获取手机号失败:', response.data);
          return res.json({
            success: false,
            message: response.data.errmsg || '获取手机号失败'
          });
        }
      } catch (error) {
        console.error('调用微信API失败:', error);
        return res.json({
          success: false,
          message: error.message || '获取手机号失败'
        });
      }
    }

    // 旧版本：使用encryptedData和iv解密（需要session_key）
    if (!encryptedData || !iv) {
      return res.json({
        success: false,
        message: '缺少必要参数：code 或 encryptedData和iv'
      });
    }

    // 需要先获取session_key（通过openId或code）
    // 这里简化处理：如果提供了code，先获取session_key
    if (!openId) {
      return res.json({
        success: false,
        message: '缺少openId参数'
      });
    }

    // 注意：旧版本解密需要session_key，但session_key只在登录时获取
    // 这里返回错误，提示使用新版本API
    return res.json({
      success: false,
      message: '请使用新版本手机号授权API（传递code参数）'
    });

  } catch (error) {
    console.error('解密手机号失败:', error);
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

