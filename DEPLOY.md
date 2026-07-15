# Dreamloom Studio 生产服务器部署

本文说明如何用仓库内生产容器配置，在服务器上从零部署、更新、备份、恢复与回滚。

开发环境仍使用根目录 `docker-compose.yml`（Vite dev + 可选暴露 Redis）。  
生产环境使用 `docker-compose.prod.yml`（web + worker + redis + Caddy）。

## 架构

| 服务 | 作用 | 对外 |
|------|------|------|
| `caddy` | TLS、静态/API 反代、WebSocket、安全头、请求体限制 | 80/443 |
| `web` | `vite preview` 提供 `dist-web` + `/api/*`；进度 WebSocket `:8787` | 仅内网 |
| `worker` | BullMQ 消费 AI/Agent 长任务 | 无端口 |
| `redis` | 队列与（规划中）会话共享存储 | **不暴露公网** |

生产镜像 target 为 `prod`：

- 构建阶段生成 `dist-web`
- 运行阶段不启动 Vite 开发服务器
- 以非 root 用户 `dreamloom`（uid 10001）运行
- 支持只读根文件系统（`/data` + `/tmp` 可写）

## 生产必填环境变量

在服务器上复制示例文件并填写：

```bash
cp .env.example .env
chmod 600 .env
```

### 必填 / 强烈建议

| 变量 | 说明 |
|------|------|
| `DREAMLOOM_DOMAIN` | 公网域名，例如 `dreamloom.example.com`；本地可 `localhost` |
| `NOVEL_BOOKSHELF_PASSWORD` 或运行时设置的书架密码 | 公网部署必须启用认证，禁止空密码自动放行 |
| `NOVEL_AUTH_SECRET` | 会话签名/存储密钥（认证加固合并后生效）；用长随机串 |
| `REDIS_URL` | 默认 `redis://redis:6379/0`（compose 内网） |
| `AGENT_TASK_QUEUE_ENABLED` | 生产建议 `true` |
| `NOVEL_TRUST_PROXY` | 经 Caddy/CF 反代时设 `true` |
| 至少一个文本 AI Key | 如 `DEEPSEEK_API_KEY` 或 `CUSTOM_TEXT_API_KEY` + `BASE_URL` + `MODEL` |

### 生成密钥示例

```bash
# 会话密钥
openssl rand -hex 32

# 书架密码（自行保管）
openssl rand -base64 18
```

### 不要做的事

- **不要**把 API Key / 密码 / token 写进 Dockerfile 或镜像层
- **不要**把 `.env` 提交进 git
- **不要**在生产 compose 里给 Redis 映射宿主机端口

完整变量见 `.env.example`。

## 从零部署

### 1. 机器要求

- Docker 24+ / Compose v2+
- 2 CPU / 2–4 GB 内存起步
- 磁盘：书库与镜像，建议 ≥ 20 GB
- 域名 DNS 指向服务器（若用公网 TLS）

### 2. 拉取代码

```bash
git clone https://github.com/Solaris-star/dreamloom-studio.git
cd dreamloom-studio
git checkout main
```

### 3. 配置环境

```bash
cp .env.example .env
# 编辑 .env：域名、密码、AI Key、队列开关
```

本地/内网快速 TLS（默认）：

```env
DREAMLOOM_DOMAIN=localhost
CADDY_TLS_DIRECTIVE=internal
```

公网域名 + 外部 Cloudflare 终止 TLS 时，可让 Caddy 只做 HTTP：

```env
DREAMLOOM_DOMAIN=dreamloom.example.com
CADDY_TLS_DIRECTIVE=internal
# 或按 Caddy 文档改为正式证书配置
HTTP_PORT=80
HTTPS_PORT=443
```

### 4. 构建并启动

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

### 5. 验收

```bash
# 首页（经 Caddy）
curl -k -sS -o /dev/null -w '%{http_code}\n' https://localhost/

# 认证状态 API
curl -k -sS https://localhost/api/auth/status

# 直连 web（应仅在 docker 网络内可达）
docker compose -f docker-compose.prod.yml exec web \
  node -e "fetch('http://127.0.0.1:5174/').then(r=>r.status).then(console.log)"

# Redis 未对公网暴露
ss -lntp | grep 6379 || echo 'host has no redis port (good)'
docker compose -f docker-compose.prod.yml port redis 6379 || echo 'redis not published (good)'

# WebSocket 路径存在（101/400 级响应均可，确认反代打到 8787）
curl -k -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://localhost/agent-tasks
```

浏览器：打开首页 → 登录（若已配置书架密码）→ 触发 Agent 任务观察进度。

### 6. 数据持久化

