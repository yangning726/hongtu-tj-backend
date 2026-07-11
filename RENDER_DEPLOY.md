# Render + Supabase 部署指引

> 目标：把后端部署到 Render（免费），数据存到 Supabase（永久免费），获得固定域名，彻底摆脱 localtunnel 不稳定问题。
>
> 预计操作时间：15-20 分钟

---

## 架构说明

```
家长浏览器
  ├── 主站 index.html（CloudStudio，已有）──┐
  │     注册时 POST 到 Render 后端          │
  │                                         ▼
  ├── 管理面板 admin.html ──────────▶ Render Web Service（免费）
  │   （部署在 Render，同源访问）              │
  │                                         │ Supabase REST API
  │                                         ▼
  └───────────────────────────────▶ Supabase PostgreSQL（永久免费）
                                    数据持久存储，不丢失
```

---

## 第一步：创建 Supabase 项目（数据库）

### 1.1 注册登录
1. 打开 https://supabase.com
2. 点击 **Sign in** → 用 **GitHub 账号**登录（最方便）
3. 登录后进入 Dashboard

### 1.2 新建项目
1. 点击 **New Project**
2. 填写：
   - **Name**：`hongtu-tj`（随意）
   - **Database Password**：设一个密码，**记下来**（后续要用）
   - **Region**：`Southeast Asia (Singapore)`（离中国最近）
3. 点击 **Create new project**，等待约 1-2 分钟初始化

### 1.3 建表
1. 项目创建好后，左侧菜单点 **SQL Editor**
2. 点 **New query**
3. 打开本地文件 `backend/supabase_schema.sql`，**全选复制**内容
4. 粘贴到 SQL Editor 中
5. 点 **Run**（或 Ctrl+Enter）
6. 底部应显示 `registrations 表创建成功，当前记录数: 0`

### 1.4 获取连接信息（重要！）
1. 左侧菜单点 **Project Settings**（齿轮图标）
2. 点 **API**
3. 记下以下两个值（后续填到 Render）：

| 名称 | 位置 | 示例值 |
|------|------|--------|
| **Project URL** | 页面上方 `Project URL` | `https://xxxxxxxxxxxx.supabase.co` |
| **service_role key** | 页面下方 `Project API keys` → `service_role` → `Reveal` | `eyJhbGciOiJI...`（很长的字符串） |

> ⚠️ **注意**：用 `service_role` key（不是 `anon` key）。service_role 有完全权限绕过 RLS，适合后端使用。**不要把这个 key 放到前端代码里。**

---

## 第二步：推送代码到 GitHub

### 2.1 在 GitHub 创建仓库
1. 打开 https://github.com/new
2. 填写：
   - **Repository name**：`hongtu-tj-backend`
   - **Private**（私有仓库，推荐）
3. 点 **Create repository**

### 2.2 推送代码
在本项目 `backend` 目录下打开终端，执行（把 `你的GitHub用户名` 替换为实际用户名）：

```bash
cd C:\Users\HUAWEI\WorkBuddy\2026-07-10-14-04-37\backend

# 关联远程仓库
git remote add origin https://github.com/你的GitHub用户名/hongtu-tj-backend.git

# 推送
git push -u origin main
```

> 如果提示要登录，用 GitHub 用户名和 Personal Access Token（不是密码）。
> 生成 Token：GitHub → Settings → Developer settings → Personal access tokens → Generate new token（勾选 repo 权限）

---

## 第三步：在 Render 创建 Web Service

### 3.1 注册登录
1. 打开 https://render.com
2. 点 **Sign Up** → 用 **GitHub 账号**登录
3. 授权 Render 访问你的 GitHub

### 3.2 创建服务
1. Dashboard 点 **New +** → **Web Service**
2. 选择 **Build and deploy from a Git repository**
3. 找到并选择 `hongtu-tj-backend` 仓库
4. 填写配置：

