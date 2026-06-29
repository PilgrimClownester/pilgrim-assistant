import os
from datetime import date, time

import requests
import streamlit as st


API_BASE = os.getenv("FIREFLY_API_BASE", "http://127.0.0.1:8000")

DEFAULT_PROFILE = {
    "nickname": "",
    "focus_areas": "",
    "current_goals": "",
    "communication_style": "温柔、直接、坚定，给出具体行动建议。",
    "notes": "",
    "gender": "unknown",
    "calendar_type": "solar",
    "birth_year": None,
    "birth_month": None,
    "birth_day": None,
    "birth_hour": None,
    "birth_minute": 0,
    "birth_place": None,
    "use_true_solar_time": False,
    "bazi_note": None,
    "birth_info": "",
}

FOCUS_OPTIONS = ["综合", "学业", "竞赛", "项目", "事业", "感情", "人际", "状态"]


st.set_page_config(page_title="Firefly", page_icon="F", layout="wide")

st.title("Firefly")
st.caption("以生辰八字为核心的本地私人命理分析助手。个人信息统一在“个人档案”页面维护。")


def show_api_error(error: Exception) -> None:
    st.error(
        "没有收到后端回应。请确认 FastAPI 已启动："
        f"`uvicorn backend.main:app --reload --port {API_BASE.rsplit(':', 1)[-1]}`"
    )
    st.caption(f"错误信息：{error}")


def get_profile() -> dict[str, object]:
    try:
        response = requests.get(f"{API_BASE}/profile", timeout=10)
        response.raise_for_status()
        data = response.json()
        return {**DEFAULT_PROFILE, **data}
    except requests.RequestException:
        return DEFAULT_PROFILE.copy()


def save_profile(profile: dict[str, object]) -> None:
    response = requests.put(f"{API_BASE}/profile", json=profile, timeout=20)
    response.raise_for_status()


def render_answer(answer: str) -> None:
    st.markdown("---")
    st.markdown(answer)


def profile_has_birth_info(profile: dict[str, object]) -> bool:
    required = ["birth_year", "birth_month", "birth_day", "birth_hour"]
    return all(profile.get(key) is not None for key in required)


def profile_to_birth_payload(profile: dict[str, object]) -> dict[str, object] | None:
    if not profile_has_birth_info(profile):
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


def require_birth_payload() -> dict[str, object] | None:
    profile = get_profile()
    payload = profile_to_birth_payload(profile)
    if payload is not None:
        st.caption(
            f"当前使用个人档案：{payload['name']}，"
            f"{payload['birth_year']}-{payload['birth_month']:02d}-{payload['birth_day']:02d} "
            f"{payload['birth_hour']:02d}:{payload['birth_minute']:02d}"
        )
        return payload

    st.warning("请先在左侧导航进入“个人档案”，填写并保存出生信息。八字页面不会再单独收集个人信息。")
    return None


def render_chart_summary(chart: dict[str, object]) -> None:
    pillars = chart["pillars"]
    cols = st.columns(4)
    for col, label, key in zip(cols, ["年柱", "月柱", "日柱", "时柱"], ["year", "month", "day", "hour"]):
        col.metric(label, pillars[key])

    st.markdown("#### 基础结构")
    c1, c2 = st.columns(2)
    with c1:
        st.write(f"日主：{chart['day_master']}")
        st.table([{"五行": key, "计数": value} for key, value in chart["wuxing"].items()])
    with c2:
        st.write("十神：")
        st.json(chart["shi_shen"])

    st.markdown("#### 大运")
    if chart.get("da_yun"):
        st.table(chart["da_yun"])
    else:
        st.info("本次没有生成大运数据。")

    st.markdown("#### 流年")
    st.table(chart["liu_nian"])

    for warning in chart.get("warnings", []):
        st.warning(warning)

    with st.expander("完整结构化排盘数据"):
        st.json(chart)


