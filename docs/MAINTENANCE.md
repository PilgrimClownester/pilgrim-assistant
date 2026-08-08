# Firefly 维护手册

## 1. 日常状态检查

```bash
curl -fsS http://127.0.0.1:8000/health
curl -I http://127.0.0.1:5173/
```

正常情况下分别返回 JSON `{"status":"ok"}` 和 HTTP 200。Linux 查看进程/端口：

```bash
ps -ef | rg -i 'firefly|vite|electron|uvicorn'
ss -ltnp | rg ':8000|:5173|:5174'
```

## 2. 白屏排查

先看页面控制台和 Vite 终端。常见模式：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `504 Outdated Optimize Dep` | 两个 Vite 实例共用或遗留 optimizer 缓存 | 确认 `vite.config.ts` 的 `.vite-desktop` / `.vite-web` 未被改回同一路径，然后重启 |
| 只有背景没有内容 | React 模块未加载或首屏渲染异常 | 重新启动；若组件错误，页面会显示 Firefly Recovery 而不是空白 |
| 数据卡一直显示 0 | 后端未启动、端口变化或请求失败 | 检查 `/health` 和启动器打印的 API 端口 |
| Electron 白屏而浏览器正常 | 旧 Electron 进程或 renderer 缓存 | 从托盘退出后重新执行启动脚本 |

不要先删除 `data/`。UI 白屏与业务数据通常没有关系。

## 3. 备份

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

如果不停机复制 SQLite，必须同时复制 `.db`、`.db-wal` 和 `.db-shm`；因此日常维护仍建议停机备份。

重点数据：

- `profile.json`
- `productivity.json`
- `growth.db`
- `workspace.db`
- `reflections.json`、`memories.json`、`focus_sessions.json`
- `chat_archive.jsonl`
- `treehole/`（缺少密码无法恢复明文）

## 4. 恢复

1. 完全退出 Firefly。
2. 把当前 `data/` 移到带时间戳的保留目录，不要直接覆盖删除。
3. 将备份的 `data/` 复制回项目。
4. 启动后先检查首页、任务、项目和树洞状态。
5. SQLite 异常时执行只读检查：

```bash
sqlite3 data/growth.db 'PRAGMA integrity_check;'
sqlite3 data/workspace.db 'PRAGMA integrity_check;'
```

输出应为 `ok`。

## 5. 缓存与依赖

- 桌面 Vite 缓存：`frontend-react/node_modules/.vite-desktop`
- 手机 Vite 缓存：`frontend-react/node_modules/.vite-web`
- 各系统依赖：`frontend-react/.deps/<platform>-node_modules`
- 构建产物：`frontend-react/dist`、`dist-electron`

缓存可以重建，`data/` 不可以。只在确认进程已退出且错误指向缓存时清理对应 `.vite-*`，不要删除整个 `.deps` 来处理普通白屏。

## 6. 远程访问安全

当前蒲公英入口适合可信虚拟局域网，不等同于可以直接暴露公网。后端当前没有用户登录和 API token；若以后通过公网域名或端口转发访问，必须先增加身份认证、HTTPS、请求限流和来源限制。

`.env`、DeepSeek Key、树洞密码不得提交仓库或写入日志。远程排障时优先提供错误信息，不要直接发送整个 `data/`。

## 7. 发布维护

每次可交付版本应：

1. 更新版本号和变更记录。
2. 通过 Python 回归和前端生产构建。
3. 在干净数据目录验证首次启动。
4. 在已有数据副本验证升级启动。
5. 检查 Windows/Linux Node 依赖隔离。
6. 验证桌面、蒲公英手机入口和托盘退出流程。