| 字段 | 值 |
|------|-----|
| **Name** | `hongtu-tj-backend` |
| **Region** | `Singapore`（离中国最近） |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | `Free` |

5. 点 **Advanced** 展开，添加环境变量：

| Key | Value |
|-----|-------|
| `ADMIN_PASSWORD` | `hongtu2026`（或你想设的密码） |
| `SUPABASE_URL` | 第一步获取的 Project URL |
| `SUPABASE_KEY` | 第一步获取的 service_role key |
| `WECOM_KEY` | 企业微信群机器人 webhook key（可选，没有就留空不填） |

6. 点 **Create Web Service**

### 3.3 等待部署
- Render 会自动构建和部署，约 1-2 分钟
- 部署成功后，页面顶部会显示你的域名：
  ```
  https://hongtu-tj-backend.onrender.com
  ```
  （域名根据你设的 Name 自动生成）
- 点域名打开，应看到管理面板登录页

### 3.4 验证
- 访问 `https://你的域名/api/health`，应返回：
  ```json
  {"success":true,"status":"ok","storage":"supabase","time":"..."}
  ```
  `storage: "supabase"` 说明云端存储已生效

---

## 第四步：更新主站注册地址

后端部署成功后，需要把主站 `index.html` 的注册接口地址改为 Render 域名。

### 方式一：URL 参数（快速测试）
在主站 URL 后加参数：
```
https://d0473107241541c1ac171b934d24750a.app.codebuddy.work/index.html?api=https://你的Render域名/api/register
```

### 方式二：修改默认值（正式使用）
编辑 `deploy/index.html`，找到 `WEBHOOK_URL` 配置行，把默认值改为：
```javascript
// 第 231 行附近
var WEBHOOK_URL=(function(){var p=new URLSearchParams(location.search);return p.get('api')||localStorage.getItem('tj_api')||'https://你的Render域名/api/register';})();
```
然后重新部署到 CloudStudio。

---

## 部署后使用

| 用途 | 地址 |
|------|------|
| **管理面板** | `https://你的Render域名/admin` |
| **健康检查** | `https://你的Render域名/api/health` |
| **注册接口** | `https://你的Render域名/api/register` |

- 管理密码：你在 Render 环境变量 `ADMIN_PASSWORD` 中设的值
- 数据存储在 Supabase，永久不丢
- Render 免费层 15 分钟无访问会休眠，下次访问自动唤醒（约 30 秒），功能不受影响

---

## 常见问题

### Q: Render 休眠怎么办？
A: 免费层 15 分钟无请求会休眠。可用 [UptimeRobot](https://uptimerobot.com)（免费）设置每 10 分钟 ping 一次 `https://你的域名/api/health`，保持唤醒。

### Q: Supabase 免费层够用吗？
A: 免费层 500MB 存储、50000 月活，对招生季几千条注册绰绰有余，且永久免费。

### Q: 数据安全吗？
A: service_role key 只在 Render 环境变量中，不暴露到前端。Supabase 表启用了 RLS 且无 policy，匿名无法直接访问。所有读写都通过后端鉴权。

### Q: 后端代码会自动更新吗？
A: 是。push 代码到 GitHub 后，Render 会自动重新部署。

### Q: 如何查看日志？
A: Render Dashboard → 你的服务 → 左上角 `Logs` 标签，可看实时日志。

---

## 环境变量速查

| 变量名 | 用途 | 必填 | 来源 |
|--------|------|------|------|
| `ADMIN_PASSWORD` | 管理面板登录密码 | 是 | 自定义 |
| `SUPABASE_URL` | Supabase 项目 URL | 是 | Supabase → Settings → API |
| `SUPABASE_KEY` | Supabase service_role key | 是 | Supabase → Settings → API |
| `WECOM_KEY` | 企业微信群机器人 key | 否 | 企业微信群机器人 webhook |
| `PORT` | 服务端口 | 否（Render 自动设置） | - |
