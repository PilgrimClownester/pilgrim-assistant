import { useEffect, useMemo, useRef, useState } from 'react';
import { createScheduleEvent, deleteScheduleEvent, getSchedule, getTodos, updateScheduleEvent } from '../../api/client';
import type { ScheduleEvent, TodoItem } from '../../types';
import './ScheduleView.css';

const categoryMeta = {
  study: { label: '学习', mark: '学' },
  project: { label: '项目', mark: '项' },
  life: { label: '生活', mark: '生' },
  deadline: { label: '截止', mark: '限' },
  other: { label: '其他', mark: '·' },
};

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function monthKey(value: string) { return value.slice(0, 7); }

function ScheduleView({ onStartFocus }: { onStartFocus?: (title: string) => void }) {
  const initialDate = localToday();
  const [items, setItems] = useState<ScheduleEvent[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(monthKey(initialDate));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [category, setCategory] = useState<ScheduleEvent['category']>('study');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dataVersion = useRef(0);

  useEffect(() => {
    let mounted = true;
    const load = (initial = false) => {
      const requestedAtVersion = dataVersion.current;
      return Promise.all([getSchedule(), getTodos()])
      .then(([scheduleData, todoData]) => {
        if (!mounted || requestedAtVersion !== dataVersion.current) return;
        setItems(normalizeSchedule((scheduleData as { items: ScheduleEvent[] }).items));
        setTodos((todoData as { items: TodoItem[] }).items);
        if (initial) setError('');
      })
      .catch((err) => { if (mounted && initial) setError(err instanceof Error ? err.message : '加载失败'); })
      .finally(() => { if (mounted && initial) setLoading(false); });
    };
    load(true);
    const timer = window.setInterval(() => load(), 12_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const useCache = (event: Event) => {
      if (!mounted) return;
      const detail = (event as CustomEvent<{ todos: TodoItem[]; schedule: ScheduleEvent[] }>).detail;
      setItems(normalizeSchedule(detail.schedule));
      setTodos(detail.todos);
      setLoading(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('firefly:productivity-cache', useCache);
    return () => { mounted = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('firefly:productivity-cache', useCache); };
  }, []);

  const grouped = useMemo(() => sortSchedule(items).reduce<Record<string, ScheduleEvent[]>>((acc, item) => {
    (acc[item.date] ||= []).push(item);
    return acc;
  }, {}), [items]);
  const selectedEvents = grouped[selectedDate] || [];
  const selectedTodos = useMemo(() => todos.filter((todo) => todo.due_date === selectedDate), [selectedDate, todos]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const todosByDate = useMemo(() => todos.reduce<Record<string, TodoItem[]>>((acc, todo) => {
    if (todo.due_date) (acc[todo.due_date] ||= []).push(todo);
    return acc;
  }, {}), [todos]);
  const dayStats = useMemo(() => getDayStats(selectedEvents), [selectedEvents]);

  const save = async () => {
    const cleanTitle = title.trim();
    if (submitting) return;
    if (!cleanTitle) {
      setError('请先填写日程标题。');
      return;
    }
    if (!date) {
      setError('请选择日程日期。');
      return;
    }
    const parsedRange = parseTimeRange(timeRange);
    if (timeRange.trim() && !parsedRange) {
      setError('时间段请填写成 18:00-20:00 这样的格式。');
      return;
    }
    const cleanStart = parsedRange?.start || startTime;
    const cleanEnd = parsedRange?.end || endTime;
    dataVersion.current += 1;
    setSubmitting(true);
    setError('');
    try {
      const payload = { title: cleanTitle, date, start_time: cleanStart, end_time: cleanEnd, category, notes: notes.trim() };
      const data = editingId
        ? await updateScheduleEvent(editingId, payload) as { item: ScheduleEvent }
        : await createScheduleEvent(payload) as { item: ScheduleEvent };
      setItems((current) => sortSchedule(editingId
        ? current.map((item) => item.id === editingId ? { ...data.item, done: Boolean(data.item.done) } : item)
        : [...current, { ...data.item, done: Boolean(data.item.done) }]));
      setSelectedDate(data.item.date);
      resetForm();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : editingId ? '保存失败' : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (event: ScheduleEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setDate(event.date);
    setStartTime(event.start_time || '');
    setEndTime(event.end_time || '');
    setTimeRange(event.start_time && event.end_time ? `${event.start_time}-${event.end_time}` : '');
    setCategory(event.category);
    setNotes(event.notes || '');
    setSelectedDate(event.date);
    setError('');
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setStartTime('');
    setEndTime('');
    setTimeRange('');
    setNotes('');
  };

  const toggleDone = async (event: ScheduleEvent) => {
    try {
      const data = await updateScheduleEvent(event.id, { done: !event.done }) as { item: ScheduleEvent };
      setItems((current) => sortSchedule(current.map((item) => item.id === event.id ? { ...data.item, done: Boolean(data.item.done) } : item)));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : '更新失败'); }
  };

  const remove = async (id: string) => {
    try {
      await deleteScheduleEvent(id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (editingId === id) resetForm();
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  };

  const moveDate = (offset: number) => {
    const value = new Date(`${selectedDate}T12:00:00`);
    value.setDate(value.getDate() + offset);
    const next = [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
    setSelectedDate(next);
    setDate(next);
    setCalendarMonth(monthKey(next));
  };

  return (
    <main className="schedule-page">
      <header className="schedule-header">
        <div>
          <span className="productivity-eyebrow">FIREFLY RHYTHM</span>
          <h2>日程节奏</h2>
          <p>把时间变成看得见的段落，也给空白留出位置。</p>
        </div>
        <div className="schedule-date-nav">
          <button onClick={() => moveDate(-1)} aria-label="前一天">‹</button>
          <label><small>正在查看</small><input value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setDate(event.target.value); setCalendarMonth(monthKey(event.target.value)); }} type="date" /></label>
          <button onClick={() => moveDate(1)} aria-label="后一天">›</button>
          <button className="schedule-calendar-button" onClick={() => setCalendarOpen(true)}><span>▦</span> 月历</button>
        </div>
      </header>

      <section className="schedule-day-hero">
        <div className="schedule-day-date"><span>{selectedDate.slice(5, 7)}月</span><strong>{selectedDate.slice(8, 10)}</strong><small>{friendlyDate(selectedDate)}</small></div>
        <div className="schedule-day-copy"><span>{selectedDate === localToday() ? 'TODAY' : 'DAY PLAN'}</span><h3>{dayStats.count ? `这一天有 ${dayStats.count} 段安排` : '这一天还很自由'}</h3><p>{dayStats.conflicts ? `发现 ${dayStats.conflicts} 处时间重叠，建议稍微调整。` : dayStats.count ? '时间段之间没有明显冲突，可以从容推进。' : '可以先放进一件真正重要的事。'}</p></div>
        <div className="schedule-day-metrics">
          <article><strong>{dayStats.hours}</strong><span>小时已安排</span></article>
          <article className={dayStats.conflicts ? 'is-warning' : ''}><strong>{dayStats.conflicts}</strong><span>处时间冲突</span></article>
          <article><strong>{selectedTodos.length}</strong><span>项待办到期</span></article>
        </div>
      </section>

      <section className={`schedule-compose${editingId ? ' is-editing' : ''}`}>
        <div className="schedule-compose-heading"><span>{editingId ? '✎' : '＋'}</span><div><small>{editingId ? '正在调整' : '添加一段时间'}</small><strong>{editingId ? '修改日程安排' : '今天想为哪件事留出位置？'}</strong></div></div>
        <input className="schedule-title-input" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} placeholder="日程标题" />
        <div className="schedule-compose-fields">
          <label><span>日期</span><input value={date} onChange={(event) => setDate(event.target.value)} type="date" /></label>
          <label><span>时间段</span><input value={timeRange} onChange={(event) => setTimeRange(event.target.value)} placeholder="18:00-20:00" /></label>
          <label><span>或分别选择</span><div><input value={startTime} onChange={(event) => setStartTime(event.target.value)} type="time" /><i>—</i><input value={endTime} onChange={(event) => setEndTime(event.target.value)} type="time" /></div></label>
          <label><span>类型</span><select value={category} onChange={(event) => setCategory(event.target.value as ScheduleEvent['category'])}>{(Object.keys(categoryMeta) as ScheduleEvent['category'][]).map((key) => <option key={key} value={key}>{categoryMeta[key].label}</option>)}</select></label>
        </div>
        <div className="schedule-compose-bottom">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="补充地点、准备事项或备注（可选）" />
          {editingId && <button className="schedule-cancel-button" onClick={resetForm}>取消</button>}
          <button type="button" className="schedule-save-button" onClick={save} disabled={submitting}>{submitting ? '保存中…' : editingId ? '保存修改' : '加入日程'}<b>→</b></button>
        </div>
        {error && <div className="schedule-compose-error" role="alert">{error}</div>}
      </section>

      <section className="schedule-timeline-card">
        <div className="schedule-timeline-head"><div><span>DAY FLOW</span><h3>{friendlyDate(selectedDate)}的时间线</h3></div><small>{dayStats.done} / {dayStats.count} 已完成</small></div>
        {error && <div className="productivity-error">{error}</div>}
        {loading && <div className="productivity-empty">正在整理日程…</div>}
        {!loading && selectedEvents.length === 0 && <div className="productivity-empty"><span>☀</span><strong>时间线还是空的</strong><p>未安排的时间，也可以用来休息和偶遇灵感。</p></div>}
        <div className="schedule-timeline">
          {selectedEvents.map((event, index) => (
            <article key={event.id} className={`schedule-event schedule-event--${event.category}${event.done ? ' is-done' : ''}`}>
              <div className="schedule-event-time"><strong>{event.start_time || '未定'}</strong><span>{event.end_time ? `至 ${event.end_time}` : '灵活安排'}</span></div>
              <div className="schedule-rail"><i /><span>{index < selectedEvents.length - 1 ? '' : 'end'}</span></div>
              <div className="schedule-event-card">
                <div className="schedule-event-main"><span className="schedule-category-mark">{categoryMeta[event.category].mark}</span><div><small>{categoryMeta[event.category].label}{event.done ? ' · 已完成' : ''}</small><h4>{event.title}</h4>{event.notes && <p>{event.notes}</p>}</div></div>
                <div className="schedule-event-actions">{!event.done && <button className="is-focus" onClick={() => onStartFocus?.(event.title)}>专注</button>}<button className="is-complete" onClick={() => toggleDone(event)}>{event.done ? '恢复' : '完成'}</button><button onClick={() => startEdit(event)}>编辑</button><button className="is-delete" onClick={() => remove(event.id)} aria-label={`删除 ${event.title}`}>×</button></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {calendarOpen && (
        <div className="calendar-backdrop" onMouseDown={() => setCalendarOpen(false)}>
          <aside className="calendar-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="productivity-eyebrow">MONTH VIEW</span><h3>月历</h3><p>日程与待办截止日期放在一起看。</p></div><button onClick={() => setCalendarOpen(false)}>×</button></header>
            <div className="calendar-toolbar"><button onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}>‹ 上月</button><input value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} type="month" /><button onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}>下月 ›</button></div>
            <div className="calendar-weekdays">{['一','二','三','四','五','六','日'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {calendarDays.map((day) => {
                const dayEvents = grouped[day.iso] || [];
                const dayTodos = todosByDate[day.iso] || [];
                return <button key={day.iso} className={`${day.inMonth ? '' : 'is-outside'}${day.iso === selectedDate ? ' is-selected' : ''}${day.iso === localToday() ? ' is-today' : ''}`} onClick={() => { setSelectedDate(day.iso); setDate(day.iso); setCalendarMonth(monthKey(day.iso)); setCalendarOpen(false); }}>
                  <strong>{Number(day.iso.slice(8,10))}</strong>
                  <div>{dayEvents.slice(0,2).map((event) => <span key={event.id} className={event.done ? 'is-done' : ''}>{event.start_time || '日程'} {event.title}</span>)}{dayTodos.slice(0,1).map((todo) => <span key={todo.id} className="is-todo">待办 {todo.title}</span>)}{dayEvents.length + dayTodos.length > 3 && <small>+{dayEvents.length + dayTodos.length - 3}</small>}</div>
                </button>;
              })}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function parseTimeRange(value: string) {
  const match = value.trim().replace(/[：]/g, ':').match(/^(\d{1,2}:\d{2})\s*(?:-|—|–|~|～|到|至)\s*(\d{1,2}:\d{2})$/);
  return match ? { start: normalizeTime(match[1]), end: normalizeTime(match[2]) } : null;
}
function normalizeTime(value: string) { const [hour, minute] = value.split(':'); return `${hour.padStart(2, '0')}:${minute}`; }
function toMinutes(value: string) { if (!value) return null; const [hour, minute] = value.split(':').map(Number); return Number.isFinite(hour + minute) ? hour * 60 + minute : null; }
function getDayStats(events: ScheduleEvent[]) {
  const timed = events.map((event) => ({ start: toMinutes(event.start_time), end: toMinutes(event.end_time) })).filter((item): item is { start: number; end: number } => item.start !== null && item.end !== null).sort((a,b) => a.start - b.start);
  const minutes = timed.reduce((total, item) => total + Math.max(0, item.end - item.start), 0);
  const conflicts = timed.reduce((total, item, index) => index && item.start < timed[index - 1].end ? total + 1 : total, 0);
  return { count: events.length, done: events.filter((event) => event.done).length, hours: Math.round(minutes / 6) / 10, conflicts };
}
function friendlyDate(value: string) { const date = new Date(`${value}T12:00:00`); return `${['周日','周一','周二','周三','周四','周五','周六'][date.getDay()]}`; }
function buildCalendarDays(month: string) { const [year, monthNumber] = month.split('-').map(Number); const first = new Date(year, monthNumber - 1, 1); const offset = (first.getDay() + 6) % 7; const start = new Date(year, monthNumber - 1, 1 - offset); return Array.from({ length: 42 }, (_, index) => { const value = new Date(start); value.setDate(start.getDate() + index); const iso = [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-'); return { iso, inMonth: value.getMonth() === monthNumber - 1 }; }); }
function shiftMonth(month: string, delta: number) { const [year, number] = month.split('-').map(Number); const value = new Date(year, number - 1 + delta, 1); return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`; }
function normalizeSchedule(events: ScheduleEvent[]) { return events.map((event) => ({ ...event, done: Boolean(event.done) })); }
function sortSchedule(events: ScheduleEvent[]) { return [...events].sort((a,b) => `${a.date}${a.start_time || '99:99'}${a.title}`.localeCompare(`${b.date}${b.start_time || '99:99'}${b.title}`)); }

export default ScheduleView;
