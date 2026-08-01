# Firefly 开发文档

本目录描述当前 React + Electron + FastAPI 主线。旧 Tkinter、Streamlit 入口只作为兼容层，不代表新功能的实现范式。

## 阅读顺序

1. [ARCHITECTURE.md](ARCHITECTURE.md)：系统边界、模块和数据流。
2. [API.md](API.md)：接口分组、响应约定和跨领域关系。
3. [DEVELOPMENT.md](DEVELOPMENT.md)：环境、启动、测试以及新增功能流程。
4. [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md)：视觉令牌、磨砂玻璃和组件规范。
5. [MAINTENANCE.md](MAINTENANCE.md)：备份、恢复、白屏及常见故障排查。
6. [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md)：云端常驻、HTTPS、登录保护和备份。
7. [ANDROID_APP.md](ANDROID_APP.md)：Android 云端版安装、登录、更新与安全说明。
8. [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)：容器部署、更新、备份、恢复和跨服务器迁移。
9. [CODE_REVIEW_2026-07-30.md](CODE_REVIEW_2026-07-30.md)：本轮审查结论和后续技术债。

## 当前质量门槛

提交功能前至少执行：

```bash
python3 -m compileall -q backend run_firefly.py
python3 -m unittest discover -s tests -v
cd frontend-react
npm run build
```

三个命令都通过，才说明 Python 可导入、核心数据链路未回归、TypeScript 与 Electron 可以生产构建。
