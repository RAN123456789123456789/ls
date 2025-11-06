# API测试方法

## 🔍 问题诊断

### 1. 检查域名解析是否生效

**Windows PowerShell:**
```powershell
nslookup ranguofang.com
```

**或者使用 ping:**
```powershell
ping ranguofang.com
```

应该能看到域名解析到的IP地址。

### 2. 测试基础连接

**测试HTTPS连接（GET请求）：**
```powershell
# 测试根路径
curl https://ranguofang.com

# 测试API根路径
curl https://ranguofang.com/api

# 测试订阅接口（GET请求会返回405或错误，但能确认服务是否可达）
curl https://ranguofang.com/api/subscribe/send
```

**如果提示端口问题，可以指定端口：**
```powershell
# HTTPS默认端口443
curl https://ranguofang.com:443/api

# 如果后端配置了其他端口（不常见）
curl https://ranguofang.com:8080/api
```

### 3. 测试POST请求（正确的方法）

`/api/subscribe/send` 是POST接口，需要用POST方法测试：

**Windows PowerShell:**
```powershell
curl -Method POST -Uri "https://ranguofang.com/api/subscribe/send" `
  -ContentType "application/json" `
  -Body '{"openId":"test","templateId":"test","data":{"thing1":{"value":"test"}}}'
```

**或者使用 Invoke-WebRequest:**
```powershell
Invoke-WebRequest -Uri "https://ranguofang.com/api/subscribe/send" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"openId":"test","templateId":"test","data":{"thing1":{"value":"test"}}}'
```

**如果安装了curl（Windows 10+）:**
```bash
curl -X POST https://ranguofang.com/api/subscribe/send `
  -H "Content-Type: application/json" `
  -d "{\"openId\":\"test\",\"templateId\":\"test\",\"data\":{\"thing1\":{\"value\":\"test\"}}}"
```

### 4. 使用浏览器测试（最简单）

1. **打开浏览器**
2. **访问**：`https://ranguofang.com/api`
   - 如果能看到响应（即使是错误），说明域名和端口都正常
   - 如果显示"无法访问"或"连接超时"，可能是域名解析或服务配置问题

3. **访问**：`https://ranguofang.com/api/subscribe/send`
   - POST接口在浏览器中会显示405 Method Not Allowed（这是正常的）
   - 说明服务可达，只是需要POST方法

## ⚠️ 常见问题

### 问题1：域名解析失败
**症状**：`nslookup` 找不到域名
**解决**：
- 检查DNS配置是否正确
- 等待DNS生效（可能需要几分钟到几小时）
- 检查域名是否已备案（如果使用主域名）

### 问题2：连接超时
**症状**：`curl` 或浏览器显示连接超时
**可能原因**：
- 后端服务未启动
- 域名未正确绑定到云托管服务
- 防火墙阻止连接

**解决**：
1. 检查微信云托管控制台，确认服务正在运行
2. 检查域名绑定配置
3. 确认SSL证书已正确配置

### 问题3：404 Not Found
**症状**：能连接但返回404
**可能原因**：
- API路径不正确
- 后端路由未正确配置

**解决**：
- 检查后端路由配置：`app.use('/api', router)`
- 确认接口路径：`/api/subscribe/send`

### 问题4：端口问题
**症状**：提示端口错误
**说明**：
- HTTPS默认使用443端口，不需要在URL中指定
- 如果必须指定端口，说明配置可能有问题

**检查**：
- 微信云托管通常自动处理端口
- 确认域名绑定配置正确

## 📋 完整测试步骤

### 步骤1：测试域名解析
```powershell
nslookup ranguofang.com
```

### 步骤2：测试基础连接
```powershell
# 方法1：浏览器访问
# 打开浏览器，访问：https://ranguofang.com/api

# 方法2：PowerShell
Invoke-WebRequest -Uri "https://ranguofang.com/api" -Method GET
```

### 步骤3：测试POST接口
```powershell
$body = @{
    openId = "test_openid"
    templateId = "test_template_id"
    data = @{
        thing1 = @{ value = "测试图书" }
    }
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ranguofang.com/api/subscribe/send" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

### 步骤4：检查响应
- **200 OK**：接口正常
- **405 Method Not Allowed**：服务可达，但方法不对（GET vs POST）
- **404 Not Found**：路径不存在
- **500 Internal Server Error**：服务器错误
- **连接超时**：服务不可达或域名配置问题

## 🔧 如果还是有问题

1. **检查微信云托管控制台**
   - 确认服务状态：运行中
   - 确认域名绑定：已绑定 `ranguofang.com`
   - 确认SSL证书：已配置且有效

2. **检查后端服务日志**
   - 在云托管控制台查看服务日志
   - 确认服务是否正常启动
   - 查看是否有错误信息

3. **测试旧域名是否可用**
   ```powershell
   curl https://express-bec5-197615-5-1385276628.sh.run.tcloudbase.com/api
   ```
   - 如果旧域名可用，说明服务正常，问题在域名配置
   - 如果旧域名也不可用，说明服务本身有问题

## 💡 推荐测试工具

1. **Postman**（推荐）
   - 下载：https://www.postman.com/downloads/
   - 创建POST请求
   - URL: `https://ranguofang.com/api/subscribe/send`
   - Body: JSON格式

2. **浏览器开发者工具**
   - F12打开
   - Network标签
   - 可以看到请求详情

3. **在线工具**
   - https://httpie.io/app
   - https://reqbin.com/

