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

### 学习确认箱

学习候选显示在万能收件箱顶部，与普通收纳共享“先预览、后确认”的原则。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/learning/candidates?status=pending` | 读取待确认候选；`status` 也可为 `confirmed`、`rejected` 或 `all` |
| POST | `/learning/feedback` | 对话中的“记住”“简短些”“理解错了”反馈，只生成候选 |
| POST | `/learning/candidates/{candidate_id}/confirm` | 可在请求体修订内容、分类和 `use_in_chat`，确认后写入长期记忆 |
| POST | `/learning/candidates/{candidate_id}/reject` | 忽略候选并保留审计状态 |
| GET/PATCH | `/learning/preferences` | 读取或暂停从普通对话自动发现候选 |
| GET | `/learning/weekly` | 本周发现、确认、忽略与待处理数量 |

自动发现采用本地高置信规则，不额外调用模型；只识别用户明确表达的稳定偏好、交流边界和长期目标。密码、令牌、联系方式、树洞及运势内容不会保存为候选。暂停自动发现不影响用户主动点击“记住”。候选在确认前不会进入 `/companion/memories`，也不会拼入聊天 prompt。

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
| PATCH/DELETE | `/companion/memories/{memory_id}` | 编辑、冻结、切换对话使用状态/删除长期记忆 |
| GET | `/companion/today` | 本地规则生成的“今日萤火”摘要 |
| GET/POST | `/companion/focus` | 专注记录 |
| GET | `/companion/weekly` | 首页七日摘要 |
| GET | `/treehole/status` | 只返回胶囊元数据 |
| POST | `/treehole/write` | 加密封存 |
| POST | `/treehole/unlock` | 到期后解密 |
| POST | `/chat` | Firefly 主对话 |
| GET | `/chat/archive` | 对话归档 |
| GET | `/chat/archive/export` | 导出归档 |

长期记忆的 `use_in_chat=false` 表示内容仍保存在 Firefly 数据中，但不会被拼入模型上下文；`is_frozen=true` 表示暂停使用，同样不会进入上下文或今日记忆回声。旧数据缺少这些字段时默认保持启用，以兼容已有记忆。

`GET /companion/today` 接受可选的 `day=YYYY-MM-DD`、`hour=0..23` 和 `minute=0..59`。浏览器会传入设备本地时间，避免云服务器时区影响晨间/晚间判断。摘要只在 Firefly 后端读取待办、日程、项目、习惯、心情、复盘和记忆并按确定性规则生成，不调用外部模型。

## 运势工具

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/bazi/chart` | 本地排盘 |
| POST | `/bazi/analyze` | 模型解读 |
| POST | `/bazi/ask` | 八字追问 |
| POST | `/fortune/tarot` | 塔罗 |
| POST | `/fortune/yijing` | 易经 |
| GET/POST | `/fortune/results/today`、`/fortune/results/sync` | 当日结果与同步 |
| GET | `/fortune/daily` | 生成/读取每日线索，返回 `seed`、`yijing`、`answer` 和算法版本 |
| GET | `/fortune/daily/today` | 只读取已保存的每日线索 |

每日线索使用日期稳定的三枚钱币法生成六爻：同一天在手机、电脑和容器重启后保持相同，下一天自然变化。`yijing` 包含本卦、动爻和变卦；模型解读同时接收当日待办、日程与工作台信号，但现实数据只负责建议落点，不改变卦象。系统不会为了追求“每天不同”而主动排除近期出现过的卦或关键词。

当前 `method_version=2`。旧版缓存、缺少日卦的缓存或空答案不会作为当日有效结果，会在下一次生成时自动覆盖；有效结果仍坚持当天只生成一次。

## 兼容性要求

修改已有响应字段前先全局搜索前端类型和类型断言。字段重命名应至少保留一个迁移版本，或者同时提供兼容字段；不要让历史 JSON/SQLite 数据只能通过手工编辑升级。
