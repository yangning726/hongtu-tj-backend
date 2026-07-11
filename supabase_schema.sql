-- =====================================================
-- 鸿途生涯 - 天津招生目录 注册数据表
-- 在 Supabase 控制台 SQL Editor 中执行此脚本
-- =====================================================

-- 创建注册表（列名用带引号的 camelCase，与后端代码一致）
CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  school TEXT NOT NULL,
  phone TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT
);

-- 启用行级安全（RLS）
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 禁止匿名访问（后端用 service_role key 绕过 RLS，前端不直接访问）
-- 不添加任何 policy = 完全禁止匿名/认证用户直接读写
-- 所有读写都通过后端 service_role key 完成

-- 创建索引（按时间倒序查询优化）
CREATE INDEX IF NOT EXISTS idx_registrations_createdat ON registrations ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations (phone);

-- 验证
SELECT 'registrations 表创建成功，当前记录数: ' || COUNT(*)::TEXT AS result FROM registrations;
