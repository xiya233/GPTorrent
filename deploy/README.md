# 生产部署文档

本目录提供两种生产部署方式：

1. **Debian 13 手动部署（Bun + systemd + 主机 Nginx）**
2. **Docker Compose 部署（app + worker + qBittorrent + 主机 Nginx）**

## 文档索引

- [Debian 13 手动部署](./debian13-manual.md)
- [Docker Compose 部署](./docker-compose.md)

## 适用场景建议

1. 手动部署：更细粒度可控，适合传统 Linux 运维方式。
2. Compose 部署：交付速度快，结构清晰，适合快速上线和迁移。

## 统一前提

1. 域名已解析到服务器公网 IP。
2. 服务器已放通 TCP `80/443`。
3. 程序通过主机 Nginx 反向代理，HTTPS 证书使用 Certbot 自动签发。
4. 运行目录都使用本地磁盘持久化（SQLite 与上传文件都在 `data/`）。

## 核心进程清单

1. Web：`bun run start`
2. Tracker Worker：`bun run tracker:worker`
3. Offline Worker：`bun run offline:worker`
4. 清理任务：
   - `bun run offline:cleanup`
   - `bun run torrents:cleanup`
