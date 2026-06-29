import calendar
import json
import os
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext, ttk

import requests
from PIL import Image, ImageTk


DEFAULT_API_PORT = int(os.getenv("FIREFLY_API_PORT", "8000"))
API_BASE = f"http://127.0.0.1:{DEFAULT_API_PORT}"
ROOT_DIR = Path(__file__).resolve().parent
AVATAR_PATH = ROOT_DIR / "figure" / "firefly2.png"
BACKGROUND_PATH = ROOT_DIR / "figure" / "firefly1.jpg"

FOCUS_OPTIONS = ["综合", "学业", "竞赛", "项目", "事业", "感情", "人际", "状态"]
GENDER_TO_API = {"未指定": "unknown", "男": "male", "女": "female"}
GENDER_FROM_API = {"unknown": "未指定", "male": "男", "female": "女"}
DEFAULT_STYLE = "温柔、直接、坚定，给出具体行动建议。"

COLORS = {
    "bg": "#eef8f5",
    "sidebar": "#0b1f2a",
    "sidebar_muted": "#9fc8c0",
    "sidebar_active": "#27d7a2",
    "card": "#ffffff",
    "text": "#10231f",
    "muted": "#5d7771",
    "border": "#9debd5",
    "glass": "#dff8ef",
    "glass_soft": "#ecfbf5",
    "assistant_bubble": "#e7fbf3",
    "user_bubble": "#3ddfba",
    "accent": "#7cf6d1",
}


