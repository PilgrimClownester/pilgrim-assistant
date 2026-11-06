# 参与贡献

感谢你愿意改进 Firefly。

## 开始之前

1. 先通过 Issue 描述较大的功能或数据结构调整。
2. 从最新主分支创建独立分支。
3. 不要提交 `.env`、API Key、聊天、个人档案、数据库、备份或构建产物。
4. 新增图片或字体时必须说明来源与许可证。

## 本地开发

首次运行 `./install.sh`（Windows 使用 `install.ps1`），然后：

```bash
./start_firefly.sh
```

提交前至少执行：

```bash
.venv/bin/python -m compileall -q backend run_firefly.py
.venv/bin/python -m unittest discover -s tests -v
npm run build --prefix frontend-react
python3 scripts/check_public.py
```

## 代码约定

- 后端数据写入使用锁、同目录临时文件和原子替换。
- 前端请求集中在 `src/api/client.ts`，共享类型集中在 `src/types/`。
- 用户可见操作不能静默失败；页面要有 loading、empty、error 和 success 状态。
- 不要在 prompt、测试或示例中写入真实姓名、联系方式、地址或账号。
- 本项目是桌面应用，不新增手机/PWA、公共 Web 服务或公网监听入口。

Pull Request 请说明改动目的、测试结果以及是否改变本地数据格式。
