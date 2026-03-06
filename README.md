# GPTorrent 多用户BT种子上传分享 离线下载 在线播放

当前功能：
- 首页（种子列表，支持搜索/分类）
- 上传系统（访客上传、登录用户实名/匿名上传）
- 用户系统（注册、登录、登出、头像、bio、修改密码）
- 管理面板（用户管理、种子管理、离线任务管理、站点配置）
- Tracker数据统计（需启动Tracker Worker）
- 标签统计（支持设置“信任种子”）
- RSS 订阅（`/rss.xml` 全量订阅，`/rss.xml?category=动画` 按分类订阅）
- 个人资料页（`/u/{username}`，可在账号设置中选择是否公开；管理员可查看私密资料页）
- 单用户模式（启用后强制关闭访客上传与公开注册，未登录访问种子内容会跳转登录）
- 离线下载（需配置qBittorrent 同时启动 offline worker）
- 在线播放 (需安装FFmpeg)

技术栈：
- 前端样式使用 Stitch 设计
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
export FFMPEG_BIN='/usr/bin/ffmpeg'
export FFPROBE_BIN='/usr/bin/ffprobe'
```

启动离线任务 worker：

```bash
mise exec bun -- bun run offline:worker
# 单次执行并打印详细日志
mise exec bun -- bun run offline:worker --once --verbose
```

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

## 单用户模式说明

管理员可在 `管理员面板 / 站点配置` 启用“单用户模式”：

- 启用后：
  - 访客上传强制关闭（保留原配置值，关闭单用户模式后恢复）
  - 用户注册强制关闭（保留原配置值，关闭单用户模式后恢复）
  - 未登录访问公开种子页面与公开资源入口（如 RSS、下载）会跳转登录页
- `/auth/register` 在单用户模式下会显示“注册已关闭”页面

## RSS 使用

- 全部种子：`/rss.xml`
- 按分类：`/rss.xml?category=分类名`（例如 `category=动画`）

## 生产部署文档

- 总览：`deploy/README.md`
- Debian 13 手动部署（Bun + systemd + 主机 Nginx + HTTPS）：`deploy/debian13-manual.md`
- Docker Compose 部署（app + workers + qBittorrent + 主机 Nginx + HTTPS）：`deploy/docker-compose.md`
