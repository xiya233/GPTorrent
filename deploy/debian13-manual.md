# Debian 13 手动部署（Bun + systemd + 主机 Nginx + HTTPS）

> 适用场景：你希望在 Debian 13 上使用 systemd 管理 Web 与 worker 进程，并用主机 Nginx 做 HTTPS 反向代理。

## 1. 前置条件

1. 服务器系统：Debian 13（有 `sudo` 权限）
2. 域名已解析到服务器公网 IP（示例：`bt.example.com`）
3. 防火墙已放通 `80/443`（HTTPS 签发和访问必须）
4. 建议使用独立运行用户（本文使用 `btshare`）

## 2. 安装系统依赖

```bash
sudo apt update
sudo apt install -y \
  ca-certificates curl git unzip xz-utils jq \
  ffmpeg nginx certbot python3-certbot-nginx \
  qbittorrent-nox
```

## 3. 创建运行用户与目录

```bash
sudo useradd -m -s /bin/bash btshare || true
sudo mkdir -p /opt/btshare
sudo chown -R btshare:btshare /opt/btshare
```

## 4. 以 `btshare` 用户安装 Bun 与拉取项目

```bash
sudo -u btshare -H bash -lc 'curl -fsSL https://bun.sh/install | bash'
sudo -u btshare -H bash -lc 'cd /opt/btshare && git clone <你的仓库地址> app'
```

> 如果你已把代码上传到服务器目录，可跳过 clone。

## 5. 安装依赖并构建

```bash
sudo -u btshare -H bash -lc 'cd /opt/btshare/app && ~/.bun/bin/bun install'
sudo -u btshare -H bash -lc 'cd /opt/btshare/app && ~/.bun/bin/bun run build'
```

## 6. 准备数据目录与权限

```bash
sudo -u btshare -H bash -lc 'cd /opt/btshare/app && mkdir -p \
  data/uploads \
  data/torrent-images \
  data/offline/raw \
  data/offline/hls \
  data/avatars \
  data/site'
```

## 7. 配置应用环境变量

创建环境变量文件（systemd 会直接读取）：

```bash
sudo mkdir -p /etc/btshare
sudo tee /etc/btshare/app.env >/dev/null <<'ENV'
NODE_ENV=production
PORT=3000

# 可选：首次自动创建管理员
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ChangeMe_123456

# qBittorrent Web API
QBITTORRENT_URL=http://127.0.0.1:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=adminadmin

# 离线任务与转码
OFFLINE_MAX_CONCURRENCY=2
OFFLINE_RETENTION_DAYS=7
FFMPEG_BIN=ffmpeg
FFPROBE_BIN=ffprobe

# 种子软删除文件清理（可选）
TORRENT_CLEANUP_RETENTION_DAYS=7
ENV

sudo chown root:root /etc/btshare/app.env
sudo chmod 600 /etc/btshare/app.env
```

## 8. 配置 qBittorrent systemd

> 本项目离线下载依赖 qBittorrent Web API。

```bash
sudo mkdir -p /var/lib/btshare/qb
sudo chown -R btshare:btshare /var/lib/btshare/qb
```

创建 `/etc/systemd/system/btshare-qbittorrent.service`：

```ini
[Unit]
Description=BTShare qBittorrent Web API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=btshare
Group=btshare
WorkingDirectory=/var/lib/btshare/qb
ExecStart=/usr/bin/qbittorrent-nox --webui-port=8080 --profile=/var/lib/btshare/qb
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

首次启动 qB 服务并确认 WebUI 凭据：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now btshare-qbittorrent.service
```

1. 访问 `http://服务器IP:8080`（或本机 `http://127.0.0.1:8080`）。  
2. 若 qB 首次生成临时密码，可用以下命令查看：  

```bash
journalctl -u btshare-qbittorrent.service -n 100 --no-pager | grep -i -E "temporary|password"
```

3. 登录后在 qB WebUI 里把用户名/密码改成你在 `/etc/btshare/app.env` 里配置的值（默认本文示例为 `admin / adminadmin`）。  
4. 若你改了账号密码，记得同步更新 `/etc/btshare/app.env` 的 `QBITTORRENT_USERNAME/PASSWORD`。

## 9. 配置 Web 与 Worker 的 systemd

### 9.1 Web 服务

创建 `/etc/systemd/system/btshare-web.service`：

```ini
[Unit]
Description=BTShare Web (Next.js + Bun)
After=network-online.target btshare-qbittorrent.service
Wants=network-online.target

[Service]
Type=simple
User=btshare
Group=btshare
WorkingDirectory=/opt/btshare/app
EnvironmentFile=/etc/btshare/app.env
Environment=PATH=/home/btshare/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/home/btshare/.bun/bin/bunx --bun next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 9.2 Tracker Worker

创建 `/etc/systemd/system/btshare-tracker-worker.service`：

```ini
[Unit]
Description=BTShare Tracker Worker
After=network-online.target btshare-web.service
Wants=network-online.target

[Service]
Type=simple
User=btshare
Group=btshare
WorkingDirectory=/opt/btshare/app
EnvironmentFile=/etc/btshare/app.env
Environment=PATH=/home/btshare/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/home/btshare/.bun/bin/bun run tracker:worker
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 9.3 Offline Worker