class FireflyDesktop(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Firefly")
        self.geometry("1080x740")
        self.minsize(940, 640)
        self.configure(bg=COLORS["bg"])

        self.backend_process: subprocess.Popen | None = None
        self.status_var = tk.StringVar(value="正在检查本地后端...")
        self.profile_vars: dict[str, tk.Variable] = {}
        self.birth_selects: dict[str, ttk.Combobox] = {}
        self.profile_text: dict[str, tk.Text] = {}
        self.personality_text: tk.Text | None = None
        self.true_solar_var = tk.BooleanVar(value=False)
        self.analyze_focus = tk.StringVar(value="综合")
        self.ask_focus = tk.StringVar(value="项目")
        self.avatar_image = self._load_avatar()
        self.bg_source = self._load_background_source()
        self.bg_image: ImageTk.PhotoImage | None = None
        self.chat_y = 18
        self.pages: dict[str, tk.Frame] = {}
        self.active_page_frame: tk.Frame | None = None

        self._configure_style()
        self._build_shell()
        self.show_page("对话")
        self.after(100, self._start_backend_thread)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _load_avatar(self) -> ImageTk.PhotoImage | None:
        if not AVATAR_PATH.exists():
            return None
        image = Image.open(AVATAR_PATH).convert("RGBA").resize((64, 64), Image.LANCZOS)
        return ImageTk.PhotoImage(image)

    def _load_background_source(self) -> Image.Image | None:
        if not BACKGROUND_PATH.exists():
            return None
        return Image.open(BACKGROUND_PATH).convert("RGB")

    def _configure_style(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TCombobox", padding=5)
        style.configure("TEntry", padding=5)
        style.configure(
            "Primary.TButton",
            padding=(14, 8),
            font=("Microsoft YaHei UI", 10, "bold"),
            background=COLORS["sidebar_active"],
            foreground="#06231c",
            bordercolor=COLORS["sidebar_active"],
        )
        style.map("Primary.TButton", background=[("active", COLORS["accent"]), ("pressed", "#12a982")])

    def _build_shell(self) -> None:
        self.sidebar = tk.Frame(self, bg=COLORS["sidebar"], width=220)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        brand = tk.Frame(self.sidebar, bg=COLORS["sidebar"])
        brand.pack(fill="x", padx=18, pady=(18, 12))
        tk.Label(brand, text="Firefly", bg=COLORS["sidebar"], fg="white", font=("Microsoft YaHei UI", 20, "bold")).pack(anchor="w")
        tk.Label(brand, text="本地私人 AI 助手", bg=COLORS["sidebar"], fg=COLORS["sidebar_muted"], font=("Microsoft YaHei UI", 9)).pack(anchor="w", pady=(3, 0))

        self.nav_buttons: dict[str, tk.Button] = {}
        self._nav_label("主功能")
        self._nav_button("对话")
        self._nav_spacer()
        self._nav_label("工具")
        for name in ["八字解读", "八字排盘", "八字追问"]:
            self._nav_button(name)
        self._nav_spacer()
        self._nav_label("设置")
        for name in ["Firefly 性格", "个人档案"]:
            self._nav_button(name)

        tk.Label(
            self.sidebar,
            textvariable=self.status_var,
            bg=COLORS["sidebar"],
            fg=COLORS["sidebar_muted"],
            wraplength=180,
            justify="left",
            font=("Microsoft YaHei UI", 9),
        ).pack(side="bottom", fill="x", padx=18, pady=18)

        self.main = tk.Frame(self, bg=COLORS["bg"])
        self.main.pack(side="left", fill="both", expand=True)
        self.header = tk.Frame(self.main, bg=COLORS["bg"])
        self.header.pack(fill="x", padx=28, pady=(24, 10))
        self.title_label = tk.Label(self.header, text="", bg=COLORS["bg"], fg=COLORS["text"], font=("Microsoft YaHei UI", 22, "bold"))
        self.title_label.pack(anchor="w")
        self.subtitle_label = tk.Label(self.header, text="", bg=COLORS["bg"], fg=COLORS["muted"], font=("Microsoft YaHei UI", 10))
        self.subtitle_label.pack(anchor="w", pady=(4, 0))
        self.content = tk.Frame(self.main, bg=COLORS["bg"])
        self.content.pack(fill="both", expand=True)

    def _set_header_visible(self, visible: bool) -> None:
        self.header.pack_forget()
        self.content.pack_forget()
        if visible:
            self.header.pack(fill="x", padx=28, pady=(24, 10))
        self.content.pack(fill="both", expand=True)

    def _nav_label(self, text: str) -> None:
        tk.Label(self.sidebar, text=text, bg=COLORS["sidebar"], fg=COLORS["sidebar_muted"], font=("Microsoft YaHei UI", 9, "bold")).pack(anchor="w", padx=18, pady=(14, 6))

    def _nav_spacer(self) -> None:
        tk.Frame(self.sidebar, bg="#183845", height=1).pack(fill="x", padx=18, pady=12)

    def _nav_button(self, name: str) -> None:
        button = tk.Button(
            self.sidebar,
            text=name,
            anchor="w",
            relief="flat",
            bd=0,
            padx=14,
            pady=10,
            bg=COLORS["sidebar"],
            fg="#e5e7eb",
            activebackground=COLORS["sidebar_active"],
            activeforeground="#06231c",
            font=("Microsoft YaHei UI", 10),
            command=lambda page=name: self.show_page(page),
        )
        button.pack(fill="x", padx=12, pady=2)
        self.nav_buttons[name] = button

    def show_page(self, page: str) -> None:
        self._set_header_visible(page != "对话")
        for name, button in self.nav_buttons.items():
            active = name == page
            button.configure(bg=COLORS["sidebar_active"] if active else COLORS["sidebar"], fg="#06231c" if active else "#e5e7eb")

        subtitles = {
            "对话": "和 Firefly 聊天、拆解问题、整理行动。八字只是工具，不是唯一能力。",
            "八字解读": "读取已保存档案，生成命理结构解读与现实建议。",
            "八字排盘": "只做本地排盘，不调用 DeepSeek。",
            "八字追问": "围绕已保存的八字结构继续提问。",
            "Firefly 性格": "设置 Firefly 的语气、边界和回答偏好。",
            "个人档案": "统一维护你的基础信息和出生信息。",
        }
        self.title_label.configure(text=page)
        self.subtitle_label.configure(text=subtitles.get(page, ""))
        for frame in self.pages.values():
            frame.pack_forget()

        if page not in self.pages:
            frame = tk.Frame(self.content, bg=COLORS["bg"])
            self.pages[page] = frame
            self.active_page_frame = frame
            if page == "对话":
                self._render_chat()
            elif page == "八字解读":
                self._render_analyze()
            elif page == "八字排盘":
                self._render_chart()
            elif page == "八字追问":
                self._render_ask()
            elif page == "Firefly 性格":
                self._render_personality()
            else:
                self._render_profile()

        self.active_page_frame = self.pages[page]
        self.active_page_frame.pack(fill="both", expand=True)
        if page == "对话" and hasattr(self, "chat_canvas"):
            self._paint_chat_background()

    def _card(self, parent: tk.Widget) -> tk.Frame:
        card = tk.Frame(parent, bg=COLORS["card"], highlightthickness=1, highlightbackground=COLORS["border"])
        card.pack(fill="both", expand=True)
        return card

    def _tool_card(self, parent: tk.Widget) -> tk.Frame:
        wrapper = tk.Frame(parent, bg=COLORS["bg"])
        wrapper.pack(fill="both", expand=True, padx=28, pady=(0, 24))
        return self._card(wrapper)

    def _render_chat(self) -> None:
        card = tk.Frame(self.active_page_frame or self.content, bg="#f3fffa")
        card.pack(fill="both", expand=True)
        self.chat_canvas = tk.Canvas(card, bg="#f3fffa", highlightthickness=0)
        self.chat_canvas.pack(side="top", fill="both", expand=True)
        self.chat_canvas.bind("<Configure>", self._paint_chat_background)
        self.chat_canvas.bind("<MouseWheel>", self._on_chat_mousewheel)
        self.chat_y = 36

        input_bar = tk.Frame(card, bg=COLORS["glass"], highlightthickness=1, highlightbackground=COLORS["border"])
        input_bar.pack(side="bottom", fill="x", padx=24, pady=(0, 24))
        self.chat_input = tk.Text(
            input_bar,
            height=4,
            wrap="word",
            bd=0,
            bg=COLORS["glass_soft"],
            fg=COLORS["text"],
            insertbackground=COLORS["text"],
            highlightthickness=1,
            highlightbackground="#bdf4e4",
            highlightcolor=COLORS["accent"],
            font=("Microsoft YaHei UI", 10),
        )
        self.chat_input.pack(side="left", fill="x", expand=True, padx=10, pady=10)
        self.chat_input.bind("<Control-Return>", lambda _event: self.send_chat())
        ttk.Button(input_bar, text="发送", style="Primary.TButton", command=self.send_chat).pack(side="left", padx=(0, 10))
        self._append_message("assistant", "我在。你可以直接和我说今天要处理的事、代码问题、学习计划，或者只是先把混乱倒出来。")

    def _paint_chat_background(self, _event=None) -> None:
        if not hasattr(self, "chat_canvas") or self.bg_source is None:
            return
        width = max(self.chat_canvas.winfo_width(), 1)
        height = max(self.chat_canvas.winfo_height(), 1)
        source = self.bg_source.copy()
        scale = max(width / source.width, height / source.height)
        resized = source.resize((int(source.width * scale), int(source.height * scale)), Image.LANCZOS)
        source = resized.crop((0, 0, width, height))
        base = Image.new("RGB", (width, height), "#f3fffa")
        base.paste(source, (0, 0))
        veil = Image.new("RGB", (width, height), "#f3fffa")
        blended = Image.blend(base, veil, 0.46)
        self.bg_image = ImageTk.PhotoImage(blended)
        self.chat_canvas.delete("bg")
        self.chat_canvas.create_image(0, self.chat_canvas.canvasy(0), anchor="nw", image=self.bg_image, tags=("bg",))
        self.chat_canvas.tag_lower("bg")

    def _on_chat_mousewheel(self, event: tk.Event) -> str:
        if not hasattr(self, "chat_canvas") or not self.chat_canvas.winfo_ismapped():
            return "break"
        self.chat_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        self._paint_chat_background()
        return "break"

    def _append_message(self, role: str, text: str) -> None:
        if role == "assistant":
            if self.avatar_image is not None:
                self.chat_canvas.create_image(38, self.chat_y + 4, anchor="nw", image=self.avatar_image)
            else:
                avatar = tk.Label(self.chat_canvas, text="F", bg=COLORS["sidebar_active"], fg="#06231c", width=4, height=2)
                self.chat_canvas.create_window(38, self.chat_y + 4, window=avatar, anchor="nw")
            bubble = tk.Label(
                self.chat_canvas,
                text=text,
                bg=COLORS["assistant_bubble"],
                fg=COLORS["text"],
                justify="left",
                wraplength=680,
                padx=14,
                pady=10,
                font=("Microsoft YaHei UI", 10),
            )
            bubble.bind("<MouseWheel>", self._on_chat_mousewheel)
            self.chat_canvas.create_window(112, self.chat_y + 8, window=bubble, anchor="nw")
            self.chat_canvas.update_idletasks()
            message_height = max(76, bubble.winfo_reqheight() + 16)
        else:
            bubble = tk.Label(
                self.chat_canvas,
                text=text,
                bg=COLORS["user_bubble"],
                fg="#05251e",
                justify="left",
                wraplength=680,
                padx=14,
                pady=10,
                font=("Microsoft YaHei UI", 10),
            )
            bubble.bind("<MouseWheel>", self._on_chat_mousewheel)
            self.chat_canvas.create_window(self.chat_canvas.winfo_width() - 36, self.chat_y, window=bubble, anchor="ne")
            self.chat_canvas.update_idletasks()
            message_height = max(54, bubble.winfo_reqheight() + 18)

        self.chat_y += message_height + 14
        self.chat_canvas.configure(scrollregion=(0, 0, self.chat_canvas.winfo_width(), max(self.chat_y + 40, self.chat_canvas.winfo_height())))
        self.chat_canvas.yview_moveto(1.0)
        self._paint_chat_background()

    def _render_analyze(self) -> None:
        card = self._tool_card(self.active_page_frame or self.content)
        toolbar = tk.Frame(card, bg=COLORS["card"])
        toolbar.pack(fill="x", padx=18, pady=18)
        tk.Label(toolbar, text="分析重点", bg=COLORS["card"], fg=COLORS["text"]).pack(side="left")
        ttk.Combobox(toolbar, textvariable=self.analyze_focus, values=FOCUS_OPTIONS, state="readonly", width=12).pack(side="left", padx=10)
        ttk.Button(toolbar, text="生成八字解读", style="Primary.TButton", command=self.generate_analysis).pack(side="left")
        self.analyze_output = self._output(card)

    def _render_chart(self) -> None:
        card = self._tool_card(self.active_page_frame or self.content)
        toolbar = tk.Frame(card, bg=COLORS["card"])
        toolbar.pack(fill="x", padx=18, pady=18)
        tk.Label(toolbar, text="使用个人档案中的出生信息进行本地排盘。", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left")
        ttk.Button(toolbar, text="生成八字排盘", style="Primary.TButton", command=self.generate_chart).pack(side="right")
        self.chart_output = self._output(card)

    def _render_ask(self) -> None:
        card = self._tool_card(self.active_page_frame or self.content)
        top = tk.Frame(card, bg=COLORS["card"])
        top.pack(fill="x", padx=18, pady=18)
        tk.Label(top, text="问题领域", bg=COLORS["card"], fg=COLORS["text"]).pack(side="left")
        ttk.Combobox(top, textvariable=self.ask_focus, values=FOCUS_OPTIONS, state="readonly", width=12).pack(side="left", padx=10)
        ttk.Button(top, text="提交追问", style="Primary.TButton", command=self.ask_bazi).pack(side="left")
        tk.Label(card, text="你的问题", bg=COLORS["card"], fg=COLORS["text"], font=("Microsoft YaHei UI", 10, "bold")).pack(anchor="w", padx=18)
        self.question_text = tk.Text(card, height=4, wrap="word", bd=0, highlightthickness=1, highlightbackground=COLORS["border"])
        self.question_text.pack(fill="x", padx=18, pady=(6, 12))
        self.ask_output = self._output(card)

    def _render_personality(self) -> None:
        card = self._tool_card(self.active_page_frame or self.content)
        body = tk.Frame(card, bg=COLORS["card"])
        body.pack(fill="both", expand=True, padx=18, pady=18)
        tk.Label(body, text="Firefly 性格", bg=COLORS["card"], fg=COLORS["text"], font=("Microsoft YaHei UI", 12, "bold")).pack(anchor="w")
        tk.Label(body, text="设置 Firefly 如何和你说话：语气、边界、输出偏好。", bg=COLORS["card"], fg=COLORS["muted"]).pack(anchor="w", pady=(4, 10))
        self.personality_text = tk.Text(body, height=10, wrap="word", bd=0, highlightthickness=1, highlightbackground=COLORS["border"])
        self.personality_text.pack(fill="x")
        ttk.Button(body, text="保存 Firefly 性格", style="Primary.TButton", command=self.save_personality).pack(anchor="w", pady=12)
        self.load_profile()

    def _render_profile(self) -> None:
        card = self._tool_card(self.active_page_frame or self.content)
        canvas = tk.Canvas(card, bg=COLORS["card"], highlightthickness=0)
        scrollbar = ttk.Scrollbar(card, orient="vertical", command=canvas.yview)
        inner = tk.Frame(canvas, bg=COLORS["card"])
        inner.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.profile_vars = {}
        self.profile_text = {}
        self.birth_selects = {}
        self._profile_section(inner, "基础信息")
        self._entry(inner, "nickname", "称呼")
        self._text(inner, "focus_areas", "关注方向")
        self._text(inner, "current_goals", "当前目标")
        self._text(inner, "notes", "补充说明")
        self._profile_section(inner, "出生信息")
        self._combo(inner, "gender", "性别", ["未指定", "男", "女"])
        self._birth_date_select(inner)
        self._birth_time_select(inner)
        self._entry(inner, "birth_place", "出生地")
        self._text(inner, "bazi_note", "命理分析备注")
        ttk.Checkbutton(inner, text="保存真太阳时偏好（第一阶段仅保存，不参与计算）", variable=self.true_solar_var).pack(anchor="w", padx=18, pady=8)
        ttk.Button(inner, text="保存个人档案", style="Primary.TButton", command=self.save_profile).pack(anchor="w", padx=18, pady=(10, 18))
        self.load_profile()

    def _profile_section(self, parent: tk.Frame, title: str) -> None:
        tk.Label(parent, text=title, bg=COLORS["card"], fg=COLORS["text"], font=("Microsoft YaHei UI", 12, "bold")).pack(anchor="w", padx=18, pady=(18, 6))

    def _entry(self, parent: tk.Frame, key: str, label: str) -> None:
        row = tk.Frame(parent, bg=COLORS["card"])
        row.pack(fill="x", padx=18, pady=5)
        tk.Label(row, text=label, width=14, anchor="w", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left")
        var = tk.StringVar()
        ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)
        self.profile_vars[key] = var

    def _combo(self, parent: tk.Frame, key: str, label: str, values: list[str]) -> None:
        row = tk.Frame(parent, bg=COLORS["card"])
        row.pack(fill="x", padx=18, pady=5)
        tk.Label(row, text=label, width=14, anchor="w", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left")
        var = tk.StringVar(value=values[0])
        ttk.Combobox(row, textvariable=var, values=values, state="readonly").pack(side="left", fill="x", expand=True)
        self.profile_vars[key] = var

    def _birth_date_select(self, parent: tk.Frame) -> None:
        row = tk.Frame(parent, bg=COLORS["card"])
        row.pack(fill="x", padx=18, pady=5)
        tk.Label(row, text="出生日期", width=14, anchor="w", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left")
        year_var = tk.StringVar(value="2005")
        month_var = tk.StringVar(value="1")
        day_var = tk.StringVar(value="1")
        year = ttk.Combobox(row, textvariable=year_var, values=[str(i) for i in range(1900, 2101)], state="readonly", width=8)
        month = ttk.Combobox(row, textvariable=month_var, values=[str(i) for i in range(1, 13)], state="readonly", width=5)
        day = ttk.Combobox(row, textvariable=day_var, values=[str(i) for i in range(1, 32)], state="readonly", width=5)
        year.pack(side="left")
        tk.Label(row, text="年", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left", padx=(4, 10))
        month.pack(side="left")
        tk.Label(row, text="月", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left", padx=(4, 10))
        day.pack(side="left")
        tk.Label(row, text="日", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left", padx=(4, 0))
        self.profile_vars.update({"birth_year": year_var, "birth_month": month_var, "birth_day": day_var})
        self.birth_selects.update({"birth_year": year, "birth_month": month, "birth_day": day})
        year.bind("<<ComboboxSelected>>", lambda _event: self._refresh_birth_days())
        month.bind("<<ComboboxSelected>>", lambda _event: self._refresh_birth_days())

    def _birth_time_select(self, parent: tk.Frame) -> None:
        row = tk.Frame(parent, bg=COLORS["card"])
        row.pack(fill="x", padx=18, pady=5)
        tk.Label(row, text="出生时间", width=14, anchor="w", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left")
        hour_var = tk.StringVar(value="12")
        minute_var = tk.StringVar(value="0")
        hour = ttk.Combobox(row, textvariable=hour_var, values=[str(i) for i in range(24)], state="readonly", width=5)
        minute = ttk.Combobox(row, textvariable=minute_var, values=[str(i) for i in range(60)], state="readonly", width=5)
        hour.pack(side="left")
        tk.Label(row, text="时", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left", padx=(4, 10))
        minute.pack(side="left")
        tk.Label(row, text="分", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left", padx=(4, 0))
        self.profile_vars.update({"birth_hour": hour_var, "birth_minute": minute_var})
        self.birth_selects.update({"birth_hour": hour, "birth_minute": minute})

    def _refresh_birth_days(self) -> None:
        if "birth_day" not in self.birth_selects:
            return
        year = int(self.profile_vars["birth_year"].get())
        month = int(self.profile_vars["birth_month"].get())
        current_day = int(self.profile_vars["birth_day"].get())
        max_day = calendar.monthrange(year, month)[1]
        self.birth_selects["birth_day"].configure(values=[str(i) for i in range(1, max_day + 1)])
        if current_day > max_day:
            self.profile_vars["birth_day"].set(str(max_day))

    def _text(self, parent: tk.Frame, key: str, label: str) -> None:
        row = tk.Frame(parent, bg=COLORS["card"])
        row.pack(fill="x", padx=18, pady=5)
        tk.Label(row, text=label, width=14, anchor="nw", bg=COLORS["card"], fg=COLORS["muted"]).pack(side="left")
        text = tk.Text(row, height=3, wrap="word", bd=0, highlightthickness=1, highlightbackground=COLORS["border"])
        text.pack(side="left", fill="x", expand=True)
        self.profile_text[key] = text

    def _output(self, parent: tk.Frame) -> scrolledtext.ScrolledText:
        output = scrolledtext.ScrolledText(parent, wrap="word", bd=0, highlightthickness=1, highlightbackground=COLORS["border"], font=("Microsoft YaHei UI", 10))
        output.pack(fill="both", expand=True, padx=18, pady=18)
        return output

    def _start_backend_thread(self) -> None:
        threading.Thread(target=self.ensure_backend, daemon=True).start()

    def ensure_backend(self) -> None:
        global API_BASE
        port = self._resolve_backend_port()
        API_BASE = f"http://127.0.0.1:{port}"
        if self.health_ok():
            self.set_status(f"后端已连接 :{port}")
            return
        self.set_status("正在启动后端...")
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform.startswith("win") else 0
        try:
            self.backend_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(port)],
                cwd=ROOT_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
        except Exception as exc:
            self.set_status("后端启动失败")
            self.after(0, lambda: messagebox.showerror("Firefly", f"后端启动失败：{exc}"))
            return
        for _ in range(30):
            if self.health_ok():
                self.set_status(f"后端已启动 :{port}")
                return
            time.sleep(0.5)
        self.set_status("后端启动超时")

    def _resolve_backend_port(self) -> int:
        global API_BASE
        candidates = [DEFAULT_API_PORT, 8001, 8002, 8003, 8010]
        seen: set[int] = set()
        for port in candidates:
            if port in seen:
                continue
            seen.add(port)
            API_BASE = f"http://127.0.0.1:{port}"
            if self.health_ok() or self._can_bind_port(port):
                return port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return int(sock.getsockname()[1])

    def _can_bind_port(self, port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind(("127.0.0.1", port))
                return True
        except OSError:
            return False

    def health_ok(self) -> bool:
        try:
            return requests.get(f"{API_BASE}/health", timeout=1).ok
        except requests.RequestException:
            return False

    def set_status(self, message: str) -> None:
        self.after(0, lambda: self.status_var.set(message))

    def api_get(self, path: str) -> dict:
        response = requests.get(f"{API_BASE}{path}", timeout=15)
        response.raise_for_status()
        return response.json()

    def api_put(self, path: str, payload: dict) -> dict:
        response = requests.put(f"{API_BASE}{path}", json=payload, timeout=20)
        response.raise_for_status()
        return response.json()

    def api_post(self, path: str, payload: dict, timeout: int = 180) -> dict:
        response = requests.post(f"{API_BASE}{path}", json=payload, timeout=timeout)
        response.raise_for_status()
        return response.json()

    def load_profile(self) -> dict | None:
        try:
            profile = self.api_get("/profile")
        except requests.RequestException:
            return None
        if self.personality_text is not None:
            self.personality_text.delete("1.0", "end")
            self.personality_text.insert("1.0", profile.get("communication_style") or DEFAULT_STYLE)
        if self.profile_vars:
            for key, var in self.profile_vars.items():
                if key == "gender":
                    var.set(GENDER_FROM_API.get(profile.get("gender", "unknown"), "未指定"))
                else:
                    value = profile.get(key)
                    var.set("" if value is None else str(value))
            for key, widget in self.profile_text.items():
                widget.delete("1.0", "end")
                widget.insert("1.0", str(profile.get(key) or ""))
            self.true_solar_var.set(bool(profile.get("use_true_solar_time")))
            self._refresh_birth_days()
        return profile

    def _current_profile_payload(self) -> dict:
        payload = dict(self.api_get("/profile"))
        if self.profile_vars:
            payload.update(
                {
                    "nickname": self.profile_vars["nickname"].get().strip(),
                    "focus_areas": self._text_value("focus_areas"),
                    "current_goals": self._text_value("current_goals"),
                    "notes": self._text_value("notes"),
                    "gender": GENDER_TO_API[self.profile_vars["gender"].get()],
                    "calendar_type": "solar",
                    "birth_year": self._optional_int("birth_year"),
                    "birth_month": self._optional_int("birth_month"),
                    "birth_day": self._optional_int("birth_day"),
                    "birth_hour": self._optional_int("birth_hour"),
                    "birth_minute": self._optional_int("birth_minute") or 0,
                    "birth_place": self.profile_vars["birth_place"].get().strip() or None,
                    "use_true_solar_time": self.true_solar_var.get(),
                    "bazi_note": self._text_value("bazi_note") or None,
                    "birth_info": "",
                }
            )
        if self.personality_text is not None:
            payload["communication_style"] = self.personality_text.get("1.0", "end").strip()
        payload["communication_style"] = payload.get("communication_style") or DEFAULT_STYLE
        return payload

    def save_profile(self) -> None:
        try:
            saved = self.api_put("/profile", self._current_profile_payload())
            messagebox.showinfo("Firefly", "个人档案已保存。")
            self.load_profile()
            self.status_var.set(f"个人档案已保存：{saved.get('nickname') or '未填写称呼'}")
        except (requests.RequestException, ValueError) as exc:
            messagebox.showerror("Firefly", f"保存失败：{exc}")

    def save_personality(self) -> None:
        try:
            self.api_put("/profile", self._current_profile_payload())
            messagebox.showinfo("Firefly", "Firefly 性格已保存。")
            self.load_profile()
        except (requests.RequestException, ValueError) as exc:
            messagebox.showerror("Firefly", f"保存失败：{exc}")

    def _text_value(self, key: str) -> str:
        return self.profile_text[key].get("1.0", "end").strip()

    def _optional_int(self, key: str) -> int | None:
        raw = self.profile_vars[key].get().strip()
        return int(raw) if raw else None

    def birth_payload_from_profile(self) -> dict | None:
        try:
            profile = self.api_get("/profile")
        except requests.RequestException as exc:
            messagebox.showerror("Firefly", f"读取个人档案失败：{exc}")
            return None
        if any(profile.get(key) is None for key in ["birth_year", "birth_month", "birth_day", "birth_hour"]):
            messagebox.showwarning("Firefly", "请先在“个人档案”里保存出生日期和出生时间。")
            self.show_page("个人档案")
            return None
        return {
            "name": profile.get("nickname") or "Firefly 用户",
            "gender": profile.get("gender") or "unknown",
            "calendar_type": profile.get("calendar_type") or "solar",
            "birth_year": int(profile["birth_year"]),
            "birth_month": int(profile["birth_month"]),
            "birth_day": int(profile["birth_day"]),
            "birth_hour": int(profile["birth_hour"]),
            "birth_minute": int(profile.get("birth_minute") or 0),
            "birth_place": profile.get("birth_place") or None,
            "use_true_solar_time": bool(profile.get("use_true_solar_time")),
            "note": profile.get("bazi_note") or None,
        }

    def send_chat(self):
        message = self.chat_input.get("1.0", "end").strip()
        if not message:
            messagebox.showwarning("Firefly", "请先输入消息。")
            return "break"
        self.chat_input.delete("1.0", "end")
        self._append_message("user", message)
        self._append_message("assistant", "我在处理，稍等一下。")

        def worker() -> None:
            try:
                data = self.api_post("/chat", {"message": message}, timeout=180)
                answer = data.get("answer", "")
            except requests.RequestException as exc:
                answer = f"请求失败：{exc}"
            self.after(0, lambda: self._append_message("assistant", answer))

        threading.Thread(target=worker, daemon=True).start()
        return "break"

    def generate_chart(self) -> None:
        payload = self.birth_payload_from_profile()
        if payload:
            self._run_api_task(self.chart_output, "/bazi/chart", payload, lambda data: json.dumps(data["chart"], ensure_ascii=False, indent=2), timeout=60)

    def generate_analysis(self) -> None:
        payload = self.birth_payload_from_profile()
        if payload:
            payload["focus"] = self.analyze_focus.get()
            self._run_api_task(self.analyze_output, "/bazi/analyze", payload, self._format_answer_response)

    def ask_bazi(self) -> None:
        payload = self.birth_payload_from_profile()
        question = self.question_text.get("1.0", "end").strip()
        if not question:
            messagebox.showwarning("Firefly", "请先输入你的问题。")
            return
        if payload:
            request = {"birth_info": payload, "question": question, "focus": self.ask_focus.get()}
            self._run_api_task(self.ask_output, "/bazi/ask", request, self._format_answer_response)

    def _run_api_task(self, output: scrolledtext.ScrolledText, path: str, payload: dict, formatter, timeout: int = 180) -> None:
        self._set_output(output, "正在请求 Firefly...\n")

        def worker() -> None:
            try:
                data = self.api_post(path, payload, timeout=timeout)
                text = formatter(data)
            except requests.RequestException as exc:
                text = f"请求失败：{exc}"
            self.after(0, lambda: self._set_output(output, text))

        threading.Thread(target=worker, daemon=True).start()

    def _set_output(self, output: scrolledtext.ScrolledText, text: str) -> None:
        output.delete("1.0", "end")
        output.insert("1.0", text)

    def _format_answer_response(self, data: dict) -> str:
        chart = json.dumps(data.get("chart", {}), ensure_ascii=False, indent=2)
        return f"{data.get('answer', '')}\n\n---\n本次排盘数据：\n{chart}"

    def _on_close(self) -> None:
        if self.backend_process and self.backend_process.poll() is None:
            self.backend_process.terminate()
        self.destroy()


if __name__ == "__main__":
    app = FireflyDesktop()
    app.mainloop()
