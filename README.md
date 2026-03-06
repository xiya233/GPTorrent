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
- 信任种子（管理员可在种子管理页设为/取消信任，前台支持“仅信任”筛选）
- 分类页与标签页（分类总览/分类列表、标签总览/标签列表）
- RSS 订阅（`/rss.xml` 全量订阅，`/rss.xml?category=动画` 按分类订阅）
- 个人资料页（`/u/{username}`，可在账号设置中选择是否公开；管理员可查看私密资料页）
- 登录/注册验证码（后台可分别开关）
- 用户注册开关（后台可关闭公开注册）
- 单用户模式（后台开关，启用后强制关闭访客上传与公开注册，未登录访问种子内容会跳转登录）
- 头像裁剪（1:1）与头像 WebP 自动转码
- 种子图片 WebP 自动转码与详情灯箱缩放
- 上传策略配置（游客/用户种子大小、图片大小、游客图片开关）
- 分类扩展（成人、其他）
- 离线下载与在线播放（qBittorrent + FFmpeg + ArtPlayer，需启动 offline worker）
- 离线任务中心（`/my/offline`，用户名下拉菜单入口）
- 离线存储配额（默认每用户 10GB，管理员可在用户管理页调整）
- 离线任务总览（`/admin/offline`，支持筛选与删除任务）

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

离线 worker 日志中的失败计数已拆分为：
- `queued_failed`：排队阶段失败（如 qB 未启动、登录失败、配置错误）
- `downloading_failed`：下载阶段失败
- `failed_total`：总失败数

在线播放页面使用 ArtPlayer，支持倍速、画中画、截图、快捷键与播放记忆。
HLS 转码已支持多码率（默认 360p/720p/1080p，按源分辨率裁剪）；历史单码率视频会在播放时后台按需升级。
视频在播放前会显示封面图（WebP）；封面采用多时间点智能抽帧，尽量规避黑屏首帧。
历史视频会在首次进入播放页时后台按需补齐封面；播放页可手动“重选封面”。
离线资源（下载/播放/HLS/封面）仅登录用户可访问，且默认仅任务拥有者可访问（管理员可访问全部）。

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
