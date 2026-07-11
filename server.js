/**
 * 鸿途生涯 - 天津招生目录 独立后台服务
 * 纯 Node.js 内置模块，零依赖
 *
 * 存储模式：
 *   - 云端模式：设置 SUPABASE_URL + SUPABASE_KEY 环境变量，数据存 Supabase PostgreSQL
 *   - 本地模式：无环境变量时，数据存本地 registrations.json 文件
 *
 * 功能：
 *   POST /api/register           - 探客注册（公开）
 *   POST /api/admin/login        - 管理员登录
 *   GET  /api/admin/registrations - 注册列表（搜索/分页，需鉴权）
 *   DELETE /api/admin/registrations/:id - 删除单条（需鉴权）
 *   GET  /api/admin/stats        - 统计数据（需鉴权）
 *   GET  /api/admin/export       - 导出CSV（需鉴权）
 *   GET  /  /admin               - 管理面板页面
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ===== 配置 =====
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'hongtu2026';
const DATA_FILE = path.join(__dirname, 'registrations.json');
const ADMIN_HTML = path.join(__dirname, 'admin.html');

// 企业微信群机器人 Key（在群设置->群机器人->添加机器人->复制Webhook地址中获取key参数）
// 通过环境变量 WECOM_KEY 配置，留空则不发送企业微信通知
const WECOM_KEY = process.env.WECOM_KEY || '';
const WECOM_URL = WECOM_KEY ? ('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + WECOM_KEY) : '';

// Supabase 配置（设置则启用云端存储）
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);

// ===== 数据存储 =====
let registrations = [];
let nextId = 1;

// ----- Supabase REST API -----
function supabaseRequest(method, tablePath, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + tablePath;
    const u = new URL(fullUrl);
    const options = {
      method: method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      }
    };
    let bodyStr = '';
    if (body !== undefined && body !== null) {
      bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    if (method === 'POST') {
      options.headers['Prefer'] = 'return=representation';
    }
    const req = require('https').request(options, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        var parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch(e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ----- 数据加载 -----
async function loadData() {
  if (USE_SUPABASE) {
    try {
      var res = await supabaseRequest('GET', 'registrations?select=*&order=id.asc');
      if (res.status === 200 && Array.isArray(res.data)) {
        registrations = res.data;
        nextId = registrations.reduce(function(max, r) { return Math.max(max, r.id || 0); }, 0) + 1;
        console.log('[DB] 从 Supabase 加载 ' + registrations.length + ' 条注册记录');
      } else {
        console.error('[DB] Supabase 加载失败:', res.status, JSON.stringify(res.data).slice(0, 200));
        registrations = [];
      }
    } catch(e) {
      console.error('[DB] Supabase 连接异常:', e.message);
      registrations = [];
    }
  } else {
    try {
      if (fs.existsSync(DATA_FILE)) {
        var raw = fs.readFileSync(DATA_FILE, 'utf8');
        registrations = JSON.parse(raw);
        nextId = registrations.reduce(function(max, r) { return Math.max(max, r.id || 0); }, 0) + 1;
      }
    } catch(e) {
      console.error('[DB] 加载本地数据失败:', e.message);
      registrations = [];
    }
    console.log('[DB] 已加载 ' + registrations.length + ' 条注册记录 (本地文件模式)');
  }
}

// ----- 数据保存（本地模式） -----
function saveData() {
  if (USE_SUPABASE) return; // 云端模式由 addRecord/deleteRecord 同步
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(registrations, null, 2), 'utf8');
  } catch(e) {
    console.error('[DB] 保存数据失败:', e.message);
  }
}

// ----- 新增记录（双模式） -----
async function addRecord(record) {
  if (USE_SUPABASE) {
    // 插入 Supabase，不传 id（自增），不传 createdAt（用数据库默认或代码值）
    var insertData = {
      name: record.name,
      grade: record.grade,
      school: record.school,
      phone: record.phone,
      ip: record.ip || '',
      "createdAt": record.createdAt
    };
    var res = await supabaseRequest('POST', 'registrations', insertData);
    if (res.status === 201 && Array.isArray(res.data) && res.data[0]) {
      record.id = res.data[0].id;
      registrations.push(record);
      return record;
    } else {
      console.error('[DB] Supabase 插入失败:', res.status, JSON.stringify(res.data).slice(0, 200));
      throw new Error('数据库写入失败');
    }
  } else {
    record.id = nextId++;
    registrations.push(record);
    saveData();
    return record;
  }
}

// ----- 删除记录（双模式） -----
async function deleteRecordById(id) {
  var index = registrations.findIndex(function(r) { return r.id === id; });
  if (index === -1) return null;
  var deleted = registrations[index];
  if (USE_SUPABASE) {
    var res = await supabaseRequest('DELETE', 'registrations?id=eq.' + id);
    if (res.status < 200 || res.status >= 300) {
      console.error('[DB] Supabase 删除失败:', res.status);
      throw new Error('数据库删除失败');
    }
  }
  registrations.splice(index, 1);
  if (!USE_SUPABASE) saveData();
  return deleted;
}

// ----- 批量删除（双模式） -----
async function deleteRecordsBatch(ids) {
  var idSet = new Set(ids);
  var before = registrations.length;
  if (USE_SUPABASE) {
    // Supabase 批量删除：id=in.(1,2,3)
    var idList = ids.join(',');
    var res = await supabaseRequest('DELETE', 'registrations?id=in.(' + idList + ')');
    if (res.status < 200 || res.status >= 300) {
      console.error('[DB] Supabase 批量删除失败:', res.status);
      throw new Error('数据库批量删除失败');
    }
  }
  registrations = registrations.filter(function(r) { return !idSet.has(r.id); });
  if (!USE_SUPABASE) saveData();
  return before - registrations.length;
}

// ===== Token 管理 =====
const tokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function checkAuth(req) {
  var auth = req.headers.authorization;
  if (!auth) return false;
  var token = auth.replace('Bearer ', '');
  return tokens.has(token);
}

// ===== 工具函数 =====
function parseBody(req) {
  return new Promise(function(resolve, reject) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch(e) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function sendHTML(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// ===== 企业微信群机器人通知 =====
function notifyWecom(record) {
  if (!WECOM_URL) return;
  var msg = {
    msgtype: 'markdown',
    markdown: {
      content: '### 🎓 新家长注册\n' +
        '> **姓名**：' + record.name + '\n' +
        '> **年级**：' + record.grade + '\n' +
        '> **学校**：' + record.school + '\n' +
        '> **手机号**：' + record.phone + '\n' +
        '> **时间**：' + new Date(record.createdAt).toLocaleString('zh-CN') + '\n' +
        '> **IP**：' + (record.ip || '未知')
    }
  };
  var body = JSON.stringify(msg);
  var req = require('https').request(WECOM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, function(res) {
    var data = '';
    res.on('data', function(c) { data += c; });
    res.on('end', function() {
      console.log('[企业微信] 通知发送结果:', data);
    });
  });
  req.on('error', function(e) {
    console.error('[企业微信] 通知发送失败:', e.message);
  });
  req.write(body);
  req.end();
}

// ===== 路由处理 =====
async function handleRequest(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  var urlObj = new URL(req.url, 'http://' + req.headers.host);
  var pathname = urlObj.pathname;

  // ---------- 公开接口 ----------

  // 注册接口
  if (pathname === '/api/register' && req.method === 'POST') {
    try {
      var data = await parseBody(req);
      var name = data.name, grade = data.grade, school = data.school, phone = data.phone;

      if (!name || !grade || !school || !phone) {
        sendJSON(res, 400, { success: false, message: '请填写所有必填字段' });
        return;
      }
      if (!/^1[3-9]\d{9}$/.test(String(phone))) {
        sendJSON(res, 400, { success: false, message: '手机号格式不正确' });
        return;
      }

      var record = {
        name: String(name).trim(),
        grade: String(grade).trim(),
        school: String(school).trim(),
        phone: String(phone).trim(),
        createdAt: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      };

      record = await addRecord(record);

      // 企业微信群机器人通知
      notifyWecom(record);

      console.log('[注册] 新注册: ' + record.name + ' / ' + record.school + ' / ' + record.phone);
      sendJSON(res, 200, { success: true, id: record.id });
    } catch(e) {
      console.error('[注册] 错误:', e.message);
      sendJSON(res, 500, { success: false, message: '服务器内部错误' });
    }
    return;
  }

  // 健康检查
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJSON(res, 200, { success: true, status: 'ok', storage: USE_SUPABASE ? 'supabase' : 'local', time: new Date().toISOString() });
    return;
  }

  // ---------- 管理员登录 ----------
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    try {
      var body = await parseBody(req);
      var password = body.password;
      if (password === ADMIN_PASSWORD) {
        var token = generateToken();
        tokens.add(token);
        console.log('[登录] 管理员登录成功, token: ' + token.slice(0, 8) + '...');
        sendJSON(res, 200, { success: true, token: token });
      } else {
        sendJSON(res, 401, { success: false, message: '密码错误' });
      }
    } catch(e) {
      sendJSON(res, 500, { success: false, message: '服务器错误' });
    }
    return;
  }

  // ---------- 鉴权接口 ----------

  if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login') {
    if (!checkAuth(req)) {
      sendJSON(res, 401, { success: false, message: '未授权，请先登录' });
      return;
    }

    // 注册列表（搜索 + 分页）
    if (pathname === '/api/admin/registrations' && req.method === 'GET') {
      var search = (urlObj.searchParams.get('search') || '').trim().toLowerCase();
      var grade = urlObj.searchParams.get('grade') || '';
      var page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1'));
      var limit = Math.min(200, Math.max(1, parseInt(urlObj.searchParams.get('limit') || '50')));

      var filtered = registrations;
      if (search) {
        filtered = filtered.filter(function(r) {
          return (r.name || '').toLowerCase().includes(search) ||
                 (r.school || '').toLowerCase().includes(search) ||
                 (r.phone || '').includes(search) ||
                 (r.grade || '').toLowerCase().includes(search);
        });
      }
      if (grade) {
        filtered = filtered.filter(function(r) { return r.grade === grade; });
      }

      // 按时间倒序
      filtered = filtered.slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

      var total = filtered.length;
      var start = (page - 1) * limit;
      var items = filtered.slice(start, start + limit);

      sendJSON(res, 200, { success: true, total: total, page: page, limit: limit, items: items });
      return;
    }

    // 删除单条
    var deleteMatch = pathname.match(/^\/api\/admin\/registrations\/(\d+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      var delId = parseInt(deleteMatch[1]);
      try {
        var deletedRec = await deleteRecordById(delId);
        if (deletedRec) {
          console.log('[删除] 删除注册: ' + deletedRec.name + ' / ' + deletedRec.phone);
          sendJSON(res, 200, { success: true });
        } else {
          sendJSON(res, 404, { success: false, message: '记录不存在' });
        }
      } catch(e) {
        sendJSON(res, 500, { success: false, message: '删除失败: ' + e.message });
      }
      return;
    }

    // 批量删除
    if (pathname === '/api/admin/registrations/batch' && req.method === 'DELETE') {
      try {
        var batchBody = await parseBody(req);
        var ids = batchBody.ids;
        if (!Array.isArray(ids)) {
          sendJSON(res, 400, { success: false, message: 'ids 必须是数组' });
          return;
        }
        var deletedCount = await deleteRecordsBatch(ids);
        console.log('[删除] 批量删除 ' + deletedCount + ' 条记录');
        sendJSON(res, 200, { success: true, deleted: deletedCount });
      } catch(e) {
        sendJSON(res, 500, { success: false, message: '服务器错误' });
      }
      return;
    }

    // 统计数据
    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      var now = new Date();
      var todayStr = now.toDateString();
      var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      var monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

      var todayCount = registrations.filter(function(r) { return new Date(r.createdAt).toDateString() === todayStr; }).length;
      var weekCount = registrations.filter(function(r) { return new Date(r.createdAt) >= weekAgo; }).length;
      var monthCount = registrations.filter(function(r) { return new Date(r.createdAt) >= monthAgo; }).length;

      // 按学校统计
      var schoolMap = {};
      registrations.forEach(function(r) {
        schoolMap[r.school] = (schoolMap[r.school] || 0) + 1;
      });
      var topSchools = Object.entries(schoolMap)
        .sort(function(a, b) { return b[1] - a[1]; })
        .slice(0, 10)
        .map(function(e) { return { name: e[0], count: e[1] }; });

      // 按年级统计
      var gradeMap = {};
      registrations.forEach(function(r) {
        gradeMap[r.grade] = (gradeMap[r.grade] || 0) + 1;
      });
      var gradeStats = Object.entries(gradeMap)
        .sort(function(a, b) { return b[1] - a[1]; })
        .map(function(e) { return { name: e[0], count: e[1] }; });

      // 最近7天趋势
      var dailyTrend = [];
      for (var i = 6; i >= 0; i--) {
        var d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        var dStr = d.toDateString();
        var count = registrations.filter(function(r) { return new Date(r.createdAt).toDateString() === dStr; }).length;
        dailyTrend.push({ date: (d.getMonth() + 1) + '/' + d.getDate(), count: count });
      }

      sendJSON(res, 200, {
        success: true,
        total: registrations.length,
        today: todayCount,
        week: weekCount,
        month: monthCount,
        topSchools: topSchools,
        gradeStats: gradeStats,
        dailyTrend: dailyTrend,
      });
      return;
    }

    // 导出 CSV
    if (pathname === '/api/admin/export' && req.method === 'GET') {
      var rows = [['序号', '姓名', '年级', '学校', '手机号', '注册时间']];
      registrations.slice()
        .sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
        .forEach(function(r, i) {
          rows.push([
            String(i + 1),
            r.name,
            r.grade,
            r.school,
            r.phone,
            new Date(r.createdAt).toLocaleString('zh-CN'),
          ]);
        });
      var csv = rows.map(function(row) {
        return row.map(function(field) { return '"' + String(field).replace(/"/g, '""') + '"'; }).join(',');
      }).join('\n');

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=registrations_' + new Date().toISOString().slice(0, 10) + '.csv',
        'Access-Control-Allow-Origin': '*',
      });
      res.end('\ufeff' + csv);
      return;
    }

    // 修改密码（仅本地模式有效，云端模式通过环境变量配置）
    if (pathname === '/api/admin/password' && req.method === 'POST') {
      try {
        var pwdBody = await parseBody(req);
        var oldPassword = pwdBody.oldPassword, newPassword = pwdBody.newPassword;
        if (oldPassword !== ADMIN_PASSWORD) {
          sendJSON(res, 401, { success: false, message: '原密码错误' });
          return;
        }
        if (!newPassword || newPassword.length < 6) {
          sendJSON(res, 400, { success: false, message: '新密码至少6位' });
          return;
        }
        if (USE_SUPABASE) {
          sendJSON(res, 200, { success: true, message: '云端模式：请在 Render 环境变量中修改 ADMIN_PASSWORD 后重启服务' });
        } else {
          var configPath = path.join(__dirname, 'config.json');
          fs.writeFileSync(configPath, JSON.stringify({ adminPassword: newPassword }, null, 2));
          sendJSON(res, 200, { success: true, message: '密码修改成功，请重启服务生效' });
        }
      } catch(e) {
        sendJSON(res, 500, { success: false, message: '服务器错误' });
      }
      return;
    }
  }

  // ---------- 静态页面 ----------

  if (pathname === '/' || pathname === '/admin' || pathname === '/admin.html') {
    try {
      var html = fs.readFileSync(ADMIN_HTML, 'utf8');
      sendHTML(res, html);
    } catch(e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('管理面板文件未找到');
    }
    return;
  }

  // 404
  sendJSON(res, 404, { success: false, message: '接口不存在' });
}

// ===== 启动服务 =====
async function start() {
  await loadData();

  var server = http.createServer(handleRequest);

  server.listen(PORT, function() {
    console.log('═══════════════════════════════════════════');
    console.log('  鸿途生涯 · 招生目录独立后台');
    console.log('═══════════════════════════════════════════');
    console.log('  存储模式:  ' + (USE_SUPABASE ? 'Supabase 云端' : '本地 JSON 文件'));
    console.log('  管理面板:  http://localhost:' + PORT + '/admin');
    console.log('  注册接口:  http://localhost:' + PORT + '/api/register');
    console.log('  健康检查:  http://localhost:' + PORT + '/api/health');
    console.log('───────────────────────────────────────────');
    console.log('  管理密码:  ' + ADMIN_PASSWORD);
    if (USE_SUPABASE) {
      console.log('  Supabase:  ' + SUPABASE_URL);
    } else {
      console.log('  数据文件:  ' + DATA_FILE);
    }
    console.log('═══════════════════════════════════════════');
  });
}

start();
