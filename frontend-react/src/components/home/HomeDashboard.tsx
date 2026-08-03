import { useEffect, useMemo, useState } from 'react';
import { createTodo, getProfile, getSavedDailyFortune, getSchedule, getTodos, getWeeklySummary, saveReflection } from '../../api/client';
import type { DailyFortuneResult } from '../../api/client';
import type { ReflectionItem, ScheduleEvent, TodoItem, UserProfile, WeeklySummary } from '../../types';
import AppIcon from '../shared/AppIcon';
import EdgeAILearning from './EdgeAILearning';
import './HomeDashboard.css';

type HomeTarget = 'chat' | 'inbox' | 'projects' | 'review' | 'todo' | 'schedule' | 'tools';

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function HomeDashboard({ onNavigate, onStartFocus }: {
  onNavigate: (page: HomeTarget) => void;
  onStartFocus: (title: string) => void;
}) {
  const isMobile = useMobileHome();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [daily, setDaily] = useState<DailyFortuneResult | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [reviewOpen, setReviewOpen] = useState(() => new Date().getHours() >= 18);
  const [review, setReview] = useState({ win: '', challenge: '', tomorrow: '', mood: 'steady' as ReflectionItem['mood'] });
  const [reviewSaved, setReviewSaved] = useState(false);
  const [addTomorrowTodo, setAddTomorrowTodo] = useState(true);
  const [reminders, setReminders] = useState(() => window.localStorage.getItem('firefly:reminders-enabled') === 'true');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [todoData, scheduleData] = await Promise.allSettled([getTodos(), getSchedule()]);
    if (todoData.status === 'fulfilled') setTodos((todoData.value as { items: TodoItem[] }).items);
    if (scheduleData.status === 'fulfilled') setSchedule((scheduleData.value as { items: ScheduleEvent[] }).items);
    setLoading(false);
    void getProfile().then((data) => setProfile(data as UserProfile)).catch(() => {});
    void getSavedDailyFortune().then((data) => setDaily(data.result)).catch(() => {});
    void getWeeklySummary().then((data) => setWeekly(data as WeeklySummary)).catch(() => {});
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  useEffect(() => {
    const useCache = (event: Event) => {
      const detail = (event as CustomEvent<{ todos: TodoItem[]; schedule: ScheduleEvent[] }>).detail;
      setTodos(detail.todos);
      setSchedule(detail.schedule);
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
    return { active, lead: active[0], todayEvents, todayTodos, todayActiveTodos, next, overdue, total, done, progress: total ? Math.round(done / total * 100) : 0 };
  }, [schedule, today, todos]);

  const seed = daily?.seed;
  const greeting = getGreeting(isMobile ? '' : profile?.nickname || '', isMobile);

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
  };

  if (loading) return <div className="home-loading">正在把今天整理好…</div>;

  return (
    <main className="home-dashboard">
      <header className="home-header">
        <div className="home-header-copy">
          <span className="home-eyebrow">YOUR DAY WITH FIREFLY</span>
          <h2>{greeting}</h2>
          <p className="home-date-line"><span>{formatFullDate(isMobile)}</span><span className="home-date-note">{isMobile ? 'One step is enough today.' : '今天只需要把最重要的事往前推一点。'}</span></p>
        </div>
        <div className="home-header-actions">
          <button className="home-mobile-fortune" onClick={() => onNavigate('tools')} aria-label="打开每日线索">
            <small>✦ DAILY SIGNAL</small>
            <div><strong>{seed?.energy || '—'}</strong><span>{translateDailyKeyword(seed?.keyword)}</span></div>
          </button>
          <button className={`home-reminder-toggle${reminders ? ' is-on' : ''}`} onClick={toggleReminders}><i /><span>{isMobile ? (reminders ? 'Reminders on' : 'Enable alerts') : (reminders ? '提醒已开启' : '开启智能提醒')}</span></button>
        </div>
        <img className="home-mobile-firefly" src="./assets/firefly-catlie.png" alt="Firefly" />
      </header>

      <section className="home-workspace-strip" aria-label="Firefly 工作台">
        <button onClick={() => onNavigate('inbox')}><i><AppIcon name="inbox" /></i><span><strong>快速收纳</strong><small>一句话，确认后归位</small></span><b>→</b></button>
        <button onClick={() => onNavigate('projects')}><i><AppIcon name="projects" /></i><span><strong>项目驾驶舱</strong><small>看进度、风险与下一步</small></span><b>→</b></button>
        <button onClick={() => onNavigate('review')}><i><AppIcon name="review" /></i><span><strong>每周复盘</strong><small>回看足迹，安排下周</small></span><b>→</b></button>
      </section>

      <EdgeAILearning />

      <section className="home-hero-grid">
        <article className="home-mainline-card">
          <div className="home-mainline-top"><span>今日主线</span><small>{view.lead?.priority === 'high' ? '重要任务' : '从一件事开始'}</small></div>
          <div className="home-mainline-copy">
            <span className="home-mainline-mark">{view.lead ? '01' : '✓'}</span>
            <div><h3>{view.lead?.title || '今天没有未完成任务'}</h3><p>{view.lead?.notes || (view.lead?.due_date ? `截止 ${view.lead.due_date}` : '先选择一件真正值得投入注意力的事。')}</p></div>
          </div>
          <div className="home-mainline-actions"><button onClick={() => view.lead ? onStartFocus(view.lead.title) : onNavigate('todo')} className="is-primary">{view.lead ? '开始专注' : '添加任务'}<b>→</b></button><button onClick={() => onNavigate('todo')}>查看清单</button></div>
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
          <header><div><span>NEXT UP</span><h3>{isMobile ? "Today's Schedule" : '今天的节奏'}</h3></div><button onClick={() => onNavigate('schedule')}>{isMobile ? 'View all' : '打开日程'}</button></header>
          {view.todayEvents.length ? <div className="home-agenda">{view.todayEvents.slice(0,4).map((item) => <div key={item.id} className={item.done ? 'is-done' : ''}><time>{item.start_time || (isMobile ? 'Anytime' : '未定')}</time><i /><span><strong>{item.title}</strong><small>{item.end_time ? `${isMobile ? 'Until' : '至'} ${item.end_time}` : (isMobile ? 'Flexible' : '灵活安排')}</small></span>{item === view.next && <em>{isMobile ? 'Next' : '下一项'}</em>}</div>)}</div> : <EmptyLine text={isMobile ? 'No events yet. Keep a clear block for what matters.' : '今天还没有日程，给主线留一段完整时间。'} />}
        </article>
        <article className="home-flow-card">
          <header><div><span>FOCUS LIST</span><h3>{isMobile ? "Today's Tasks" : '接下来要做'}</h3></div><button onClick={() => onNavigate('todo')}>{isMobile ? 'View all' : '全部任务'}</button></header>
          {view.todayActiveTodos.length ? <div className="home-task-list">{view.todayActiveTodos.slice(0,4).map((item,index) => <button key={item.id} onClick={() => onStartFocus(item.title)}><i>{String(index + 1).padStart(2,'0')}</i><span><strong>{item.title}</strong><small>{isMobile ? 'Due today' : '今天到期'}</small></span><b>{isMobile ? 'Focus' : '专注'}</b></button>)}</div> : <EmptyLine text={isMobile ? 'Nothing due today. Make room for yourself.' : '今天没有待办，可以从容安排。'} />}
        </article>
      </section>

      <section className="home-today-metrics" aria-label="今日概览">
        <article><span>Completed</span><strong>{view.done}</strong><small>of {view.total}</small></article>
        <article><span>Progress</span><strong>{view.progress}%</strong><div><i style={{ width: `${view.progress}%` }} /></div></article>
      </section>

      <section className="home-focus-launcher">
        <div className="home-focus-icon"><span>25</span><small>min</small></div>
        <div className="home-focus-copy"><span>LOCAL POMODORO</span><h3>{isMobile ? 'Focus Timer' : '番茄钟'}</h3><p>{isMobile ? 'Runs only on this device.' : '只在当前设备计时，手机和电脑互不打断。'}</p></div>
        <button onClick={() => onStartFocus(view.todayActiveTodos[0]?.title || view.next?.title || (isMobile ? 'Free Focus' : '自由专注'))}>{isMobile ? 'Start' : '开始专注'} <b>→</b></button>
      </section>

      <section className="home-insight-grid">
        <article className="home-weekly-card">
          <header><div><span>LAST 7 DAYS</span><h3>这一周的足迹</h3></div><p>{weekly?.completed || 0} 件完成 · {weekly?.reflection_days || 0} 天复盘</p></header>
          <div className="home-week-bars">{(weekly?.days || []).map((day) => { const height = Math.max(8, Math.min(100, day.completed * 22 + day.focus_minutes / 3)); return <div key={day.date}><span><i style={{ height: `${height}%` }} /></span><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString('zh-CN',{weekday:'short'}).replace('周','')}</small></div>; })}</div>
          <p className="home-week-note">{getWeeklyNote(weekly)}</p>
        </article>
        <article className={`home-review-card${reviewOpen ? ' is-open' : ''}`}>
          <header><div><span>EVENING REVIEW</span><h3>{isMobile ? 'Close the day gently' : '把今天轻轻收好'}</h3></div><button onClick={() => setReviewOpen((value) => !value)}>{isMobile ? (reviewOpen ? 'Collapse' : 'Reflect') : (reviewOpen ? '收起' : '开始复盘')}</button></header>
          {reviewOpen ? <div className="home-review-form"><div className="home-moods">{([['bright',isMobile ? 'Bright' : '明亮'],['steady',isMobile ? 'Steady' : '平稳'],['tired',isMobile ? 'Tired' : '疲惫'],['heavy',isMobile ? 'Heavy' : '沉重']] as const).map(([value,label]) => <button key={value} className={review.mood === value ? 'is-active' : ''} onClick={() => setReview((current) => ({ ...current, mood: value }))}>{label}</button>)}</div><label><span>{isMobile ? 'What did you finish today?' : '今天完成了什么？'}</span><input value={review.win} onChange={(event) => setReview((current) => ({ ...current, win: event.target.value }))} /></label><label><span>{isMobile ? 'What drained you most?' : '哪件事最消耗你？'}</span><input value={review.challenge} onChange={(event) => setReview((current) => ({ ...current, challenge: event.target.value }))} /></label><label><span>{isMobile ? 'What matters most tomorrow?' : '明天最想推进什么？'}</span><input value={review.tomorrow} onChange={(event) => setReview((current) => ({ ...current, tomorrow: event.target.value }))} /></label><label className="home-review-todo"><input type="checkbox" checked={addTomorrowTodo} onChange={(event) => setAddTomorrowTodo(event.target.checked)} /><span>{isMobile ? 'Add it to tomorrow’s tasks' : '同时加入明日任务'}</span></label><button className="home-save-review" onClick={submitReview}>{isMobile ? (reviewSaved ? 'Day saved' : 'Save reflection') : (reviewSaved ? '已经收好今天' : '保存今天的复盘')}</button></div> : <p>{isMobile ? 'Three lines are enough: progress, friction, tomorrow.' : '三句话就够了：完成、消耗、明天。'}</p>}
        </article>
      </section>

      <button className="home-chat-entry" onClick={() => onNavigate('chat')}><span>{isMobile ? 'Want to talk, plan, or clear your head?' : '想聊聊，或者让流萤帮你安排任务？'}</span><strong>{isMobile ? 'Open chat →' : '进入独立对话 →'}</strong></button>
    </main>
  );
}

