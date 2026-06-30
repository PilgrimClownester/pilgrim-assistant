# Firefly

Firefly 是一个本地运行、接入 DeepSeek API 的**桌面陪伴型私人助手**。

长期方向：深色紫色主题、半透明毛玻璃 UI、左侧功能导航、右侧信息面板、桌面悬浮小人、可扩展的插件体系。八字命理作为工具插件之一，不是主入口。

当前主线：React + Electron 桌面应用 + FastAPI 后端 + DeepSeek API。

## 启动方式

### 桌面应用（推荐，一条指令）

Windows：

```powershell
cd D:\zxy\Firefly\pilgrim-assistant
.\start_firefly.bat
```

macOS / Linux：

```bash
cd pilgrim-assistant
./start_firefly.sh
```

兼容旧命令：

```powershell
.\firefly.bat
```

这个入口会自动启动 FastAPI 后端，然后打开 Electron 桌面窗口。Vite 只作为桌面窗口的开发服务使用，不需要手动用浏览器打开。

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

编辑 `.env`，填入你的 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

不要把个人隐私写入 `.env`。个人档案保存在本地 `data/profile.json`。

## 桌面窗口功能

- 默认进入“对话”，Firefly 是通用个人助手，八字只是工具能力之一。
- 对话：学习、项目、代码、状态整理、行动拆解。
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