def post_json(path: str, payload: dict[str, object], timeout: int = 120) -> dict[str, object]:
    response = requests.post(f"{API_BASE}{path}", json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json()


def render_bazi_chart_page() -> None:
    st.subheader("八字排盘")
    st.write("本页直接读取“个人档案”中保存的出生信息，不再重复输入。")
    payload = require_birth_payload()
    if payload is None:
        return

    if st.button("生成八字排盘", type="primary"):
        with st.spinner("正在本地排盘..."):
            try:
                data = post_json("/bazi/chart", payload, timeout=30)
                render_chart_summary(data["chart"])
            except requests.RequestException as exc:
                show_api_error(exc)


def render_bazi_analyze_page() -> None:
    st.subheader("八字解读")
    st.write("本页直接读取“个人档案”中保存的出生信息。")
    focus = st.selectbox("分析重点", FOCUS_OPTIONS)
    payload = require_birth_payload()
    if payload is None:
        return

    if st.button("生成八字解读", type="primary"):
        payload["focus"] = focus
        with st.spinner("正在本地排盘，并请求 DeepSeek 进行结构化解读..."):
            try:
                data = post_json("/bazi/analyze", payload, timeout=180)
                render_chart_summary(data["chart"])
                render_answer(data["answer"])
            except requests.RequestException as exc:
                show_api_error(exc)


def render_bazi_ask_page() -> None:
    st.subheader("八字追问")
    st.write("出生信息来自“个人档案”。这里仅输入本次要追问的问题。")
    question = st.text_area("你的问题", placeholder="例如：我最近 CPU 项目答辩状态怎么样？")
    focus = st.selectbox("问题领域", FOCUS_OPTIONS, index=2)
    payload = require_birth_payload()
    if payload is None:
        return

    if st.button("提交追问", type="primary"):
        if not question.strip():
            st.warning("请先写下你的问题。")
            return

        request_payload = {"birth_info": payload, "question": question, "focus": focus}
        with st.spinner("正在本地排盘，并围绕你的问题生成回答..."):
            try:
                data = post_json("/bazi/ask", request_payload, timeout=180)
                st.markdown("#### 问题")
                st.write(data["question"])
                render_answer(data["answer"])
                with st.expander("本次使用的排盘数据"):
                    st.json(data["chart"])
            except requests.RequestException as exc:
                show_api_error(exc)


def render_profile_page() -> None:
    st.subheader("个人档案")
    st.write("所有个人信息都在这里统一编辑。八字排盘、解读和追问页面只读取这里保存的数据。")
    st.info("这些信息只保存在本地 `data/profile.json`。不想长期保存的敏感信息不要填写。")

    profile = get_profile()
    saved_date = date(
        int(profile["birth_year"] or 2005),
        int(profile["birth_month"] or 1),
        int(profile["birth_day"] or 1),
    )
    saved_time = time(int(profile["birth_hour"] or 12), int(profile.get("birth_minute") or 0))
    gender_reverse = {"male": "男", "female": "女", "unknown": "未指定"}
    gender_value = gender_reverse.get(str(profile.get("gender") or "unknown"), "未指定")

    with st.form("profile_form"):
        st.markdown("#### 基础偏好")
        nickname = st.text_input("称呼", value=str(profile.get("nickname") or ""))
        focus_areas = st.text_area("关注方向", value=str(profile.get("focus_areas") or ""))
        current_goals = st.text_area("当前目标", value=str(profile.get("current_goals") or ""))
        communication_style = st.text_area(
            "希望 Firefly 怎样和你说话",
            value=str(profile.get("communication_style") or DEFAULT_PROFILE["communication_style"]),
        )
        notes = st.text_area("补充说明", value=str(profile.get("notes") or ""))

        st.markdown("#### 出生信息")
        col1, col2, col3 = st.columns(3)
        with col1:
            gender_label = st.selectbox("性别", ["未指定", "男", "女"], index=["未指定", "男", "女"].index(gender_value))
            calendar_label = st.selectbox("历法", ["公历"], index=0)
        with col2:
            birth_date = st.date_input(
                "出生日期",
                value=saved_date,
                min_value=date(1900, 1, 1),
                max_value=date(2100, 12, 31),
            )
            birth_time = st.time_input("出生时间", value=saved_time)
        with col3:
            birth_place = st.text_input("出生地，可选", value=str(profile.get("birth_place") or ""))
            use_true_solar_time = st.checkbox(
                "使用真太阳时",
                value=bool(profile.get("use_true_solar_time")),
                help="第一阶段暂不启用真太阳时校正；当前仅保存这个偏好。",
            )
        bazi_note = st.text_area(
            "命理分析备注",
            value=str(profile.get("bazi_note") or ""),
            placeholder="例如：想重点看学习、项目、状态管理",
        )

        submitted = st.form_submit_button("保存个人档案", type="primary")

    if submitted:
        gender_map = {"男": "male", "女": "female", "未指定": "unknown"}
        try:
            save_profile(
                {
                    "nickname": nickname,
                    "focus_areas": focus_areas,
                    "current_goals": current_goals,
                    "communication_style": communication_style,
                    "notes": notes,
                    "gender": gender_map[gender_label],
                    "calendar_type": "solar" if calendar_label == "公历" else "solar",
                    "birth_year": birth_date.year,
                    "birth_month": birth_date.month,
                    "birth_day": birth_date.day,
                    "birth_hour": birth_time.hour,
                    "birth_minute": birth_time.minute,
                    "birth_place": birth_place or None,
                    "use_true_solar_time": use_true_solar_time,
                    "bazi_note": bazi_note or None,
                    "birth_info": "",
                }
            )
            st.success("个人档案已保存。八字页面会自动使用这份信息。")
        except requests.RequestException as exc:
            show_api_error(exc)


def render_legacy_page() -> None:
    st.subheader("Legacy：塔罗 / 易经 / 每日运势")
    st.caption("旧功能仍然保留，但当前主线已经切换为八字排盘与解读。")

    tabs = st.tabs(["每日运势", "塔罗", "易经"])
    with tabs[0]:
        if st.button("生成今日运势", type="primary"):
            with st.spinner("正在点亮今日星图..."):
                try:
                    response = requests.get(f"{API_BASE}/fortune/daily", timeout=120)
                    response.raise_for_status()
                    data = response.json()
                    st.json(data["seed"])
                    render_answer(data["answer"])
                except requests.RequestException as exc:
                    show_api_error(exc)

    with tabs[1]:
        question = st.text_area("塔罗问题", placeholder="例如：我接下来该怎样推进这个项目？")
        spread_label = st.selectbox(
            "牌阵",
            ["三牌：过去 / 现在 / 未来", "单牌：今日提示", "五牌：现状 / 阻碍 / 隐藏影响 / 建议 / 结果趋势"],
        )
        spread_map = {
            "单牌：今日提示": "single",
            "三牌：过去 / 现在 / 未来": "three",
            "五牌：现状 / 阻碍 / 隐藏影响 / 建议 / 结果趋势": "five",
        }
        if st.button("抽牌", type="primary"):
            if not question.strip():
                st.warning("请先写下你的问题。")
            else:
                with st.spinner("正在洗牌..."):
                    try:
                        data = post_json(
                            "/fortune/tarot",
                            {"question": question, "spread": spread_map[spread_label]},
                            timeout=120,
                        )
                        for card in data["cards"]:
                            st.write(f"{card['position']}：{card['card']}（{card['orientation']}）")
                            st.caption(card["meaning"])
                        render_answer(data["answer"])
                    except requests.RequestException as exc:
                        show_api_error(exc)

    with tabs[2]:
        question = st.text_area("易经问题", placeholder="例如：当前局势下，我应该先稳住哪里？")
        if st.button("起卦", type="primary"):
            if not question.strip():
                st.warning("请先写下你的问题。")
            else:
                with st.spinner("正在起卦..."):
                    try:
                        data = post_json("/fortune/yijing", {"question": question}, timeout=120)
                        gua = data["gua"]
                        st.write(f"六爻：{gua['lines']}")
                        st.write(f"动爻：{gua['moving_lines'] or '无'}")
                        st.write(f"本卦：{gua['main_hexagram']['name']} - {gua['main_hexagram']['meaning']}")
                        st.write(f"变卦：{gua['changed_hexagram']['name']} - {gua['changed_hexagram']['meaning']}")
                        render_answer(data["answer"])
                    except requests.RequestException as exc:
                        show_api_error(exc)


page = st.sidebar.radio(
    "模式选择",
    ["八字排盘", "八字解读", "八字追问", "个人档案", "Legacy：塔罗 / 易经 / 每日运势"],
)

if page == "八字排盘":
    render_bazi_chart_page()
elif page == "八字解读":
    render_bazi_analyze_page()
elif page == "八字追问":
    render_bazi_ask_page()
elif page == "个人档案":
    render_profile_page()
else:
    render_legacy_page()
