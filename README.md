# Firefly

Firefly 是一个本地运行、接入 DeepSeek API 的私人八字命理与自我反思助手。当前主线是“本地生辰八字排盘 + 结构化命理分析 + DeepSeek 风格化解读”：四柱、五行、十神、大运、流年由本地程序生成，DeepSeek 只负责解释结构化数据。

塔罗、易经、每日运势仍作为 Legacy 功能保留。

## 启动方式

推荐一键桌面启动，不需要进入浏览器，也不需要单独启动后端：

```powershell
cd D:\zxy\Firefly\pilgrim-assistant
.\start_firefly.bat
```

兼容旧入口：

```powershell
.\firefly.bat
```

运行后会弹出 Firefly 桌面对话框。它会自动检查本地 FastAPI 后端；如果后端没启动，会在后台启动。默认优先使用 `127.0.0.1:8000`，如果端口不可用，会自动尝试备用端口。

也可以直接运行：

```powershell
python desktop_app.py
```

保留浏览器版本：

```powershell
uvicorn backend.main:app --reload --port 8000
streamlit run frontend/streamlit_app.py
```

如果浏览器版本需要使用其他后端地址：

```powershell
$env:FIREFLY_API_BASE="http://127.0.0.1:8001"
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
