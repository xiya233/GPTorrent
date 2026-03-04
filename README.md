# BT 种子上传分享网站

基于 Stitch 设计稿实现，当前能力：
- 首页（种子列表，支持搜索/分类）
- 上传页（游客上传可开关、登录用户实名/匿名上传）
- 用户系统（注册、登录、登出、会话）
- 个人设置（头像、bio、修改密码）
- 管理员面板（用户管理、站点 LOGO/标题、功能开关）
- 种子详情页（描述、图片、文件列表、tracker统计）
- 我的种子（编辑标题/标签/描述/图片、删除）
- 管理员种子管理（查看全站种子并删除任意记录）
- 分类页与标签页（分类总览/分类列表、标签总览/标签列表）
- 登录/注册验证码（后台可分别开关）
- 用户注册开关（后台可关闭公开注册）
- 头像裁剪（1:1）与头像 WebP 自动转码
- 种子图片 WebP 自动转码与详情灯箱缩放
- 上传策略配置（游客/用户种子大小、图片大小、游客图片开关）
- 分类扩展（成人、其他）
- 离线下载与在线播放（qBittorrent + FFmpeg + ArtPlayer，需启动 offline worker）

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

## Tracker Worker

```bash
mise exec bun -- bun run tracker:worker
# 单次执行并打印详细失败原因
mise exec bun -- bun run tracker:worker --once --verbose
```

建议使用 `systemd/pm2/supervisor` 守护该进程。

## 离线下载 Worker

先配置环境变量：

```bash
export QBITTORRENT_URL='http://127.0.0.1:8080'
export QBITTORRENT_USERNAME='admin'
export QBITTORRENT_PASSWORD='adminadmin'
export OFFLINE_MAX_CONCURRENCY=2
export OFFLINE_RETENTION_DAYS=7
export FFMPEG_BIN='ffmpeg'
export FFPROBE_BIN='ffprobe'
```

启动离线任务 worker：

```bash
mise exec bun -- bun run offline:worker
# 单次执行并打印详细日志
mise exec bun -- bun run offline:worker --once --verbose
```

在线播放页面使用 ArtPlayer，支持倍速、画中画、截图、快捷键与播放记忆。

清理过期离线资源：

```bash
mise exec bun -- bun run offline:cleanup
```

## 元数据补全与清理脚本

```bash
# 为历史种子补齐 infohash/magnet/文件列表/tracker
mise exec bun -- bun run torrents:backfill

# 清理软删除后超过保留期(默认7天)的文件资源
mise exec bun -- bun run torrents:cleanup
```

可通过环境变量设置清理保留天数：

```bash
export TORRENT_CLEANUP_RETENTION_DAYS=7
```

## 目录说明

- 数据库文件：`data/btshare.sqlite`
- 种子文件：`data/uploads/`
- 种子图片：`data/torrent-images/`
- 离线文件：`data/offline/raw/`
- HLS 转码输出：`data/offline/hls/`
- 头像文件：`data/avatars/`
- 站点 LOGO：`data/site/`
- 验证码挑战：`captcha_challenges`（SQLite 表）
