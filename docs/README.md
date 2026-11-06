# Firefly 开发文档

本目录描述 React + Electron + FastAPI 桌面主线。

## 阅读顺序

1. [ARCHITECTURE.md](ARCHITECTURE.md)：系统边界、模块和数据流。
2. [API.md](API.md)：接口分组、响应约定和跨领域关系。
3. [DEVELOPMENT.md](DEVELOPMENT.md)：环境、启动、测试以及新增功能流程。
4. [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md)：视觉令牌、磨砂玻璃和组件规范。
5. [MAINTENANCE.md](MAINTENANCE.md)：备份、恢复、白屏及常见故障排查。
6. [PUBLISHING.md](PUBLISHING.md)：首次公开时的历史、数据与素材检查。

## 当前质量门槛

提交功能前至少执行：

```bash
.venv/bin/python -m compileall -q backend run_firefly.py
.venv/bin/python -m unittest discover -s tests -v
npm run build --prefix frontend-react
python3 scripts/check_public.py
```

全部通过，才说明 Python 可导入、核心数据链路未回归、TypeScript/Electron 可以构建，且发布快照中没有已知私密数据。
