# Firefly

Firefly 是一个以服务器为数据与 AI 中心、同时支持浏览器、手机和 Electron 桌宠的私人助手。

开发与维护资料见 [docs/README.md](docs/README.md)，包括架构、开发流程、UI 设计系统、备份恢复和代码审查报告。

长期方向：轻盈青蓝色的磨砂玻璃 UI、左侧功能导航、右侧信息面板、桌面悬浮小人和可扩展的插件体系；加密树洞与部分运势工具保留更沉浸的独立主题。八字命理作为工具插件之一，不是主入口。

当前主线：服务器运行 FastAPI、DeepSeek 与 NapCat/QQ；React Web 供手机和浏览器使用；笔记本保留 Electron 与桌宠窗口。

待办、日程和 Edge AI 学习进度采用离线优先模式：已经登录过的设备会从 IndexedDB 立即读取数据，断网时仍可查看和编辑，恢复网络后通过时间戳与删除墓碑自动合并到服务器。AI 对话、占卜和 NapCat/QQ 仍需要网络。

## 启动方式

### 桌面应用（推荐，一条指令）

Windows：

```powershell
cd D:\zxy\Firefly\pilgrim-assistant
.\start_firefly.bat
```

macOS / Linux：

```bash
cd /media/pilgrim/F4C0720FC071D876/zxy/Firefly/pilgrim-assistant
./start_firefly.sh
```

兼容旧命令：

```powershell
.\firefly.bat
```

这个入口会自动启动 FastAPI 后端，然后打开 Electron 桌面窗口。Vite 只作为桌面窗口的开发服务使用，不需要手动用浏览器打开。

双系统说明：

- Windows 和 Linux 不共用 `frontend-react/node_modules`。
- 启动器会按当前系统自动切换到 `frontend-react/.deps/windows-node_modules` 或 `frontend-react/.deps/linux-node_modules`。
- 某个系统第一次启动时，如果还没有对应依赖，会自动执行 `npm install`，之后就会直接启动。
- 如果自动安装失败，先确认当前系统已安装 Node.js/npm，再重新运行启动脚本。

### 兼容旧入口

```bash
python3 desktop_app.py    # Tkinter 桌面版（旧）
```

### 浏览器版（旧）

```bash
uvicorn backend.main:app --reload --port 8000
streamlit run frontend/streamlit_app.py
```

## 安装

```powershell
cd D:\zxy\Firefly\pilgrim-assistant
pip install -r requirements.txt
Copy-Item .env.example .env
```

Linux：

```bash
cd /media/pilgrim/F4C0720FC071D876/zxy/Firefly/pilgrim-assistant
python3 -m pip install -r requirements.txt
cp .env.example .env
```

编辑 `.env`，填入你的 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## 通过 QQ 与 Firefly 远程对话

Firefly 支持接入 **QQ 官方机器人** 的 C2C（私聊）消息：你在 QQ 给机器人发文字，它会调用本机 Firefly 的 `/chat`，所以和桌面端共享 Firefly 的人格、个人档案、日程和待办能力。

