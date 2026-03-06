# Docker Compose 部署（app + workers + qBittorrent + 主机 Nginx HTTPS）

> 目标：通过一次 `docker compose up -d` 启动完整服务（Web、tracker worker、offline worker、cleanup、qBittorrent），再由主机 Nginx 反代并启用 HTTPS。

## 1. 前置条件

1. 系统：Debian 13（或兼容 Linux）
2. 已安装 Docker Engine + Docker Compose Plugin
3. 域名已解析到服务器公网 IP（示例：`bt.example.com`）
4. 防火墙已放通 `80/443`（以及可选 BT 端口 `6881/tcp+udp`）
5. 主机已安装 Nginx + Certbot（用于 HTTPS）

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

## 3. 准备目录与项目

```bash
sudo mkdir -p /opt/btshare
sudo chown -R $USER:$USER /opt/btshare
cd /opt/btshare

git clone <你的仓库地址> app
cd app
```

## 4. 创建生产环境变量文件（Compose 专用）

创建 `deploy/.env.prod`：

```bash
mkdir -p deploy deploy/qb/config data
cat > deploy/.env.prod <<'ENV'
NODE_ENV=production
PORT=3000

# 可选：首次创建管理员
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ChangeMe_123456

# qBittorrent（容器内服务名）
QBITTORRENT_URL=http://qbittorrent:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=adminadmin

# 离线/转码
OFFLINE_MAX_CONCURRENCY=2
OFFLINE_RETENTION_DAYS=7
FFMPEG_BIN=ffmpeg
FFPROBE_BIN=ffprobe

# 可选
TORRENT_CLEANUP_RETENTION_DAYS=7
TZ=Asia/Shanghai
ENV
```

## 5. 创建生产 Dockerfile

> 仓库若已有生产 Dockerfile，可直接复用并跳过本节。

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM oven/bun:1.3.10 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.10 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
EXPOSE 3000
CMD ["bunx", "--bun", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
```

## 6. 创建 `docker-compose.yml`

在项目根目录创建：

```yaml
services:
  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:4.5.5
    container_name: btshare-qb
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=${TZ:-Asia/Shanghai}
      - WEBUI_PORT=8080
    volumes:
      - ./deploy/qb/config:/config
      - ./data:/app/data
    ports:
      - "127.0.0.1:8080:8080"
      - "6881:6881"
      - "6881:6881/udp"
    restart: unless-stopped

  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: btshare-app:latest
    container_name: btshare-app
    env_file:
      - ./deploy/.env.prod
    environment:
      - NODE_ENV=production
      - PORT=3000
      - TZ=${TZ:-Asia/Shanghai}
    depends_on:
      - qbittorrent
    command: ["bunx", "--bun", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
    volumes:
      - ./data:/app/data
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped

  tracker-worker:
    image: btshare-app:latest
    container_name: btshare-tracker-worker
    env_file:
      - ./deploy/.env.prod
    environment:
      - NODE_ENV=production
      - TZ=${TZ:-Asia/Shanghai}
    depends_on:
      - app
    command: ["bun", "run", "tracker:worker"]
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  offline-worker:
    image: btshare-app:latest
    container_name: btshare-offline-worker
    env_file:
      - ./deploy/.env.prod
    environment:
      - NODE_ENV=production
      - TZ=${TZ:-Asia/Shanghai}
    depends_on:
      - app
      - qbittorrent
    command: ["bun", "run", "offline:worker"]
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  cleanup-worker:
    image: btshare-app:latest
    container_name: btshare-cleanup-worker
    env_file:
      - ./deploy/.env.prod
    environment:
      - NODE_ENV=production
      - TZ=${TZ:-Asia/Shanghai}
    depends_on:
      - app
    command:
      - sh
      - -lc
      - |
        while true; do
          bun run offline:cleanup || true
          bun run torrents:cleanup || true
          sleep 86400
        done
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

说明：

1. 这里固定 `qbittorrent` 镜像为 `4.5.5`，是为了和示例凭据 `admin/adminadmin` 保持一致，确保 `docker compose up -d` 后 worker 可直接连接。  
2. 生产上线后请尽快在 qB WebUI 修改密码，并同步更新 `deploy/.env.prod` 里的 `QBITTORRENT_PASSWORD`，然后执行 `docker compose up -d` 使服务生效。

## 7. 一键启动

```bash
docker compose up -d
```

查看状态：

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f offline-worker
docker compose logs -f tracker-worker
```

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

## 10. 首次上线检查

1. 打开 `https://bt.example.com`，能看到站点首页
2. 登录并上传一个 `.torrent`，详情页可访问
3. 创建离线任务，`offline-worker` 日志有推进
4. tracker 数据可刷新（`tracker-worker` 有输出）
5. qB WebUI 可从主机本地访问：`http://127.0.0.1:8080`

若 qB 登录失败，可先执行：

```bash
docker compose logs -f qbittorrent
```

确认 qB 实际登录账号密码后，再同步 `deploy/.env.prod` 并重启服务。

## 11. 运维命令

```bash
# 查看实时日志
docker compose logs -f app
docker compose logs -f offline-worker
docker compose logs -f tracker-worker
docker compose logs -f qbittorrent

# 重启单个服务
docker compose restart app
docker compose restart offline-worker

# 升级（拉代码 -> 重建 -> 重启）
git pull
docker compose build --pull
docker compose up -d
```

## 12. 备份建议（必须）

至少备份以下目录：

1. `data/`（SQLite、上传文件、离线文件、HLS、头像、站点文件）
2. `deploy/qb/config/`（qB 配置）
3. `deploy/.env.prod`（注意脱敏和权限）

## 13. 常见问题

1. `qB 登录失败`：检查 `deploy/.env.prod` 的 `QBITTORRENT_*` 是否与 qB WebUI 账号一致。  
2. `ffmpeg not found`：确保镜像内有 ffmpeg（本文 Dockerfile 基于 bun 官方镜像，需宿主能构建并在容器可执行）。  
3. `502 Bad Gateway`：检查 `docker compose ps` 中 `app` 是否 healthy/running。  
4. `HTTPS 失败`：检查 DNS 解析与 80 端口对外连通。
