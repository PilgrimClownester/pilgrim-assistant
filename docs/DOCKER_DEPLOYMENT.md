# Firefly Docker 部署与迁移

服务器专用分支：`server/docker-portable`。

## 1. 架构与数据边界

```text
公网 80/443
  -> 宿主机 Nginx（TLS 证书与续期）
  -> 127.0.0.1:18080
  -> web 容器（React 静态文件 + /api 反向代理）
  -> api 容器（FastAPI，仅 Docker 内网可见）
  -> 宿主机 ./data（持久数据）
```

容器镜像是可重建的，真正需要迁移和备份的只有：

- `.env`：DeepSeek Key、登录密码散列、会话签名密钥；
- `data/`：档案、任务、项目、聊天、树洞和 SQLite 数据；
- TLS：使用域名时可在新服务器重新签发，不必迁移私钥；使用当前 IP 证书时，新 IP 必须重新签发。

## 2. 首次部署

服务器需要 Docker Engine、Compose v2、Nginx 和 Git。Ubuntu 24.04 可安装：

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nginx git rsync
sudo systemctl enable --now docker nginx
sudo usermod -aG docker "$USER"
```

腾讯云内 Docker Hub 访问较慢时，可安装仓库中的腾讯云内网镜像配置：

```bash
sudo install -m 0644 deploy/docker/daemon-tencent.json /etc/docker/daemon.json
sudo systemctl restart docker
docker info | sed -n '/Registry Mirrors/,+2p'
```

`mirror.ccs.tencentyun.com` 仅适用于腾讯云内网；迁移到其他云厂商时不要照搬此文件，应使用目标云的官方镜像加速服务。

腾讯云构建 Python 镜像时还可临时指定其 PyPI 源：

```bash
FIREFLY_PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple ./deploy/docker/deploy.sh
```

重新登录 SSH 让 docker 组生效，然后：

```bash
git clone https://github.com/PilgrimClownester/pilgrim-assistant.git
cd pilgrim-assistant
git switch server/docker-portable
cp .env.example .env
```

填好 `.env`，复制已有 `data/`，执行：

```bash
./deploy/docker/deploy.sh
curl http://127.0.0.1:18080/api/health
```

默认仅绑定宿主机回环地址，公网无法绕过 HTTPS 直接访问 18080。宿主机 Nginx 使用 `deploy/docker/nginx-firefly-docker-host.conf`。

## 3. 更新

```bash
git switch server/docker-portable
git pull --ff-only
./deploy/docker/backup.sh
./deploy/docker/deploy.sh
```

构建成功后 Compose 会滚动替换应用容器。查看状态和日志：

```bash
docker compose ps
docker compose logs -f --tail=200
docker compose logs api --tail=200
```

## 4. 备份与恢复

一致性备份会短暂停止 API，打包 `.env`、`data/` 和 Compose 文件，完成后自动恢复服务：

```bash
./deploy/docker/backup.sh
```

默认保存到 `backups/docker/`，权限为仅当前用户可读，保留 14 天。定时任务模板：

```bash
sudo install -m 0644 deploy/docker/firefly-docker-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/docker/firefly-docker-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now firefly-docker-backup.timer
```

恢复会先把现有 `data/` 移到可回滚目录，并要求手动输入 `RESTORE`：

```bash
./deploy/docker/restore.sh backups/docker/firefly-data-YYYYmmdd-HHMMSS.tar.gz
```

## 5. 迁移到新服务器

在旧服务器生成一致性备份：

```bash
cd /home/ubuntu/Firefly/pilgrim-assistant
archive=$(./deploy/docker/backup.sh)
echo "$archive"
```

在新服务器克隆同一分支，然后通过 SSH 复制备份：

```bash
scp ubuntu@旧服务器:/备份的完整路径 ./
./deploy/docker/restore.sh ./firefly-data-YYYYmmdd-HHMMSS.tar.gz
```

最后把域名解析切到新 IP并重新签发证书。若继续直接使用 IP，Android App 中的云端地址也必须更新并重新发版；长期迁移建议绑定自己的域名，让服务器 IP 变化不影响 App。

## 6. 安全与运维

- 不对公网映射 API 8000；Compose 网络中只有 `web` 可以访问 `api`。
- 18080 默认只绑定 `127.0.0.1`。
- 容器根文件系统只读，只允许 API 写入挂载的 `data/` 和临时目录。
- `.env`、备份和 `data/` 不进入镜像，也不得提交 Git。
- 宿主机只放行 22、80、443。
- 生产迁移前同时检查 Compose 健康状态、登录、任务写入、SQLite 完整性和证书续期。
