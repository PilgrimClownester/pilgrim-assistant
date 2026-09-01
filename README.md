# Firefly

Firefly 是一个为个人长期使用而构建的 AI 助手：以服务器作为数据与智能中心，同时提供浏览器、手机和 Electron 桌面端，并保留一个可以停留在桌面的流萤桌宠。

它不是通用 SaaS，也不以社交或内容展示为目标。项目更关心三个问题：个人信息能否由自己掌控、常用功能能否在断网时继续工作，以及一个助手能否在长期使用中保持安静、连续和可解释。

> 当前处于持续开发阶段。仓库包含完整实现，但不提供带有个人数据的公开演示账号。

## 主要能力

- **个人工作台**：待办、日程、习惯、目标、灵感、支出和项目进度集中管理。
- **AI 对话**：保存云端会话上下文，并支持用户主动删除设备上的聊天记录。
- **离线优先**：待办、日程和学习进度优先从 IndexedDB 加载；恢复网络后再与服务器合并。
- **Edge AI Learning**：以阶段卡片组织学习目标、资料、Checklist、思考挑战与阶段成果。
- **项目驾驶舱**：关联任务、里程碑、关键日程、风险、灵感和决策记录。
- **每周复盘**：聚合一周的完成事项与状态，并生成可确认的下周行动。
- **长期记忆**：记忆可以查看、修改、冻结或删除；只有明确允许的内容才会进入对话上下文。
- **Electron 桌宠**：笔记本端保留原生桌面窗口与悬浮角色，Web 端则适配手机和普通浏览器。

传统文化与自我反思工具作为独立插件存在，不构成产品主入口，也不替代医疗、法律、投资或其他专业判断。

## 架构

```text
Browser / Mobile PWA ─┐
                     ├── React + TypeScript ── FastAPI ── SQLite / files
Electron + Companion ┘                              │
                                                    └── AI API
```

- `frontend-react/`：React Web、移动端布局、离线缓存和 Electron 渲染层。
- `backend/`：FastAPI 接口、认证、同步、对话与个人数据服务。
- `frontend-react/electron/`：桌面窗口和桌宠相关能力。
- `docs/`：架构、开发流程、设计系统、备份恢复与审查记录。
- `data/`：运行期个人数据，不应提交到 Git。

## 快速开始

### 桌面端

Windows：

```powershell
git clone https://github.com/PilgrimClownester/pilgrim-assistant.git
cd pilgrim-assistant
Copy-Item .env.example .env
.\start_firefly.bat
```

Linux / macOS：

```bash
git clone https://github.com/PilgrimClownester/pilgrim-assistant.git
cd pilgrim-assistant
cp .env.example .env
./start_firefly.sh
```

启动器会准备前端依赖、启动 FastAPI，并打开 Electron 窗口。Windows 与 Linux 使用各自的 `node_modules`，避免双系统共享依赖造成二进制模块冲突。

### Docker 服务器

```bash
cp .env.example .env
# 编辑 .env，配置 API 密钥、认证和数据目录
docker compose up -d --build
docker compose ps
```

生产部署建议仅将容器端口绑定到 `127.0.0.1`，再由 Nginx/Caddy 提供 HTTPS、请求大小限制和安全响应头。

## AI 配置

在 `.env` 中配置兼容接口。不要把真实密钥提交到仓库：

```env
DEEPSEEK_API_KEY=replace_me
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
```

Firefly 不要求本地部署大模型；当前主线通过远程 API 完成对话与解释性任务，确定性计算和数据整理尽量在本地代码中完成。

## 数据与隐私

- `.env`、数据库、个人档案、聊天内容与备份均不应进入版本控制。
- 普通页面采用登录后访问；敏感写作空间与主应用分离部署。
- 离线同步使用更新时间与删除墓碑合并，避免删除的数据在其他设备上重新出现。
- AI 长期记忆必须经过用户确认，并允许逐条撤回。
- 部署前请生成独立的会话密钥和强密码，不要沿用示例值。

## 开发资料

更完整的架构说明、UI 规范、备份恢复和维护流程见 [`docs/README.md`](docs/README.md)。

## 项目状态

Firefly 首先服务于作者自己的长期使用，因此接口和数据结构仍会随真实需求演进。欢迎阅读代码和提出建议；若基于本项目搭建自己的助手，请使用独立密钥、数据库和身份信息。
