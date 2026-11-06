# Firefly 架构说明

更新时间：2026-09-09

## 运行结构

```text
Electron 主窗口 ── React UI ── HTTP / 127.0.0.1 ── FastAPI ── 领域模块 ── data/
        └── 透明桌宠窗口
```

`install.sh` / `install.ps1` 创建隔离环境、安装依赖并验证构建。`run_firefly.py` 清理当前项目遗留进程，启动 FastAPI 与 Electron，并在退出时收尾。

FastAPI 固定监听本机回环地址。项目不提供手机、PWA、容器或公网入口；若改变这个边界，必须重新设计身份认证、HTTPS、来源限制和秘密管理。

### 本地数据流

```text
React UI → IndexedDB 渲染缓存 → 立即更新界面
                    └→ FastAPI → 本机 data/
```

- `data/` 是持久化数据源，IndexedDB 用于降低渲染延迟和短暂后端故障时的体验降级。
- 待办与日程保留 `updated_at` 和删除墓碑，用于安全合并本地缓存。
- 对话和需要模型的功能依赖外部 API；确定性计算、数据整理和排盘尽量留在本地。
- Electron 渲染层加载 `http://localhost:5173`，FastAPI 默认使用 `127.0.0.1:8000`。

## 后端模块

| 模块 | 责任 | 主要存储 |
| --- | --- | --- |
| `backend/main.py` | HTTP 路由、请求编排、聊天工具调度 | 无直接所有权 |
| `backend/productivity.py` | 待办、日程与缓存合并 | `productivity.json` |
| `backend/companion.py` | 日复盘、长期记忆、专注记录 | JSON 文件 |
| `backend/daily_brief.py` | 不调用模型的早/午/晚摘要 | 无直接所有权 |
| `backend/learning.py` | 学习候选、确认/拒绝和周统计 | `learning.json` |
| `backend/growth.py` | 心情、支出、习惯、目标、灵感 | `growth.db` |
| `backend/workspace.py` | 收件箱、项目驾驶舱、周复盘 | `workspace.db` |
| `backend/treehole.py` | AES-GCM 加密时间胶囊 | `data/treehole/` |
| `backend/profile.py` | 用户档案和出生信息 | `profile.json` |
| `backend/chat_archive.py` | 对话归档 | `chat_archive.jsonl` |
| `backend/fortune/` | 日运、塔罗、易经和结果存档 | Fortune JSON 文件 |

领域模块承担校验、持久化与派生字段计算；路由层只负责 HTTP 语义和编排。数据写入使用锁、同目录临时文件和 `os.replace`，SQLite 使用事务与 WAL。

## 前端模块

| 目录 | 责任 |
| --- | --- |
| `src/App.tsx` | 页面选择、主布局和全局 overlay |
| `src/components/layout/` | 侧栏、右侧面板和主框架 |
| `src/components/home/` | 今日首页与学习视图 |
| `src/components/inbox/` | 收件箱解析、确认和撤销 |
| `src/components/projects/` | 项目驾驶舱和跨领域关联 |
| `src/components/review/` | 周数据聚合、复盘与计划确认 |
| `src/components/shared/` | 图标、错误边界和共享原语 |
| `src/api/client.ts` | 唯一 HTTP 出口 |
| `src/types/index.ts` | 数据契约与导航类型 |
| `src/styles/` | 全局令牌、基础样式、动画与 finish layer |

页面组件可以拥有布局，但跨页面色彩、阴影、玻璃材质与动效应集中在设计系统中。

## 数据关系

项目保存在 `workspace.db`，只引用待办、日程和灵感的 ID：

```text
Project
 ├─ task_ids  ──> productivity.todos
 ├─ event_ids ──> productivity.schedule
 ├─ idea_ids  ──> growth.ideas
 ├─ milestones / risks / decisions / links
 └─ 派生：progress、days_left、open_risks、weekly_completed
```

删除普通项目默认保留关联任务和日程；撤销收件箱写入会删除该次操作一并创建的子项。

## 隐私边界

- `.env`、`data/` 和备份不得进入版本控制。
- 树洞明文、冻结记忆以及 `use_in_chat=false` 的记忆不得进入模型上下文。
- `/chat` 只拼接有数量与长度上限的档案、记忆、任务、成长和项目摘要。
- 真实存储路径在测试中必须替换为临时目录。
- 第一次公开发布应使用干净快照，详见 `PUBLISHING.md`。
