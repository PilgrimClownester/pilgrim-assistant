# Firefly 云端部署与维护

当前实例运行于 Ubuntu 24.04，公网地址为 `154.8.193.111`。生产链路为：

```text
手机 / Android App -> 宿主机 Nginx + Let's Encrypt IP HTTPS
                   -> 127.0.0.1:18080 -> web 容器
                   -> Docker 内网 -> Firefly 登录会话 -> api 容器
```

## 服务状态

```bash
cd /home/ubuntu/Firefly/pilgrim-assistant
COMPOSE_ENV_FILES=deploy/docker/compose.env docker compose ps
sudo systemctl status nginx firefly-docker-backup.timer
sudo systemctl status firefly-certbot.timer
curl http://127.0.0.1:18080/api/health
sudo nginx -t
```

后端日志：

```bash
COMPOSE_ENV_FILES=deploy/docker/compose.env docker compose logs --tail=200
COMPOSE_ENV_FILES=deploy/docker/compose.env docker compose logs -f api
```

## 发布更新

服务器现在使用 `server/docker-portable` 分支。更新时执行：

```bash
cd /home/ubuntu/Firefly/pilgrim-assistant
git switch server/docker-portable
git pull --ff-only
./deploy/docker/backup.sh
FIREFLY_PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple ./deploy/docker/deploy.sh
```

完整的部署、恢复和跨服务器迁移流程见 [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)。旧 `firefly.service` 已停用，仅保留为紧急回滚材料。

## 数据与备份

- 数据目录：`/home/ubuntu/Firefly/pilgrim-assistant/data`
- 环境变量：`/home/ubuntu/Firefly/pilgrim-assistant/.env`，权限必须为 `600`
- Docker 每日备份：`/home/ubuntu/Firefly/pilgrim-assistant/backups/docker`
- 每天 03:30 左右备份，保留 14 天
- 首次部署前快照：`/home/ubuntu/firefly-backups/pre-deploy-*.tar.gz`

立即备份：

```bash
./deploy/docker/backup.sh
```

## 安全边界

- 公网只开放 SSH、HTTP 和 HTTPS；容器 API 8000 不映射到宿主机，18080 只监听回环地址。
- IP 入口使用受系统与 Android 信任的 Let's Encrypt 短期证书，证书标识直接包含 `154.8.193.111`。
- `firefly-certbot.timer` 每 12 小时检查续期；短期证书不能依赖人工续期。
- 公网认证由 FastAPI 的签名 HttpOnly Cookie 完成，本地未配置认证变量时保持免登录。
- 密码只以 PBKDF2-SHA256 散列写入 `.env`，会话签名密钥也只保存在服务器 `.env`。
- 不要提交或展示 `.env`、DeepSeek Key、树洞密码和备份文件。

生成新的密码散列：

```bash
cd /home/ubuntu/Firefly/pilgrim-assistant
.venv/bin/python -c 'from getpass import getpass; from backend.auth import hash_password; print(hash_password(getpass("新密码：")))'
```

把结果替换到 `.env` 的 `FIREFLY_AUTH_PASSWORD_HASH`，然后执行 `COMPOSE_ENV_FILES=deploy/docker/compose.env docker compose up -d --force-recreate api`。已有登录会话若需全部失效，同时更换 `FIREFLY_AUTH_SESSION_SECRET`。

## Android 云端版

- 版本：`1.1-cloud`（versionCode 2）
- 下载：`https://154.8.193.111/downloads/Firefly-Android-cloud-v1.1.apk`
- App 只连接可信 HTTPS，不允许明文 HTTP。
- App 加载云端 React 站点，因此普通 UI 和业务更新部署到服务器后立即生效，无需重新安装 APK。
- 本 APK 使用项目原有的 Android debug 签名以便覆盖旧测试版；正式分发前应建立并离线保存固定的 release keystore。
