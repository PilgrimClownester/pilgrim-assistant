import { useEffect, useMemo, useState } from 'react';
import { createTodo, getDailyBrief, getProfile, getSavedDailyFortune, getSchedule, getTodos, getWeeklySummary, saveReflection } from '../../api/client';
import type { DailyFortuneResult } from '../../api/client';
import type { DailyBrief, DailyBriefTarget, ReflectionItem, ScheduleEvent, TodoItem, UserProfile, WeeklySummary } from '../../types';
import AppIcon from '../shared/AppIcon';
import './HomeDashboard.css';

type HomeTarget = 'chat' | 'inbox' | 'projects' | 'review' | 'todo' | 'schedule' | 'growth' | 'tools';

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function HomeDashboard({ onNavigate, onStartFocus }: {
  onNavigate: (page: HomeTarget) => void;
  onStartFocus: (title: string) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [daily, setDaily] = useState<DailyFortuneResult | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [reviewOpen, setReviewOpen] = useState(() => new Date().getHours() >= 18);
  const [review, setReview] = useState({ win: '', challenge: '', tomorrow: '', mood: 'steady' as ReflectionItem['mood'] });
  const [reviewSaved, setReviewSaved] = useState(false);
  const [addTomorrowTodo, setAddTomorrowTodo] = useState(true);
  const [reminders, setReminders] = useState(() => window.localStorage.getItem('firefly:reminders-enabled') === 'true');
  const [loading, setLoading] = useState(true);

  const loadBrief = () => {
    const now = new Date();
    return getDailyBrief(localToday(), now.getHours(), now.getMinutes())
      .then((data) => setBrief(data as DailyBrief));
  };

  const load = async () => {
    const [todoData, scheduleData] = await Promise.allSettled([getTodos(), getSchedule()]);
    if (todoData.status === 'fulfilled') setTodos((todoData.value as { items: TodoItem[] }).items);
    if (scheduleData.status === 'fulfilled') setSchedule((scheduleData.value as { items: ScheduleEvent[] }).items);
    setLoading(false);
    void getProfile().then((data) => setProfile(data as UserProfile)).catch(() => {});
    void getSavedDailyFortune().then((data) => setDaily(data.result)).catch(() => {});
    void getWeeklySummary().then((data) => setWeekly(data as WeeklySummary)).catch(() => {});
    void loadBrief().catch(() => {});
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  useEffect(() => {
    const useCache = (event: Event) => {
      const detail = (event as CustomEvent<{ todos: TodoItem[]; schedule: ScheduleEvent[] }>).detail;
      setTodos(detail.todos);
      setSchedule(detail.schedule);
      void loadBrief().catch(() => {});
    };
    window.addEventListener('firefly:productivity-cache', useCache);
    return () => window.removeEventListener('firefly:productivity-cache', useCache);
  }, []);

  useEffect(() => {
    const refreshWeekly = () => getWeeklySummary().then((data) => setWeekly(data as WeeklySummary)).catch(() => {});
    window.addEventListener('firefly:focus-updated', refreshWeekly);
    return () => window.removeEventListener('firefly:focus-updated', refreshWeekly);
  }, []);

  const today = localToday();
  const view = useMemo(() => {
    const active = todos.filter((item) => !item.done).sort((a,b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority] || (a.due_date || '9999').localeCompare(b.due_date || '9999')));
    const todayEvents = schedule.filter((item) => item.date === today).sort((a,b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99'));
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const next = todayEvents.find((item) => !item.done && timeMinutes(item.start_time) >= now) || todayEvents.find((item) => !item.done);
    const overdue = active.filter((item) => item.due_date && item.due_date < today);
    const todayTodos = todos.filter((item) => item.due_date === today);
    const todayActiveTodos = todayTodos.filter((item) => !item.done);
    const total = todayEvents.length + todayTodos.length;
    const done = todayEvents.filter((item) => item.done).length + todayTodos.filter((item) => item.done).length;
    return { active, todayEvents, todayTodos, todayActiveTodos, next, overdue, total, done, progress: total ? Math.round(done / total * 100) : 0 };
  }, [schedule, today, todos]);

  const seed = daily?.seed;
  const greeting = getGreeting(profile?.nickname || '');

  const toggleReminders = async () => {
    let enabled = !reminders;
    if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
      enabled = await Notification.requestPermission() === 'granted';
    }
    setReminders(enabled);
    window.localStorage.setItem('firefly:reminders-enabled', String(enabled));
    window.dispatchEvent(new CustomEvent('firefly:reminders-changed', { detail: enabled }));
  };

  const submitReview = async () => {
    if (!review.win.trim() && !review.challenge.trim() && !review.tomorrow.trim()) return;
    await saveReflection({ ...review, date: today });
    if (addTomorrowTodo && review.tomorrow.trim()) {
      const tomorrow = shiftLocalDate(today, 1);
      const alreadyExists = todos.some((item) => !item.done && item.title === review.tomorrow.trim() && item.due_date === tomorrow);
      if (!alreadyExists) {
        const data = await createTodo({ title: review.tomorrow.trim(), priority: 'medium', due_date: tomorrow, notes: '来自晚间复盘' }) as { item: TodoItem };
        setTodos((current) => [...current, data.item]);
      }
    }
    setReviewSaved(true);
    setTimeout(() => setReviewSaved(false), 2200);
    getWeeklySummary().then((data) => setWeekly(data as WeeklySummary)).catch(() => {});
    void loadBrief().catch(() => {});
  };

  const openBriefTarget = (target: DailyBriefTarget) => {
    if (target !== 'home') onNavigate(target);
    else {
      setReviewOpen(true);
      window.requestAnimationFrame(() => document.querySelector('.home-review-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  };

  if (loading) return <div className="home-loading">正在把今天整理好…</div>;

  return (
    <main className="home-dashboard">
      <header className="home-header">
        <div className="home-header-copy">
          <span className="home-eyebrow">FIREFLY · DAILY LETTER</span>
          <h2>{greeting}</h2>
          <p className="home-date-line"><span>{formatFullDate()}</span><span className="home-date-note">今天只需要把最重要的事往前推一点。</span></p>
        </div>
        <div className="home-header-actions">
          <button className={`home-reminder-toggle${reminders ? ' is-on' : ''}`} onClick={toggleReminders}><i /><span>{reminders ? '提醒已开启' : '开启智能提醒'}</span></button>
        </div>
      </header>

      <section className="home-workspace-strip" aria-label="Firefly 工作台">
        <button onClick={() => onNavigate('inbox')}><i><AppIcon name="inbox" /></i><span><strong>快速收纳</strong><small>一句话，确认后归位</small></span><b>→</b></button>
        <button onClick={() => onNavigate('projects')}><i><AppIcon name="projects" /></i><span><strong>项目驾驶舱</strong><small>看进度、风险与下一步</small></span><b>→</b></button>
        <button onClick={() => onNavigate('review')}><i><AppIcon name="review" /></i><span><strong>每周复盘</strong><small>回看足迹，安排下周</small></span><b>→</b></button>
      </section>

      <section className="home-hero-grid">
        <article className="home-mainline-card">
          <div className="home-mainline-top"><span>今日萤火</span><small>{brief ? `${periodLabel(brief.period)} · 私密整理` : '正在整理'}</small></div>
          <div className="home-brief-copy">
            <span className="home-mainline-mark">✦</span>
            <div><h3>{brief?.title || '把今天照亮一点'}</h3><p>{brief?.summary || 'Firefly 正在从你的日程与记录中整理今天。'}</p></div>
          </div>
          {brief?.lead && <div className="home-brief-lead"><small>此刻主线</small><strong>{brief.lead.title}</strong><p>{brief.lead.detail}</p></div>}
          {!!brief?.signals.length && <div className="home-brief-signals">{brief.signals.map((signal) => <button key={`${signal.kind}-${signal.title}`} className={`is-${signal.tone}`} onClick={() => openBriefTarget(signal.target)}><span>{signal.title}</span><small>{signal.detail}</small></button>)}</div>}
          {brief?.memory_echo && <div className="home-memory-echo"><span>来自长期记忆</span><p>{brief.memory_echo.content}</p></div>}
          <div className="home-mainline-actions"><button onClick={() => brief?.lead ? (brief.lead.source === 'todo' ? onStartFocus(brief.lead.title) : onNavigate('schedule')) : onNavigate('todo')} className="is-primary">{brief?.lead ? (brief.lead.source === 'todo' ? '开始专注' : '查看日程') : '添加任务'}<b>→</b></button><button onClick={() => onNavigate('chat')}>和流萤聊聊</button></div>
        </article>

        <button className="home-fortune-card" onClick={() => onNavigate('tools')}>
          <div className="home-fortune-heading"><span>每日线索</span><small>完整解读 →</small></div>
          <div className="home-fortune-content"><div className="home-energy-ring" style={{ '--home-daily-energy': `${Number(seed?.energy || 0) * 3.6}deg` } as React.CSSProperties}><span>{seed?.energy || '—'}</span></div><div><small>今日关键词</small><strong>{seed?.keyword || '等待展开'}</strong><p>{seed?.focus || '去每日占卜看看今天的方向。'}</p></div></div>
        </button>
      </section>

      <section className="home-metrics">
        <article><span>今日进度</span><strong>{view.progress}%</strong><div><i style={{ width: `${view.progress}%` }} /></div></article>
        <article><span>待推进</span><strong>{view.active.length}</strong><small>项任务</small></article>
        <article className={view.overdue.length ? 'is-warning' : ''}><span>已经逾期</span><strong>{view.overdue.length}</strong><small>{view.overdue.length ? '项需要重新安排' : '目前没有积压'}</small></article>
        <article><span>本周专注</span><strong>{weekly?.focus_minutes || 0}</strong><small>分钟</small></article>
      </section>

      <section className="home-flow-grid">
          <article className="home-flow-card">
          <header><div><span>NEXT UP</span><h3>今天的节奏</h3></div><button onClick={() => onNavigate('schedule')}>打开日程</button></header>
          {view.todayEvents.length ? <div className="home-agenda">{view.todayEvents.slice(0,4).map((item) => <div key={item.id} className={item.done ? 'is-done' : ''}><time>{item.start_time || '未定'}</time><i /><span><strong>{item.title}</strong><small>{item.end_time ? `至 ${item.end_time}` : '灵活安排'}</small></span>{item === view.next && <em>下一项</em>}</div>)}</div> : <EmptyLine text="今天还没有日程，给主线留一段完整时间。" />}
        </article>
          <article className="home-flow-card">
          <header><div><span>FOCUS LIST</span><h3>接下来要做</h3></div><button onClick={() => onNavigate('todo')}>全部任务</button></header>
          {view.todayActiveTodos.length ? <div className="home-task-list">{view.todayActiveTodos.slice(0,4).map((item,index) => <button key={item.id} onClick={() => onStartFocus(item.title)}><i>{String(index + 1).padStart(2,'0')}</i><span><strong>{item.title}</strong><small>今天到期</small></span><b>专注</b></button>)}</div> : <EmptyLine text="今天没有待办，可以从容安排。" />}
        </article>
      </section>

      <section className="home-today-metrics" aria-label="今日概览">
        <article><span>完成</span><strong>{view.done}</strong><small>共 {view.total}</small></article>
        <article><span>进度</span><strong>{view.progress}%</strong><div><i style={{ width: `${view.progress}%` }} /></div></article>
      </section>

      <section className="home-focus-launcher">
        <div className="home-focus-icon"><span>25</span><small>min</small></div>
        <div className="home-focus-copy"><span>LOCAL POMODORO</span><h3>番茄钟</h3><p>专注计时只保存在这台电脑上。</p></div>
        <button onClick={() => onStartFocus(view.todayActiveTodos[0]?.title || view.next?.title || '自由专注')}>开始专注 <b>→</b></button>
      </section>

      <section className="home-insight-grid">
        <article className="home-weekly-card">
          <header><div><span>LAST 7 DAYS</span><h3>这一周的足迹</h3></div><p>{weekly?.completed || 0} 件完成 · {weekly?.reflection_days || 0} 天复盘</p></header>
          <div className="home-week-bars">{(weekly?.days || []).map((day) => { const height = Math.max(8, Math.min(100, day.completed * 22 + day.focus_minutes / 3)); return <div key={day.date}><span><i style={{ height: `${height}%` }} /></span><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString('zh-CN',{weekday:'short'}).replace('周','')}</small></div>; })}</div>
          <p className="home-week-note">{getWeeklyNote(weekly)}</p>
        </article>
        <article className={`home-review-card${reviewOpen ? ' is-open' : ''}`}>
          <header><div><span>EVENING REVIEW</span><h3>把今天轻轻收好</h3></div><button onClick={() => setReviewOpen((value) => !value)}>{reviewOpen ? '收起' : '开始复盘'}</button></header>
          {reviewOpen ? <div className="home-review-form"><div className="home-moods">{([['bright','明亮'],['steady','平稳'],['tired','疲惫'],['heavy','沉重']] as const).map(([value,label]) => <button key={value} className={review.mood === value ? 'is-active' : ''} onClick={() => setReview((current) => ({ ...current, mood: value }))}>{label}</button>)}</div><label><span>今天完成了什么？</span><input value={review.win} onChange={(event) => setReview((current) => ({ ...current, win: event.target.value }))} /></label><label><span>哪件事最消耗你？</span><input value={review.challenge} onChange={(event) => setReview((current) => ({ ...current, challenge: event.target.value }))} /></label><label><span>明天最想推进什么？</span><input value={review.tomorrow} onChange={(event) => setReview((current) => ({ ...current, tomorrow: event.target.value }))} /></label><label className="home-review-todo"><input type="checkbox" checked={addTomorrowTodo} onChange={(event) => setAddTomorrowTodo(event.target.checked)} /><span>同时加入明日任务</span></label><button className="home-save-review" onClick={submitReview}>{reviewSaved ? '已经收好今天' : '保存今天的复盘'}</button></div> : <p>三句话就够了：完成、消耗、明天。</p>}
        </article>
      </section>

      <button className="home-chat-entry" onClick={() => onNavigate('chat')}><span>想聊聊，或者让流萤帮你安排任务？</span><strong>进入独立对话 →</strong></button>
    </main>
  );
}

function EmptyLine({ text }: { text: string }) { return <div className="home-empty-line"><span>✦</span><p>{text}</p></div>; }
function timeMinutes(value: string) { if (!value) return Number.MAX_SAFE_INTEGER; const [h,m] = value.split(':').map(Number); return h * 60 + m; }
function getGreeting(name: string) { const hour = new Date().getHours(); const prefix = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'; return `${prefix}${name ? `，${name}` : ''}`; }
function formatFullDate() { return new Intl.DateTimeFormat('zh-CN', { month:'long',day:'numeric',weekday:'long' }).format(new Date()); }
function periodLabel(period: DailyBrief['period']) { return { morning: '晨间', afternoon: '午后', evening: '晚间' }[period]; }
function getWeeklyNote(weekly: WeeklySummary | null) { if (!weekly) return '从今天开始，留下属于自己的节奏。'; if (weekly.focus_minutes >= 180) return '这一周投入得很扎实，也别忘了给恢复留时间。'; if (weekly.completed >= 5) return '你已经推动了不少事情，下一步是守住稳定节奏。'; return '不用追赶数字，先让每一天都有一个真实的小进展。'; }
function shiftLocalDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }

export default HomeDashboard;