function EmptyLine({ text }: { text: string }) { return <div className="home-empty-line"><span>✦</span><p>{text}</p></div>; }
function timeMinutes(value: string) { if (!value) return Number.MAX_SAFE_INTEGER; const [h,m] = value.split(':').map(Number); return h * 60 + m; }
function useMobileHome() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}
function getGreeting(name: string, english = false) { const hour = new Date().getHours(); const prefix = english ? (hour < 11 ? 'Good morning' : hour < 14 ? 'Good afternoon' : hour < 18 ? 'Good afternoon' : 'Good evening') : (hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'); return `${prefix}${name ? `${english ? ', ' : '，'}${name}` : ''}`; }
function formatFullDate(english = false) { return new Intl.DateTimeFormat(english ? 'en-US' : 'zh-CN', english ? { month:'long',day:'numeric',weekday:'long' } : {month:'long',day:'numeric',weekday:'long'}).format(new Date()); }
function translateDailyKeyword(value: unknown) {
  const translations: Record<string, string> = {
    '稳住节奏': 'Steady', '重整装备': 'Reset', '向前一步': 'Forward',
    '减少内耗': 'Inner Calm', '清理战场': 'Clear Space', '等待窗口': 'Right Timing',
    '集中火力': 'Focus', '修复系统': 'Restore', '保持航线': 'Stay Course',
    '点亮星图': 'Illuminate', '低噪声推进': 'Quiet Flow', '完成闭环': 'Complete',
  };
  return translations[String(value || '')] || 'Open Signal';
}
function getWeeklyNote(weekly: WeeklySummary | null) { if (!weekly) return '从今天开始，留下属于自己的节奏。'; if (weekly.focus_minutes >= 180) return '这一周投入得很扎实，也别忘了给恢复留时间。'; if (weekly.completed >= 5) return '你已经推动了不少事情，下一步是守住稳定节奏。'; return '不用追赶数字，先让每一天都有一个真实的小进展。'; }
function shiftLocalDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }

export default HomeDashboard;
