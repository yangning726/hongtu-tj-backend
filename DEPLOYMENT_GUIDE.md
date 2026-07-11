# 鸿途生涯 · 招生目录后台系统 — 部署运维指南

## 系统架构

```
家长浏览器 → CloudStudio线上招生目录 → fetch() → localtunnel公网隧道 → 本地后端(server.js)
                                         ↓ (后端不可达时)
                                    localStorage待发送队列 → 下次访问自动重试
管理员浏览器 → CloudStudio线上管理面板 → API调用 → localtunnel公网隧道 → 本地后端(server.js)
```

## 访问地址

| 服务 | 地址 |
|------|------|
| **招生目录主站** | https://d0473107241541c1ac171b934d24750a.app.codebuddy.work/index.html |
| **后台管理面板** | https://d0473107241541c1ac171b934d24750a.app.codebuddy.work/admin.html |
| **后端API** | https://four-apes-guess.loca.lt (localtunnel，每次重启会变) |
| **管理密码** | hongtu2026 |

## 日常启动步骤

### 1. 启动后端服务器

```bash
cd C:\Users\HUAWEI\WorkBuddy\2026-07-10-14-04-37\backend
node server.js
```

看到 `Server running on port 3000` 即成功。此终端窗口需保持打开。

### 2. 启动公网隧道

新开一个终端窗口：

```bash
npx localtunnel --port 3000
```

会输出类似 `your url is: https://xxxx-xxxx-xxxx.loca.lt`，这个 URL 就是新的后端公网地址。

### 3. 更新后端地址

隧道 URL 每次重启都会变，需要更新到两处：

**方法A：管理面板内更新（推荐）**
1. 打开管理面板：https://d0473107241541c1ac171b934d24750a.app.codebuddy.work/admin.html
2. 点击右上角「⚙️ 后端地址」按钮
3. 输入新的 localtunnel URL（如 `https://xxxx-xxxx-xxxx.loca.lt`）
4. 点击保存

**方法B：主站URL参数**
在主站地址后加 `?api=新URL`：
```
https://d0473107241541c1ac171b934d24750a.app.codebuddy.work/index.html?api=https://xxxx-xxxx-xxxx.loca.lt/api/register
```

**方法C：修改代码默认值**
修改 `deploy/index.html` 和 `deploy/admin.html` 中的默认 URL，然后重新部署。

### 4. 重新部署到 CloudStudio（仅在修改了 deploy/ 文件后需要）

在 WorkBuddy 中让 AI 执行：
> 重新部署 deploy 目录到 CloudStudio

## 容错机制

注册系统已内置容错：
- **后端可达时**：注册数据实时提交到后端，管理面板即时可见
- **后端不可达时**：注册数据自动存入浏览器 localStorage 待发送队列
- **下次访问主站时**：自动重试发送待发送队列中的数据
- **数据不会丢失**：即使隧道中断，家长仍可正常注册

## 后端API端点

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/health | 健康检查 | 无 |
| POST | /api/register | 家长注册 | 无 |
| POST | /api/admin/login | 管理员登录 | 无 |
| GET | /api/admin/registrations | 注册列表（支持搜索/分页） | Bearer Token |
| DELETE | /api/admin/registrations/:id | 删除单条 | Bearer Token |
| DELETE | /api/admin/registrations/batch | 批量删除 | Bearer Token |
| GET | /api/admin/stats | 统计数据（总数/今日/趋势/学校TOP10） | Bearer Token |
| GET | /api/admin/export | 导出CSV | Bearer Token |
| POST | /api/admin/password | 修改管理密码 | Bearer Token |

## 数据存储

- 注册数据存储在 `backend/registrations.json`（JSON文件持久化）
- 每条记录包含：id, name, grade, school, phone, createdAt, ip
- 管理员token存储在内存中（Set），重启后端后需重新登录

## 已知限制

1. **localtunnel 不稳定**：公网隧道每隔几分钟可能断连，重启后URL会变
2. **需保持电脑开机**：后端运行在本地电脑，关机后服务中断
3. **localtunnel拦截页**：首次在浏览器中访问隧道URL时，可能需要输入IP地址验证

## 生产环境建议

如需7×24小时稳定运行，建议将后端部署到云平台：

1. **Vercel**（推荐）：免费，支持Node.js Serverless Functions
2. **Railway**：免费额度，支持持久化Node.js服务
3. **Render**：免费额度，支持Web Service

部署后将固定的云平台URL替换localtunnel URL即可，无需修改其他代码。

## 文件结构

```
2026-07-10-14-04-37/
├── backend/
│   ├── server.js              # 后端服务器（核心）
│   ├── admin.html             # 管理面板（本地版）
│   ├── registrations.json     # 注册数据存储
│   └── e2e_test.py            # 端到端测试脚本
├── deploy/
│   ├── index.html             # 招生目录主站（部署版）
│   └── admin.html             # 管理面板（部署版）
├── generate_tianjin_html.py   # HTML生成脚本
└── 天津市2026年普通高等学校招生专业目录_V1.0.html  # 本地完整版
```
