# DNS记录修改步骤

## 📋 当前状态

- **域名**：ranguofang.com
- **当前配置**：A记录 → `47.96.143.78` ❌（错误）
- **需要配置**：CNAME记录 → 云托管CNAME值 ✅（正确）

## 🔧 修改步骤

### 第一步：获取云托管CNAME值

1. **登录腾讯云控制台**
   - 访问：https://console.cloud.tencent.com/
   - 使用你的账号登录

2. **进入微信云托管**
   - 在控制台搜索"微信云托管"
   - 或从服务列表中找到"微信云托管"

3. **选择你的环境**
   - 找到环境：express-bec5
   - 点击进入

4. **进入域名管理**
   - 左侧菜单找到"域名管理"或"访问管理"
   - 点击进入

5. **添加或查看域名**
   - **如果域名未添加**：
     - 点击"添加域名"
     - 输入：`ranguofang.com` 或 `api.ranguofang.com`（推荐子域名）
     - 选择服务：express-bec5
     - 提交后获取CNAME值
   
   - **如果域名已添加**：
     - 找到 `ranguofang.com` 的记录
     - 查看"解析值"或"CNAME值"
     - 复制这个值（类似：`xxxxx.tcloudbaseapp.com`）

### 第二步：修改DNS记录

1. **回到域名服务商控制台**
   - 就是你刚才看到的DNS配置页面

2. **找到要修改的记录**
   - 主机记录：`@`
   - 记录类型：`A`
   - 记录值：`47.96.143.78`

3. **点击"修改"按钮**

4. **修改配置**
   - **记录类型**：从 `A` 改为 `CNAME`
   - **记录值**：删除 `47.96.143.78`，改为云托管提供的CNAME值
   - **TTL**：保持默认（10分钟）或根据需要调整
   - **其他设置**：保持默认

5. **保存修改**
   - 点击"确定"或"保存"
   - 确认修改

### 第三步：等待生效

- **生效时间**：5-30分钟（通常10-15分钟）
- **检查方法**：
  ```powershell
  nslookup ranguofang.com
  ```
  - 应该显示CNAME记录，指向云托管的域名

### 第四步：测试验证

**等待10-15分钟后，测试连接：**

```powershell
# 测试基础连接
Invoke-WebRequest -Uri "https://ranguofang.com/api" -Method GET -UseBasicParsing
```

**或者用浏览器测试：**
- 打开浏览器
- 访问：`https://ranguofang.com/api`
- 如果能看到响应（即使是错误），说明配置成功

## ⚠️ 重要提示

### 1. 推荐使用子域名

**建议配置**：
- 主机记录：`api`
- 完整域名：`api.ranguofang.com`
- 这样主域名 `ranguofang.com` 可以用于其他用途（如网站）

**如果使用子域名**：
- 在云托管添加 `api.ranguofang.com`
- DNS添加CNAME记录：`api` → CNAME值
- 代码中的API地址改为：`https://api.ranguofang.com/api`

### 2. 如果主域名必须用于API

**如果必须使用主域名**：
- DNS记录：`@` → CNAME → 云托管CNAME值
- 代码中的API地址：`https://ranguofang.com/api`

### 3. 常见错误

❌ **错误**：使用A记录指向IP地址
✅ **正确**：使用CNAME记录指向云托管域名

❌ **错误**：记录值填写IP地址
✅ **正确**：记录值填写云托管CNAME值

## 📝 检查清单

- [ ] 已在云托管控制台添加域名
- [ ] 已获取CNAME值
- [ ] 已修改DNS记录类型为CNAME
- [ ] 已更新记录值为CNAME值
- [ ] 已保存DNS修改
- [ ] 已等待10-15分钟
- [ ] 已测试连接是否成功

## 🔍 验证命令

**检查DNS解析：**
```powershell
nslookup ranguofang.com
```

**测试HTTPS连接：**
```powershell
Invoke-WebRequest -Uri "https://ranguofang.com/api" -Method GET -UseBasicParsing
```

**测试POST接口：**
```powershell
$body = '{"openId":"test","templateId":"test","data":{"thing1":{"value":"test"}}}'
Invoke-WebRequest -Uri "https://ranguofang.com/api/subscribe/send" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing
```

