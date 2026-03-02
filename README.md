# BT 种子上传分享网站

基于 Stitch 设计稿实现，当前能力：
- 首页（种子列表，支持搜索/分类）
- 上传页（游客匿名上传 + 登录用户可实名/匿名上传）
- 用户系统（注册、登录、登出、会话）
- 个人设置（头像、bio、修改密码）
- 管理员面板（用户管理 + 站点 LOGO/标题配置）

技术栈：
- Next.js App Router + Server Actions
- SQLite（bun:sqlite）
- Bun 运行时 + 包管理器
- mise 管理运行环境

## 环境准备

```bash
mise trust .mise.toml
mise install
mise exec bun -- bun install
```

## 启动开发

```bash
mise exec bun -- bun run dev
```

## 初始化数据库

```bash
mise exec bun -- bun run db:init
```

## 首个管理员初始化（可选）

首次启动前可设置：

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='Admin1234'
```

应用启动时若该用户不存在，将自动创建管理员账号。

## 目录说明

- 数据库文件：`data/btshare.sqlite`
- 种子文件：`data/uploads/`
- 头像文件：`data/avatars/`
- 站点LOGO：`data/site/`
