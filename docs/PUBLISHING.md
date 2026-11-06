# 公开发布清单

这个项目过去曾以私人仓库形式保存过真实数据、服务器地址和个人化 prompt。删除当前文件并不会自动删除 Git 历史中的旧内容。

## 推荐发布方式

第一次公开时使用当前分支的干净快照建立新仓库，不要直接把已有完整历史设为 public：

1. 确认当前改造已经提交并通过全部测试。
2. 在仓库外创建一个空目录。
3. 使用 `git archive` 导出当前提交，不要复制 `.git`。
4. 在新目录运行 `git init`，再次执行 `python3 scripts/check_public.py`。
5. 检查 `ASSETS.md`，确认有权公开全部美术素材，或先替换它们。
6. 创建第一条公开提交后再推送到新的公开仓库。

示例：

```bash
mkdir ../firefly-public
git archive HEAD | tar -x -C ../firefly-public
cd ../firefly-public
git init
git add .
python3 scripts/check_public.py
git commit -m "Initial open-source release"
```

## 发布前必须通过

```bash
.venv/bin/python -m compileall -q backend run_firefly.py scripts/check_public.py
.venv/bin/python -m unittest discover -s tests -v
npm run build --prefix frontend-react
python3 scripts/check_public.py
```

还应在一个没有 `.env` 和 `data/` 的临时副本中运行安装脚本，确认首次安装不会依赖维护者电脑上的缓存。