创建 `/etc/systemd/system/btshare-offline-worker.service`：

```ini
[Unit]
Description=BTShare Offline Worker
After=network-online.target btshare-web.service btshare-qbittorrent.service
Wants=network-online.target

[Service]
Type=simple
User=btshare
Group=btshare
WorkingDirectory=/opt/btshare/app
EnvironmentFile=/etc/btshare/app.env
Environment=PATH=/home/btshare/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/home/btshare/.bun/bin/bun run offline:worker
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

## 10. 配置清理任务（systemd timer）

### 10.1 离线资源清理

`/etc/systemd/system/btshare-offline-cleanup.service`：

```ini
[Unit]
Description=BTShare Offline Cleanup

[Service]
Type=oneshot
User=btshare
Group=btshare
WorkingDirectory=/opt/btshare/app
EnvironmentFile=/etc/btshare/app.env
Environment=PATH=/home/btshare/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/home/btshare/.bun/bin/bun run offline:cleanup
```

`/etc/systemd/system/btshare-offline-cleanup.timer`：

```ini
[Unit]
Description=Run BTShare Offline Cleanup Daily

[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
Unit=btshare-offline-cleanup.service

[Install]
WantedBy=timers.target
```

### 10.2 软删除种子文件清理

`/etc/systemd/system/btshare-torrents-cleanup.service`：

```ini
[Unit]
Description=BTShare Torrents Cleanup

[Service]
Type=oneshot
User=btshare
Group=btshare
WorkingDirectory=/opt/btshare/app
EnvironmentFile=/etc/btshare/app.env
Environment=PATH=/home/btshare/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/home/btshare/.bun/bin/bun run torrents:cleanup
```

`/etc/systemd/system/btshare-torrents-cleanup.timer`：

```ini
[Unit]
Description=Run BTShare Torrents Cleanup Daily

[Timer]
OnCalendar=*-*-* 03:40:00
Persistent=true
Unit=btshare-torrents-cleanup.service

[Install]
WantedBy=timers.target
```

## 11. 启动服务并设置开机自启

```bash
sudo systemctl daemon-reload

sudo systemctl enable --now btshare-web.service
sudo systemctl enable --now btshare-tracker-worker.service
sudo systemctl enable --now btshare-offline-worker.service

sudo systemctl enable --now btshare-offline-cleanup.timer
sudo systemctl enable --now btshare-torrents-cleanup.timer
```

快速检查：

```bash
systemctl status btshare-web.service --no-pager
systemctl status btshare-offline-worker.service --no-pager
systemctl status btshare-tracker-worker.service --no-pager
systemctl status btshare-qbittorrent.service --no-pager
systemctl list-timers --all | grep btshare
```

## 12. 配置主机 Nginx 反代（先 HTTP）

创建 `/etc/nginx/sites-available/btshare.conf`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name bt.example.com;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

启用站点：

```bash
sudo ln -sf /etc/nginx/sites-available/btshare.conf /etc/nginx/sites-enabled/btshare.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 13. 签发 HTTPS（Certbot）

```bash
sudo certbot --nginx -d bt.example.com
```

验证续期：

```bash
sudo certbot renew --dry-run
```

## 14. 部署后验收清单

1. 浏览器访问 `https://bt.example.com` 正常打开
2. 登录、上传、详情页、下载 `.torrent` 正常
3. 离线任务可创建，`offline-worker` 有推进日志
4. Tracker 统计可刷新
5. 定时器存在并启用：`offline-cleanup` / `torrents-cleanup`

## 15. 常用运维命令

```bash
# 查看日志
journalctl -u btshare-web.service -f
journalctl -u btshare-offline-worker.service -f
journalctl -u btshare-tracker-worker.service -f
journalctl -u btshare-qbittorrent.service -f

# 重启服务
sudo systemctl restart btshare-web.service
sudo systemctl restart btshare-offline-worker.service
sudo systemctl restart btshare-tracker-worker.service
sudo systemctl restart btshare-qbittorrent.service

# 手动执行清理
sudo systemctl start btshare-offline-cleanup.service
sudo systemctl start btshare-torrents-cleanup.service
```

## 16. 升级流程（手动部署）

```bash
sudo -u btshare -H bash -lc 'cd /opt/btshare/app && git pull'
sudo -u btshare -H bash -lc 'cd /opt/btshare/app && ~/.bun/bin/bun install'
sudo -u btshare -H bash -lc 'cd /opt/btshare/app && ~/.bun/bin/bun run build'

sudo systemctl restart btshare-web.service
sudo systemctl restart btshare-tracker-worker.service
sudo systemctl restart btshare-offline-worker.service
```

## 17. 常见问题排查

1. `qB 登录失败`：检查 `QBITTORRENT_URL/USERNAME/PASSWORD` 与 qB WebUI 配置是否一致。  
2. `ffmpeg not found`：确认 `FFMPEG_BIN`、`FFPROBE_BIN` 可执行。  
3. `502 Bad Gateway`：先看 `btshare-web.service` 是否存活。  
4. `SQLite locked`：确认没有多套进程重复启动同一个项目目录。  
5. `Certbot 验证失败`：检查 DNS 是否生效、80 端口是否对外放通。
