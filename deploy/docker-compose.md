# Docker Compose 部署（仓库内置配置，含 FFmpeg）

> 目标：只要准备 `.env` 并执行 `docker compose up -d --build`，就能一次启动 Web、Tracker Worker、Offline Worker、Cleanup Worker、qBittorrent，且离线转码可直接使用 `ffmpeg/ffprobe`。

## 1. 前置条件

1. 系统：Debian 13（或兼容 Linux）
2. 已安装 Docker Engine + Docker Compose Plugin
3. 域名已解析到服务器公网 IP（示例：`bt.example.com`）
4. 防火墙已放通 `80/443`（以及可选 BT 端口 `6881/tcp+udp`）
5. 主机已安装 Nginx + Certbot（用于 HTTPS，Nginx 不跑容器）

## 2. 安装 Docker / Compose（Debian）

如果尚未安装：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

## 3. 拉取项目并准备目录

```bash
sudo mkdir -p /opt/btshare
sudo chown -R $USER:$USER /opt/btshare
cd /opt/btshare

git clone <你的仓库地址> app
cd app

mkdir -p data deploy/qb/config
```

## 4. 配置环境变量（根目录 `.env`）

仓库已提供 `.env.example`，复制后按需修改：

```bash
cp .env.example .env
```

至少检查这些值：

1. `QBITTORRENT_USERNAME`
2. `QBITTORRENT_PASSWORD`
3. `ADMIN_USERNAME` / `ADMIN_PASSWORD`（可选）
4. `OFFLINE_MAX_CONCURRENCY`
5. `OFFLINE_RETENTION_DAYS`
6. `PUID` / `PGID` / `CHOWN_MODE`

`PUID/PGID` 是容器内进程使用的数字 UID/GID，不要求宿主机存在同名用户。  
默认值 `10001:10001` 可直接用于“宿主机只有 root 用户”的场景。

## 5. 关键说明（FFmpeg 已内置）

仓库已提供：

1. 根目录 `Dockerfile`（多阶段构建）
2. 根目录 `docker-compose.yml`（5 个服务）

`Dockerfile` 的运行层通过 `apt` 安装了 `ffmpeg`，所以 `offline-worker` 无需依赖宿主机 ffmpeg。
同时镜像内置了 entrypoint 自动降权逻辑：

1. 容器先以 root 启动，读取 `PUID/PGID`
2. 自动创建/复用对应 UID/GID
3. `CHOWN_MODE=auto` 时对 `/app/data` 做按需 `chown`
4. 最终使用 `gosu` 以非 root 运行 `app/tracker/offline/cleanup`

首次启动如果 `data/` 很大，按需 `chown` 会有额外耗时，这是预期行为。

## 6. 一键启动

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f tracker-worker
docker compose logs -f offline-worker
```

检查容器是否已降权：

```bash
docker compose exec app id
docker compose exec tracker-worker id
docker compose exec offline-worker id
docker compose exec cleanup-worker id
```

期望看到 `uid`/`gid` 为你设置的 `PUID/PGID`（默认 `10001`），而不是 `0(root)`。

## 7. 验证 FFmpeg / FFprobe 可用

```bash
docker compose exec app ffmpeg -version
docker compose exec offline-worker ffprobe -version
```

如果两条命令都能输出版本号，说明转码依赖已就绪。

## 8. 主机 Nginx 反向代理（非容器）

安装（若未安装）：

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

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

启用并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/btshare.conf /etc/nginx/sites-enabled/btshare.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 9. 启用 HTTPS（Certbot）

```bash
sudo certbot --nginx -d bt.example.com
sudo certbot renew --dry-run
```

## 10. 首次上线验收

1. 打开 `https://bt.example.com`，首页可访问
2. 能登录并上传 `.torrent`
3. 能创建离线任务，`offline-worker` 有推进日志
4. 打开视频时转码正常（不再报 `ffmpeg not found`）

## 11. 运维命令

```bash
# 实时日志
docker compose logs -f app
docker compose logs -f tracker-worker
docker compose logs -f offline-worker
docker compose logs -f qbittorrent

# 重启服务
docker compose restart app
docker compose restart offline-worker
docker compose restart tracker-worker

# 升级（拉代码 -> 重建 -> 重启）
git pull
docker compose up -d --build
```

## 12. 备份建议

至少备份以下目录/文件：

1. `data/`（SQLite、上传文件、离线文件、HLS、头像、站点文件）
2. `deploy/qb/config/`（qB 配置）
3. `.env`（请妥善保管，不要提交到仓库）

## 13. 常见问题

1. `qB 登录失败`：检查 `.env` 中 `QBITTORRENT_*` 是否与 qB WebUI 一致。  
2. `离线任务无法转码`：先执行 `docker compose exec offline-worker ffmpeg -version`。  
3. `502 Bad Gateway`：检查 `docker compose ps` 中 `app` 是否运行。  
4. `HTTPS 失败`：检查 DNS 和 80 端口连通性。  
5. `权限异常（qB 错误/目录不可写）`：确认 app/worker/qB 使用同一 `PUID/PGID`，必要时删除旧标记后重启：`rm -f data/.ownership-fixed-* && docker compose restart`。
