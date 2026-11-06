# Firefly

Firefly 是一个本地优先、可自行安装的开源 AI 桌面助手。它把对话、任务、日程、项目、复盘、长期记忆与传统文化工具放在同一个 Electron 桌面应用中，并提供可停留在桌面的轻量桌宠。

项目只提供桌面端，不包含手机 App、PWA、公网服务或云端账号体系。FastAPI 只监听 `127.0.0.1`，个人数据默认保存在仓库目录下的 `data/` 中。

> 当前仍在迭代中。首次公开使用前请先阅读[数据与隐私](#数据与隐私)和[美术素材说明](ASSETS.md)。

## 功能

- AI 对话与可控长期记忆
- 今日首页、Todo、日程和本地番茄钟
- 万能收件箱与项目驾驶舱
- 每日/每周复盘、习惯、目标、心情、支出和灵感
- 八字、每日线索、塔罗与易经参考工具
- 加密树洞和桌面悬浮角色
- 聊天归档导出与整个 `data/` 目录备份

## 技术结构

```text
Electron + React + TypeScript
             │ HTTP（仅 127.0.0.1）
             ▼
          FastAPI
             │
             ├── SQLite / JSON（data/）
             └── OpenAI-compatible API
```

## 系统要求

- Python 3.11+
- Node.js 20+
- npm
- Linux 或 Windows 桌面环境

Linux 部分发行版还需要 `python3-venv`。Electron 所需的 GTK/桌面运行库通常随桌面系统提供；最小化安装的 Linux 请参考[故障排查](docs/MAINTENANCE.md)。

## 自动安装

克隆仓库后运行安装器：

Linux：

```bash
git clone https://github.com/your-name/firefly.git
cd firefly
chmod +x install.sh
./install.sh
```

Windows PowerShell：

```powershell
git clone https://github.com/your-name/firefly.git
cd firefly
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

安装器会：

1. 检查 Python 与 Node.js 版本。
2. 创建隔离的 `.venv` 并安装后端依赖。
3. 使用 `npm ci` 安装锁定的前端依赖并执行生产构建。
4. 从 `.env.example` 创建本地 `.env`，不会覆盖已有配置。
5. 在 Linux 应用菜单或 Windows 开始菜单添加 Firefly 入口。

然后编辑 `.env`，填入兼容 OpenAI 接口的 API Key：

```env
DEEPSEEK_API_KEY=replace_me
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
```

对话使用 `DEEPSEEK_MODEL`，收件箱解析、创作、树洞和运势等其他模型功能使用 `DEEPSEEK_FLASH_MODEL`。

没有 API Key 时，本地任务、日程、排盘和数据管理仍可使用；需要模型的功能会明确提示配置缺失。

## 启动

Linux：

```bash
./start_firefly.sh
```

Windows：

```powershell
.\start_firefly.bat
```

启动器会同时运行本地 FastAPI 服务与 Electron 窗口。关闭主窗口只会隐藏到托盘；请从托盘菜单选择“退出”以完整停止应用。

## 数据与隐私

- `.env`、聊天、档案、任务、数据库和备份均已加入 `.gitignore`。
- 默认后端固定绑定 `127.0.0.1`，不要修改为局域网或公网地址。
- 模型请求会携带当前功能所需的上下文；请自行阅读所用 API 服务商的隐私政策。
- 树洞使用本地加密，但忘记密码后无法恢复。
- 备份时完全退出 Firefly，然后复制整个 `data/` 目录。

仓库只保留空目录占位文件，不应包含任何真实用户数据。发布 fork 前可运行：

```bash
python3 scripts/check_public.py
```

## 开发

```bash
# Python 测试
.venv/bin/python -m unittest discover -s tests -v

# Electron / React 构建
npm run build --prefix frontend-react
```

架构、接口、开发约定与维护说明位于 [`docs/`](docs/README.md)。欢迎通过 Issue 或 Pull Request 参与，提交前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 许可

源代码使用 [MIT License](LICENSE)。角色插画、背景图、图标等素材不自动包含在 MIT 授权中，具体边界见 [ASSETS.md](ASSETS.md)。

本项目中的运势功能仅用于传统文化体验与自我反思，不替代医疗、法律、财务或其他专业意见。
