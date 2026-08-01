# Firefly 架构说明

更新时间：2026-07-30

## 1. 运行结构

```text
Electron 主窗口 ─┐
桌面浏览器       ├─ Vite / React UI ─ HTTP ─ FastAPI ─ 领域模块 ─ data/
蒲公英手机浏览器 ┘       │                  │
                         └─ /api 代理 ──────┘

QQ 官方机器人 / NapCat ──────────────── /chat
```

- `run_firefly.py` 是统一启动器：选择当前系统的 Node 依赖、清理旧进程、启动后端、桌面端以及可选的蒲公英手机入口。
- Electron 开发窗口加载 `http://localhost:5173`；手机入口使用 `web` mode 和 `5174` 端口。
- 两个 Vite 实例必须使用不同缓存目录，配置在 `frontend-react/vite.config.ts`，否则会出现 `504 Outdated Optimize Dep` 白屏。
- FastAPI 默认只监听 `127.0.0.1:8000`。手机浏览器通过 Vite `/api` 反向代理访问后端。

## 2. 后端模块边界

| 模块 | 责任 | 主要存储 |
| --- | --- | --- |
| `backend/main.py` | HTTP 路由、请求模型编排、聊天工具调度 | 无直接所有权 |
| `backend/productivity.py` | 待办、日程、同步墓碑 | `productivity.json` |
| `backend/companion.py` | 日复盘、长期记忆、专注记录 | 三个 JSON 文件 |
| `backend/growth.py` | 心情、支出、习惯、目标、灵感 | `growth.db` |
| `backend/workspace.py` | 万能收件箱、项目驾驶舱、周复盘 | `workspace.db`，并关联其他模块 |
| `backend/treehole.py` | AES-GCM 加密时间胶囊、尝试限流 | `data/treehole/` |
| `backend/profile.py` | 用户档案和出生信息 | `profile.json` |
| `backend/chat_archive.py` | 对话归档 | `chat_archive.jsonl` |
| `backend/fortune/` | 日运、塔罗、易经和结果存档 | Fortune JSON 文件 |
| `backend/napcat_runtime.py` | NapCat 桥接进程生命周期 | 进程内状态 |

领域模块应承担校验、持久化和派生字段计算；路由层只负责 HTTP 状态码与编排。后续拆分 `main.py` 时，优先按 `productivity`、`workspace`、`growth`、`fortune` 创建 `APIRouter`，不要把业务逻辑再复制一份。

## 3. 前端模块边界

| 目录 | 责任 |
| --- | --- |
| `src/App.tsx` | 页面选择、主布局和全局 overlay |
| `src/components/layout/` | 侧栏、右侧面板、三栏框架 |
| `src/components/home/` | 今日首页聚合视图 |
| `src/components/inbox/` | 解析预览、确认写入和撤销 |
| `src/components/projects/` | 项目驾驶舱和跨领域关联 |
| `src/components/review/` | 周数据聚合、复盘文字与计划确认 |
| `src/components/shared/` | 图标、错误边界、玻璃卡片等跨页面原语 |
| `src/api/client.ts` | 唯一 HTTP 出口 |
| `src/types/index.ts` | 前端共享数据契约与导航类型 |
| `src/styles/` | 全局令牌、基础样式、动画、移动端和 finish layer |

页面组件可以拥有布局，不能自行发明新的品牌色、阴影或玻璃透明度。跨页面视觉决策放入 `firefly-theme.css` 或 `polish.css`。

## 4. 数据关系

项目本身保存在 `workspace.db`，只保存待办、日程和灵感的 ID：

```text
Project
 ├─ task_ids  ──> productivity.todos
 ├─ event_ids ──> productivity.schedule
 ├─ idea_ids  ──> growth.ideas
 ├─ milestones / risks / decisions / links（项目内嵌）
 └─ 派生：progress、days_left、open_risks、weekly_completed
```

删除普通项目默认保留关联任务和日程；收件箱刚创建项目后的“撤销”会删除该次操作一并创建的子项。修改这条语义时必须同步更新接口、UI 提示和回归测试。

## 5. 持久化原则

- JSON 更新采用“临时文件写完后 `os.replace`”的原子替换方式。
- SQLite 启用 WAL 与 `synchronous=FULL`；一次写操作放在事务中。
- 私密树洞只保存密文、salt、nonce 和元数据，不进入聊天归档或记忆。
- 测试必须把所有存储路径替换到临时目录，禁止读取或修改真实 `data/`。
- 不要在组件里直接读写业务 JSON；所有业务数据都经过后端接口。

## 6. 聊天上下文

`POST /chat` 会组合人格、个人档案、长期记忆、任务/日程、成长数据和项目摘要。新增上下文时要限制条数和长度，避免把完整数据库拼进 prompt；树洞内容永远不能进入该链路。
