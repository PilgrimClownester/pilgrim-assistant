# Firefly 开发指南

## 1. 环境

- Python 3.11 及以上
- Node.js 20 及以上
- npm
- Linux/macOS/Windows 均可运行；Android 是 Capacitor 壳层

安装：

```bash
python3 -m pip install -r requirements.txt
cd frontend-react
npm install
```

项目启动器会把 `frontend-react/node_modules` 指向 `.deps/<platform>-node_modules`。Windows 和 Linux 不应共用同一个原生 Node 依赖目录。

## 2. 启动

完整桌面环境：

```bash
./start_firefly.sh
```

Windows：

```powershell
.\start_firefly.bat
```

单独调试：

```bash
python3 -m uvicorn backend.main:app --reload --port 8000
cd frontend-react
npm run dev
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

## 3. 测试和构建

```bash
# Python 语法和导入
python3 -m compileall -q backend run_firefly.py

# 隔离数据目录的功能回归
python3 -m unittest discover -s tests -v

# React、TypeScript、Vite 和 Electron 构建
cd frontend-react
npm run build
```

`tests/test_workspace.py` 会覆盖离线中文解析、项目关联与撤销、周复盘保存和计划生成。测试失败时不要用真实 `data/` 手动重试；先确认临时路径是否完整替换。

## 4. 新增一个业务功能

推荐顺序：

1. 在领域模块中定义 Pydantic 输入模型和持久化函数。
2. 在 `backend/main.py` 暴露窄路由；404、400 等 HTTP 语义留在路由层。
3. 在 `src/types/index.ts` 增加前端契约。
4. 在 `src/api/client.ts` 增加带明确返回类型的方法。
5. 建立独立页面或复用共享组件，并在 `PageId`、侧栏和 `App.tsx` 注册入口。
6. 为创建、读取、关联、撤销或删除补回归测试。
7. 执行全部质量门槛，并在桌面和 390px 移动视口各检查一次。

不要让页面直接依赖 SQLite/JSON 结构，也不要让 API 返回只有当前组件才理解的临时形状。

## 5. 前端约定

- 共享导航类型只有一个来源：`PageId`。
- 网络请求只从 `src/api/client.ts` 发出。
- 组件必须呈现 loading、empty、error 和 success 四种状态。
- 不要静默吞掉用户发起操作的错误；后台轮询失败可以降级，但应保持最后一次有效数据。
- 图标使用 `AppIcon` 的同一套 SVG 语言，避免混用彩色 emoji。
- 页面 CSS 负责 grid、尺寸和局部结构；颜色、材质、阴影与动效遵守设计系统。
- 复杂页面超过约 300 行时优先拆成领域子组件，而不是继续增加条件分支。

## 6. 后端约定

- 读写本地文件需要锁；写入采用同目录临时文件 + `os.replace`。
- 多表/多文件操作要明确失败后的补偿语义。
- 日期在 API 中使用 `YYYY-MM-DD`，时间使用 `HH:MM`，时间戳使用带时区 ISO 8601。
- 外部模型只用于建议或分类；本地确定性规则应覆盖常见离线输入。
- 禁止记录 API Key、树洞明文或用户密码。
- 列表接口应有合理 limit，上下文拼接也应限制条数。

## 7. 提交前检查表

- [ ] 没有把 `data/*.db`、`.env`、缓存或构建产物加入版本控制。
- [ ] 新接口有输入上限和清晰错误码。
- [ ] 用户数据写入是原子的，撤销/删除语义明确。
- [ ] 空数据和后端离线时页面仍可解释，不会白屏。
- [ ] 桌面、窄屏和手机底部导航可访问。
- [ ] 文档与测试同步更新。
