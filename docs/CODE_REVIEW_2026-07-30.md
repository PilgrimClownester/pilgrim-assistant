# Firefly Code Review — 2026-07-30

审查范围：FastAPI 后端、React/Electron 前端、本地存储、启动器、万能收件箱、项目驾驶舱、周复盘和全局 UI。

结论：当前功能链路可以运行，离线优先和数据隐私方向明确；主要风险来自入口文件过大、前端契约偏弱、错误被静默处理以及持久化策略不完全统一。本轮已经修复会直接造成白屏或数据损坏的高优先级项，剩余问题应按下方顺序收敛。

## 已修复

| 等级 | 问题 | 影响 | 处理 |
| --- | --- | --- | --- |
| P0 | 桌面/手机两个 Vite 实例共用 optimizer 缓存 | React 依赖返回 504，页面纯白 | 按 mode 隔离为 `.vite-desktop` 和 `.vite-web` |
| P1 | React 根节点没有错误边界 | 任意首屏 render 异常都表现为白屏 | 新增 `AppErrorBoundary`，显示恢复和复制错误入口 |
| P1 | `profile.py`、`companion.py` 直接覆盖 JSON，且 read-modify-write 缺少完整锁 | 进程中断或并发写入可能产生截断/丢失更新 | 增加 `RLock` 和同目录临时文件原子替换 |
| P1 | 工作区新功能没有可重复回归套件 | 后续改动容易破坏关联、撤销和复盘 | 新增隔离临时数据目录的 `unittest` 测试 |
| P2 | `PageId` 在 `App` 和 `Sidebar` 重复定义 | 新增页面时容易漏改一处 | 统一到 `src/types/index.ts` |
| P2 | 移动端把全部导航塞入固定 5 列/单行高度 | 后排功能被裁切，无法访问 | 改为可横向滚动底部导航，保留全部入口 |
| P2 | 导航混用 emoji 和文本符号 | 跨系统外观不一致、视觉噪声高 | 替换为统一线性 SVG `AppIcon` |
| P2 | 各页面自行定义玻璃透明度、边框和阴影 | 功能丰富但缺少整体精致度 | 建立 token 与 `polish.css` finish layer |

## 待处理

### P1 — 公开网络前必须完成：访问认证

当前 FastAPI 没有登录或 API token。蒲公英可信虚拟局域网可以使用，但不可直接做公网端口映射。公网化之前需要：HTTPS、会话/API token、限流、允许来源配置和敏感操作二次确认。

### P1 — 拆分 `backend/main.py`

`main.py` 当前约 1400 行，混合 70 余条路由、聊天工具识别和模型 prompt 编排。继续增加功能会扩大改动冲突和回归面。

建议分阶段引入：

```text
backend/api/
  productivity.py
  workspace.py
  growth.py
  companion.py
  fortune.py
  chat.py
```

每次只迁移一个领域到 `APIRouter`，保持路径和响应体不变，并在迁移前补接口测试。

### P1 — 建立统一存储仓储层和 schema version

项目同时使用 JSON、JSONL、SQLite 和加密文件，路径由模块全局常量持有。测试可以替换，但迁移、备份和多实例控制仍分散。建议引入 `DataPaths` 配置和每个存储的 schema version；SQLite 增加显式迁移表，JSON 在读取时记录迁移版本。

### P2 — 强化前端 API 契约

`src/api/client.ts` 中仍有较多 `unknown` 参数和无返回泛型的 `request()` 调用，组件通过类型断言恢复类型。后端字段变化可能直到运行时才暴露。建议按领域拆分 client，并为请求/响应声明接口；长期可从 OpenAPI 自动生成类型。

### P2 — 拆分超大组件

- `ToolsView.tsx` 约 660 行
- `SettingsView.tsx` 约 320 行
- `DesktopPet.tsx` 约 320 行
- `ScheduleView.tsx` 约 260 行

应按表单、结果、状态卡片拆分，并把异步状态抽成领域 hooks。拆分目标是缩小状态耦合，不是单纯减少文件行数。

### P2 — 清理静默错误

右面板、首页、创作、树洞等位置存在 `.catch(() => {})`。后台轮询可以安静降级，但用户主动加载或保存失败必须显示可行动的错误；同时建议保留上次成功数据，不要回退成假 0。

### P2 — 路由生命周期和日志

FastAPI 的 `@app.on_event("shutdown")` 已属于旧式生命周期写法，应迁移到 lifespan。后端目前以终端输出为主，建议增加轮转文件日志、请求关联 ID 和敏感字段过滤。

### P2 — 持续集成

仓库暂无自动 CI。建议先建立最小流水线：Python compile + unittest、npm clean install + build、`git diff --check`。不要在未隔离平台原生依赖时直接缓存 `node_modules`。

### P3 — CSS 渐进整理

部分组件 CSS 被压缩成长行，`mobile.css` 超过 1000 行且含大量页面覆盖。本轮 finish layer 已统一最终视觉，但后续修改页面时应将对应段落恢复为可读格式，并逐步用 shared primitives 替代选择器覆盖。

### P3 — 测试客户端依赖迁移

当前 Starlette `TestClient` 会提示 `httpx` 适配层即将弃用并建议迁移到 `httpx2`。现有测试仍全部通过；升级测试依赖时应单独处理，不要与业务功能改动混在同一批提交中。

## 验证证据

- Python `compileall` 通过。
- 原子存储 smoke test 通过。
- React/TypeScript/Vite/Electron 生产构建通过。
- 桌面 1440×960 已检查首页、收件箱、项目、周复盘、任务、日程、成长、创作、树洞和设置。
- 手机 390×844 已检查内容无页面横向溢出，底部导航可横向访问全部 12 个入口。

## 下一轮建议顺序

1. 访问认证设计（仅在准备公网化时提升为立即事项）。
2. 从 `workspace` 路由开始拆分 `main.py`。
3. API 客户端类型化并清除用户操作的静默错误。
4. 引入 CI 与数据 schema migration。
5. 逐页整理压缩 CSS 和大型组件。