1. 在 [QQ 开放平台](https://q.qq.com/) 创建 QQ 机器人，并在「开发设置」获取 `AppID` 和 `AppSecret`；同时为机器人开通/配置 C2C 消息事件。
2. 执行 `python -m pip install -r requirements.txt`，然后在 `.env` 填入：

```env
QQ_BOT_APP_ID=你的_AppID
QQ_BOT_SECRET=你的_AppSecret
QQ_BOT_ALLOWED_OPENIDS=你的_user_openid
QQ_BOT_ENABLED=true
```

3. 启动桌面端（`start_firefly.bat` 或 `./start_firefly.sh`）。设置 `QQ_BOT_ENABLED=true` 后，QQ Bot 会随之启动；也可在后端已运行时单独执行 `python start_qq_bot.py`。

为避免他人使用你的私人助手，机器人默认只回复 `QQ_BOT_ALLOWED_OPENIDS` 中的用户。第一次可以先留空运行 `python start_qq_bot.py`，用 QQ 给机器人发任意文字，终端会记录你的 `user_openid`；将它复制到 `.env` 后重启机器人即可。QQ 侧发送 `/reset`、`重置对话` 或 `清空对话` 可只清空该 QQ 联系人的上下文。

注意：这是 QQ 开放平台的官方机器人能力，不是通过个人 QQ 号模拟登录；运行 Firefly 的电脑或服务器需要持续联网并保持进程运行，才能接收远程消息。

### 复用已有 NapCat 个人 QQ（本项目已配置白名单）

如果已经用 NapCat 登录了一个专门的 QQ 机器人号，可让 Firefly 直接连接其 OneBot 正向 WebSocket。此项目的桥接器只会处理来自 **`449140441`** 的私聊消息，其他 QQ 号的消息会被忽略。

在 `.env` 中填写 NapCat 的实际连接信息（旧 MaiBot 配置显示其地址为 `ws://127.0.0.1:8095`），并启用桥接器：

```env
NAPCAT_WS_URL=ws://127.0.0.1:8095
NAPCAT_TOKEN=在NapCat中设置的访问令牌
NAPCAT_QQ_EXECUTABLE=/home/pilgrim/Napcat/opt/QQ/qq
NAPCAT_QQ_ARGS=-q 你的机器人QQ号
NAPCAT_ALLOWED_QQ=449140441
```

首次需要在 NapCat QQ 中手动完成一次登录；登录状态由 QQ/NapCat 保存。之后 Firefly 默认不启动 QQ 功能，在桌面端进入「设置」→「QQ 对话」或对话页点击“开启 QQ 对话”即可：若 NapCat 尚未运行，Firefly 会自动启动 `NAPCAT_QQ_EXECUTABLE` 并连接它。你用 QQ `449140441` 给机器人 QQ 发私聊即可对话；关闭该选项会停止桥接器和由 Firefly 启动的 QQ/NapCat。QQ 风控、会话过期或异地登录时仍可能要求你本人扫码或验证。也可在 Firefly 后端已运行时单独执行 `python start_napcat_bot.py`。此方式使用个人 QQ 自动化接入，请使用专门的小号并自行评估平台规则和账号风控风险。

不要把个人隐私写入 `.env`。个人档案保存在本地 `data/profile.json`。

## 桌面窗口功能

- 默认进入首页工作台，Firefly 是通用个人助手，八字只是工具能力之一。
- 对话：学习、项目、代码、状态整理、行动拆解。
- 万能收件箱：一句话预览并确认写入待办、日程、支出、习惯、目标、灵感、项目或加密树洞；最近操作支持撤销。
- 项目驾驶舱：集中查看里程碑、任务、关键日程、风险、灵感、决策记录和资料链接。
- 每周复盘：自动聚合完成事项、专注、心情、支出、习惯、目标和项目进展，保存复盘后可确认生成下周任务。
- 八字排盘：读取个人档案，本地生成结构化排盘。
- 八字解读：读取个人档案，调用 DeepSeek 解释排盘。
- 八字追问：围绕八字结构继续提问。
- Firefly 性格：单独设置 Firefly 的语气、边界和回答偏好。
- 个人档案：统一编辑称呼、关注方向、目标和出生信息。

## 后端接口

```text
GET  /health
GET  /profile
PUT  /profile
POST /chat
POST /inbox/parse
POST /inbox/commit
GET  /projects
POST /projects
GET  /reviews/weekly
POST /reviews/weekly
POST /reviews/weekly/plan
POST /bazi/chart
POST /bazi/analyze
POST /bazi/ask
```

## 安全边界

- 不使用 Ollama。
- 不使用本地 LLM。
- 不使用 llama.cpp。
- 不在代码中硬编码 DeepSeek API Key。
- 八字排盘由本地程序完成，DeepSeek 不参与四柱计算。
- 八字解读仅作为传统文化、娱乐性和自我反思参考。
- 它不能替代现实判断、专业建议、医学建议、法律建议或投资建议。
- 不做绝对预测，不恐吓用户，不替用户做重大人生决定。
