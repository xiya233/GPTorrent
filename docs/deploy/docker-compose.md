# Docker Compose 部署（支持 GHCR 预构建镜像）

## 1. 前置条件

1. 系统：Debian 13（或其他Linux）
2. 已安装 Docker Engine + Docker Compose Plugin
3. 域名已解析到服务器公网 IP（示例：`bt.example.com`）
4. 防火墙已放开 `80/443`（以及qBittorrent端口 `6881/tcp+udp`）
5. 主机已安装 Nginx + Certbot（用于HTTPS）

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
cd /opt
git clone https://github.com/xiya233/GPTorrent.git
cd GPTorrent
```

## 4. 配置环境变量（`.env`）

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
7. `APP_IMAGE_TAG`（仅 GHCR 模式需要，可选，默认 `latest`）

## 5. 关键说明

`PUID/PGID` 是容器内进程使用的数字 UID/GID，不要求宿主机存在同名用户。  
默认值 `10001:10001` 可不做修改，目的只是为了让容器内的应用不使用root运行。

镜像内置了 entrypoint 自动降权逻辑：

1. 容器先以 root 启动，读取 `PUID/PGID`
2. 自动创建/复用对应 UID/GID
3. `CHOWN_MODE=auto` 时对 `/app/data` 做按需 `chown`
4. 最终使用 `gosu` 以非 root 运行 `app/tracker/offline/cleanup`

仓库已提供：

1. 根目录 `Dockerfile`（多阶段构建）
2. 根目录 `docker-compose.yml`
3. 根目录 `docker-compose.ghcr.yml`
4. GitHub Actions 工作流：`.github/workflows/docker-publish.yml`

## 6. 镜像标签规则（GHCR）

镜像名固定为：`ghcr.io/xiya233/gptorrent`

1. push 到 `main`：
   - `edge`
   - `sha-<shortsha>`
2. push tag（例如 `v1.2.3`）：
   - `1.2.3`
   - `1.2`
   - `1`
   - `latest`

## 7. 启动方式

### 方式 A：本地构建（开发/自定义构建）

```bash
docker compose up -d --build
```

### 方式 B：GHCR 预构建镜像（生产推荐）

先在 `.env` 设置你要的标签（可选）：

```bash
APP_IMAGE_TAG=latest
# 或 APP_IMAGE_TAG=edge
# 或 APP_IMAGE_TAG=1.2.3
```

执行：

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --no-build
```

> 说明：`--no-build` 可确保生产机不会走本地 Dockerfile 构建。

查看状态：

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f tracker-worker
docker compose logs -f offline-worker
```

## 8. 主机 Nginx 反向代理

安装（若未安装）：

```bash
sudo apt update
sudo apt install -y nginx python3-certbot-nginx
```

创建 `/etc/nginx/sites-available/gptorrent.conf`：

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
sudo ln -sf /etc/nginx/sites-available/gptorrent.conf /etc/nginx/sites-enabled/gptorrent.conf
sudo nginx -t
sudo systemctl reload nginx
```

申请证书：

```bash
sudo certbot --nginx -d bt.example.com
sudo certbot renew --dry-run
```

## 9. 运维命令

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

GHCR 模式升级：

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --no-build
```

GHCR 模式回滚（改成旧 tag）：

```bash
sed -i 's/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=1.2.3/' .env
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d --no-build
```

## 10. 备份建议

至少备份以下目录/文件：

1. `data/`（程序所有的数据都存储在这里）
2. `.env`（请妥善保管）
3. `config/`（qBittorrent配置）
