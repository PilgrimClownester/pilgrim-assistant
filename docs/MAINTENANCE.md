# Firefly 维护手册

## 状态检查

```bash
curl -fsS http://127.0.0.1:8000/health
ps -ef | rg -i 'firefly|vite|electron|uvicorn'
ss -ltnp | rg ':8000|:5173'
```

正常情况下后端返回 `{"status":"ok"}`。API 与 Vite 都应只在本机使用；FastAPI 不应监听 `0.0.0.0` 或局域网地址。

## 常见问题

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 安装器提示无法创建 `.venv` | 缺少 `python3-venv` | Debian/Ubuntu 安装对应 Python 版本的 venv 包 |
| Electron 无法启动 | Node 版本过旧或 Linux 桌面库缺失 | 确认 Node 20+，从终端启动并查看缺少的动态库 |
| 只有背景没有内容 | 前端依赖或构建缓存异常 | 重新运行安装器；不要删除 `data/` |
| 页面数据一直为空 | 本地后端没有启动 | 检查 `/health` 和启动器输出 |
| 端口被占用 | 旧进程未退出 | 从托盘退出 Firefly，再重新启动 |
| 切换 Windows/Linux 后启动失败 | 两个系统共享了原生 `node_modules` | 在当前系统重新运行对应安装器 |

## 备份

最可靠的方式是先从托盘退出 Firefly，再复制整个 `data/`：

```bash
backup_dir="backups/manual-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp -a data "$backup_dir/"
```

Windows PowerShell：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -Recurse data "backups\manual-$stamp\data"
```

如果不停机复制 SQLite，必须同时复制 `.db`、`.db-wal` 和 `.db-shm`。树洞还需要原密码才能解密。

## 恢复

1. 完全退出 Firefly。
2. 把当前 `data/` 移到带时间戳的保留目录。
3. 将备份的 `data/` 复制回项目。
4. 启动后检查首页、任务、项目和树洞状态。
5. 如有需要，对 SQLite 副本运行 `PRAGMA integrity_check;`。

## 更新

```bash
git pull --ff-only
./install.sh
```

安装器不会覆盖现有 `.env` 或 `data/`。更新前仍建议备份。

## 发布维护

每个可交付版本应完成：

1. 更新版本号与变更记录。
2. 通过 Python 回归、Electron 构建和 `scripts/check_public.py`。
3. 在空 `data/` 快照验证首次启动。
4. 在已有数据的本验证升级。
5. 检查 `ASSETS.md` 中所有公开素材的授权状态。