| 卷 | 内容 |
|----|------|
| `books_data` | 书库 `NOVEL_BOOKS_DIR` |
| `store_data` | `.store.json`（偏好、密码哈希、Provider 等） |
| `redis_data` | 队列 AOF |
| `caddy_data` | TLS 证书 |

重启后数据应保留：

```bash
docker compose -f docker-compose.prod.yml restart
# 再查书架列表 / 登录态
```

## 更新

```bash
cd dreamloom-studio
git pull
docker compose -f docker-compose.prod.yml build web
# worker 与 web 共用同一镜像
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

滚动注意：

1. 先确保 `.env` 无破坏性变更  
2. `worker` 使用 `stop_grace_period: 45s`，尽量等当前任务收尾  
3. 验证 `/api/auth/status` 与首页 HTTP 200  

## 备份

```bash
# 停写可选：暂停 worker 减少队列中途写入
docker compose -f docker-compose.prod.yml stop worker

BACKUP_DIR=./backups/$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# 书库与 store
docker run --rm \
  -v dreamloom-prod_books_data:/data/books:ro \
  -v dreamloom-prod_store_data:/data/store:ro \
  -v "$PWD/$BACKUP_DIR":/backup \
  alpine tar czf /backup/books-store.tgz -C / data/books data/store

# Redis RDB/AOF
docker run --rm \
  -v dreamloom-prod_redis_data:/data:ro \
  -v "$PWD/$BACKUP_DIR":/backup \
  alpine tar czf /backup/redis.tgz -C / data

# 环境文件（勿上传公网）
cp .env "$BACKUP_DIR/env.secret"

docker compose -f docker-compose.prod.yml start worker
```

卷名若因 project name 不同，用：

```bash
docker volume ls | grep dreamloom
```

## 恢复

```bash
docker compose -f docker-compose.prod.yml down
# 恢复卷内容到对应 named volume 后：
docker compose -f docker-compose.prod.yml up -d
```

示例：解压到临时容器写入 volume：

```bash
BACKUP=./backups/20260715-120000
docker volume create dreamloom-prod_books_data
docker volume create dreamloom-prod_store_data
docker run --rm \
  -v dreamloom-prod_books_data:/data/books \
  -v dreamloom-prod_store_data:/data/store \
  -v "$PWD/$BACKUP":/backup \
  alpine sh -c 'tar xzf /backup/books-store.tgz -C / && mv /data/books/* /data/books/ 2>/dev/null; true'
```

## 回滚

```bash
# 1) 代码回滚
git log --oneline -10
git checkout <previous_commit>

# 2) 重新构建旧镜像并启动
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 3) 若数据也被新版本写坏，从备份恢复 books/store/redis
```

也可事先打镜像标签：

```bash
docker tag dreamloom-studio:prod dreamloom-studio:prod-$(date +%Y%m%d)
# 回滚：
export DREAMLOOM_IMAGE=dreamloom-studio:prod-20260715
docker compose -f docker-compose.prod.yml up -d
```

## 资源限制示例

`docker-compose.prod.yml` 内已给出：

| 服务 | CPU limit | 内存 limit |
|------|-----------|------------|
| web | 1.0 | 1536M |
| worker | 1.0 | 1536M |
| redis | 0.5 | 256M |
| caddy | 0.5 | 256M |

可按机器规格修改 `deploy.resources`。

## 安全清单

- [ ] Redis 无 `ports:` 映射到宿主机  
- [ ] 仅 Caddy 暴露 80/443  
- [ ] `.env` 权限 `600`，不进镜像  
- [ ] 公网已配置书架密码  
- [ ] `NOVEL_TRUST_PROXY=true` 且只有受信反代  
- [ ] 容器 `no-new-privileges`、`cap_drop: ALL`、非 root  
- [ ] 日志轮转 `max-size=10m`  
- [ ] 定期备份 books/store/redis  

## 与开发 compose 的关系

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 本地开发：`target: dev`，源码挂载，可映射 Redis 端口 |
| `docker-compose.prod.yml` | 生产：`target: prod`，web/worker 分离，Caddy，Redis 不暴露 |
| `Dockerfile` | 同时包含 `dev` / `build` / `prod` stage |

## 故障排查

```bash
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f caddy
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

常见问题：

- **API 404**：确认用的是 `prod` 镜像且 `vite.web.plugins.mjs` 注册了 `configurePreviewServer`  
- **登录 426**：远程非 HTTPS；检查 Caddy TLS / `NOVEL_TRUST_PROXY`  
- **队列不跑**：`AGENT_TASK_QUEUE_ENABLED=true` 且 worker 容器 healthy，Redis 可达  
- **书库丢失**：检查 `books_data` 卷是否在 `down -v` 时被删掉  
