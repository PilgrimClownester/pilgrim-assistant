# Firefly API 快速参考

开发环境基址：`http://127.0.0.1:8000`。交互式、始终以当前代码为准的契约位于：

- Swagger UI：`http://127.0.0.1:8000/docs`
- OpenAPI JSON：`http://127.0.0.1:8000/openapi.json`

## 通用约定

- JSON 接口默认 `Content-Type: application/json`。
- 列表通常返回 `{ "items": [...] }`，单项通常返回 `{ "item": {...} }`。
- 创建或更新失败使用 FastAPI 的 `{ "detail": "..." }`。
- 日期使用 `YYYY-MM-DD`，本地时间使用 `HH:MM`，绝对时间使用 ISO 8601。
- 删除项目与撤销收件箱操作的语义不同，详见架构文档的数据关系部分。

## 系统与档案

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 后端健康状态 |
| GET/PUT | `/profile` | 读取/保存个人档案 |
| GET | `/qq/napcat` | NapCat 状态 |
| POST | `/qq/napcat/start` | 启动 NapCat 桥接 |
| POST | `/qq/napcat/stop` | 停止 NapCat 桥接 |

## 任务与日程

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/POST | `/todos` | 列表/创建任务 |
| PATCH/DELETE | `/todos/{todo_id}` | 修改/删除任务 |
| GET/POST | `/schedule` | 列表/创建日程 |
| PATCH/DELETE | `/schedule/{event_id}` | 修改/删除日程 |
| POST | `/sync/productivity` | 多端生产力数据同步 |

## 万能收件箱

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/inbox/parse` | 只解析并返回预览，不写数据 |
| POST | `/inbox/commit` | 确认预览后写入，可附带 `project_id` |
| GET | `/inbox/actions` | 最近写入操作 |
| DELETE | `/inbox/actions/{action_id}` | 撤销一次仍有效的收件箱写入 |

`kind` 可为 `todo`、`schedule`、`expense`、`habit`、`goal`、`idea`、`project` 或 `treehole`。树洞提交额外需要密码和解锁日期。

## 项目驾驶舱

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/POST | `/projects` | 列表/创建项目 |
| GET/PATCH/DELETE | `/projects/{project_id}` | 项目详情/修改/删除 |
| POST | `/projects/{project_id}/milestones` | 添加里程碑 |
| PATCH | `/projects/{project_id}/milestones/{milestone_id}` | 完成/恢复里程碑 |
| POST | `/projects/{project_id}/tasks` | 创建并关联任务 |
| POST | `/projects/{project_id}/events` | 创建并关联日程 |
| POST | `/projects/{project_id}/ideas` | 关联已有灵感 |
| POST | `/projects/{project_id}/risks` | 添加风险 |
| PATCH | `/projects/{project_id}/risks/{risk_id}` | 解决/恢复风险 |
| POST | `/projects/{project_id}/decisions` | 记录决策和理由 |
| POST | `/projects/{project_id}/links` | 添加文档、仓库或资料链接 |

## 每周复盘

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/reviews/weekly` | 聚合最近七天数据和计划建议 |
| GET | `/reviews/weekly/history` | 历史复盘 |
| POST | `/reviews/weekly` | 保存/更新本周复盘 |
| POST | `/reviews/weekly/plan` | 把用户确认的候选写入任务清单 |

## 成长与创作

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/dashboard` | 周/月成长聚合 |
| GET/POST | `/moods` | 心情记录 |
| POST | `/expenses` | 支出记录 |
| GET/POST | `/habits` | 习惯列表/创建 |
| POST | `/habits/{habit_id}/checkin` | 习惯打卡 |
| DELETE | `/habits/{habit_id}` | 删除习惯 |
| GET/POST | `/goals` | 目标列表/创建 |
| PATCH | `/goals/{goal_id}/milestones/{milestone_id}` | 目标里程碑状态 |
| DELETE | `/goals/{goal_id}` | 删除目标 |
| GET/POST | `/ideas` | 灵感列表/创建 |
| GET | `/ideas/random` | 随机旧灵感 |
| DELETE | `/ideas/{idea_id}` | 删除灵感 |
| POST | `/creative/generate` | 续写、润色、整理、起名和文案 |

## 陪伴、树洞和对话

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/POST | `/companion/reflections` | 日复盘 |
| GET/POST | `/companion/memories` | 可见长期记忆 |
| DELETE | `/companion/memories/{memory_id}` | 删除长期记忆 |
| GET/POST | `/companion/focus` | 专注记录 |
| GET | `/companion/weekly` | 首页七日摘要 |
| GET | `/treehole/status` | 只返回胶囊元数据 |
| POST | `/treehole/write` | 加密封存 |
| POST | `/treehole/unlock` | 到期后解密 |
| POST | `/chat` | Firefly 主对话 |
| GET | `/chat/archive` | 对话归档 |
| GET | `/chat/archive/export` | 导出归档 |

## 运势工具

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/bazi/chart` | 本地排盘 |
| POST | `/bazi/analyze` | 模型解读 |
| POST | `/bazi/ask` | 八字追问 |
| POST | `/fortune/tarot` | 塔罗 |
| POST | `/fortune/yijing` | 易经 |
| GET/POST | `/fortune/results/today`、`/fortune/results/sync` | 当日结果与同步 |
| GET | `/fortune/daily` | 生成/读取每日线索 |
| GET | `/fortune/daily/today` | 只读取已保存的每日线索 |

## 兼容性要求

修改已有响应字段前先全局搜索前端类型和类型断言。字段重命名应至少保留一个迁移版本，或者同时提供兼容字段；不要让历史 JSON/SQLite 数据只能通过手工编辑升级。
