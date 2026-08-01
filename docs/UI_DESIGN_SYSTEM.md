# Firefly UI 设计系统

## 1. 设计方向

Firefly 的关键词是“安静、可信、轻盈”。磨砂玻璃用于表达空间层级，不用于制造装饰噪声：背景负责氛围，大面板负责玻璃材质，小控件负责清晰反馈。

视觉层级：

```text
环境光背景
  └─ 导航外壳 / 页面画布
      └─ 主玻璃卡片
          └─ 无模糊的内层分组、输入框和 chip
```

避免玻璃套玻璃。嵌套区域使用低透明纯色或细分隔线，否则会显得浑浊。

## 2. 令牌来源

全局令牌位于 `src/styles/firefly-theme.css`：

- 品牌色：`--primary-blue`、`--primary-blue-deep`、`--mint`
- 文字：`--deep-blue`、`--text-main`、`--text-muted`、`--text-soft`
- 材质：`--glass-bg`、`--glass-bg-strong`、`--glass-border`、`--glass-blur`
- 阴影：`--shadow-card`、`--shadow-card-hover`、`--glass-highlight`
- 圆角：`--radius-sm` 到 `--radius-xl`
- 动效：`--transition-fast`、`--transition-normal`

禁止在新页面复制一套相近但不同的青色、阴影和透明度。确实需要新的语义色时，先添加 token，再使用。

## 3. 材质规范

主卡片推荐：

```css
.feature-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card), var(--glass-highlight);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
}
```

- 模糊应落在占据明显面积的 surface 上，避免给几十个小元素逐个 `backdrop-filter`。
- 最上缘保留白色内高光，玻璃才有厚度；外阴影保持低对比度。
- 文本区域的实际背景不能过透明，正文与背景对比至少保持可读。
- Hover 只抬升可点击卡片；纯展示卡片不应全部漂浮。

## 4. 字体和密度

- 页面标题：约 28–38px，紧字距，720 左右字重。
- 卡片标题：14–18px；正文 12–14px；辅助信息不低于 10px。
- Eyebrow 使用大写、宽字距，但只作为辅助标签。
- 页面外边距、卡片间距优先使用 8px 基线：8、16、24、32。
- 同层卡片保持相同圆角；不要同时出现 12、15、17、18、20、22px 的随意组合。

## 5. 图标

主导航统一使用 `components/shared/AppIcon.tsx` 的 24×24 线性 SVG：圆角端点、1.7px 描边、不使用彩色 emoji。功能内部需要新图标时延续同一语言，装饰性符号应当克制。

## 6. 状态

每个数据页面都应具备：

- loading：说明正在整理什么，不只显示旋转圈。
- empty：告诉用户下一步能做什么。
- error：说明数据没有被破坏，并提供重试。
- success：短暂确认，不阻塞后续操作。

全局渲染异常由 `AppErrorBoundary` 接管，任何组件错误都不应再次变成无法解释的白屏。

## 7. 响应式

- `> 980px`：三栏或两栏桌面结构。
- `761–980px`：隐藏右面板，保留侧栏。
- `<= 760px`：底部横向可滚动导航；所有功能都必须可达。
- 手机视口优先单列，触控目标至少约 44px。

检查基准为 1440×960 桌面和 390×844 手机。新增页面至少在这两个尺寸确认无横向页面溢出、按钮无遮挡、底部内容可滚动到导航上方。

## 8. Finish layer

`src/styles/polish.css` 是跨页面的材质收口层，最后加载。它用于统一旧页面，不应成为永久堆叠补丁区：当某个组件再次大改，应把结构样式留在组件 CSS，把可复用视觉决策保留在 token/finish layer，并删除失效覆盖。
