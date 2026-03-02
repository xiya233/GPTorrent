# BT 种子上传分享网站

基于 Stitch 设计稿实现：
- 首页（种子列表）
- 上传页（Server Actions 提交）

技术栈：
- Next.js App Router
- Server Actions
- SQLite（bun:sqlite）
- Bun 运行时 + 包管理器
- mise 管理运行环境

## 环境准备

```bash
mise trust .mise.toml
mise install
```

## 启动开发

```bash
mise exec bun -- bun install
mise exec bun -- bun run dev
```

## 初始化数据库

```bash
mise exec bun -- bun run db:init
```

数据库文件位置：`data/btshare.sqlite`
上传文件位置：`data/uploads/`
