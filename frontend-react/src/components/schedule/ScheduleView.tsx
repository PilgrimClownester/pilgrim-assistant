import { useEffect, useMemo, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { createScheduleEvent, deleteScheduleEvent, getSchedule, getTodos } from '../../api/client';
import type { ScheduleEvent, TodoItem } from '../../types';

const categoryLabel = {
  study: '学习',
  project: '项目',
  life: '生活',
  deadline: '截止',
  other: '其他',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function ScheduleView() {
  const [items, setItems] = useState<ScheduleEvent[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [selectedDate, setSelectedDate] = useState(today());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(monthKey(today()));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [category, setCategory] = useState<ScheduleEvent['category']>('study');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSchedule(), getTodos()])
      .then(([scheduleData, todoData]) => {
        setItems((scheduleData as { items: ScheduleEvent[] }).items);
        setTodos((todoData as { items: TodoItem[] }).items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const sorted = [...items].sort((a, b) => `${a.date}${a.start_time || '99:99'}${a.title}`.localeCompare(`${b.date}${b.start_time || '99:99'}${b.title}`));
    return sorted.reduce<Record<string, ScheduleEvent[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [items]);

  const availableDates = useMemo(() => {
    const dates = new Set(items.map((item) => item.date));
    dates.add(selectedDate);
    return [...dates].sort();
  }, [items, selectedDate]);

  const selectedEvents = grouped[selectedDate] || [];
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const todosByDate = useMemo(() => {
    return todos.reduce<Record<string, TodoItem[]>>((acc, todo) => {
      if (!todo.due_date) return acc;
      acc[todo.due_date] = acc[todo.due_date] || [];
      acc[todo.due_date].push(todo);
      return acc;
    }, {});
  }, [todos]);

  const addEvent = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const parsedRange = parseTimeRange(timeRange);
    const cleanStart = parsedRange?.start || startTime;
    const cleanEnd = parsedRange?.end || endTime;
    try {
      const data = await createScheduleEvent({
        title: cleanTitle,
        date,
        start_time: cleanStart,
        end_time: cleanEnd,
        category,
        notes: notes.trim(),
      }) as { item: ScheduleEvent };
      setItems((current) => [...current, data.item].sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)));
      setSelectedDate(data.item.date);
      setTitle('');
      setStartTime('');
      setEndTime('');
      setTimeRange('');
      setNotes('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteScheduleEvent(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>日程安排</h2>
          <p style={hintStyle}>按时间段看一天的安排，先把空档和冲突露出来。</p>
        </div>
        <div style={headerActionsStyle}>
          <button onClick={() => setCalendarOpen(true)} style={secondaryButtonStyle}>打开日历</button>
          <input value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} type="date" style={datePickerStyle} />
        </div>
      </div>

      <div style={gridStyle}>
        <FrostedCard style={{ padding: 18 }}>
          <div style={formStyle}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="日程标题" style={inputStyle} />
            <div style={rowStyle}>
              <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={inputStyle} />
              <select value={category} onChange={(e) => setCategory(e.target.value as ScheduleEvent['category'])} style={inputStyle}>
                <option value="study">学习</option>
                <option value="project">项目</option>
                <option value="life">生活</option>
                <option value="deadline">截止</option>
                <option value="other">其他</option>
              </select>
            </div>
            <input
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              placeholder="时间段，例如 18:00-20:00"
              style={inputStyle}
            />
            <div style={rowStyle}>
              <input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="time" style={inputStyle} title="开始时间" />
              <input value={endTime} onChange={(e) => setEndTime(e.target.value)} type="time" style={inputStyle} title="结束时间" />
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="备注，可不填" style={textareaStyle} />
            <button onClick={addEvent} style={primaryButtonStyle}>添加日程</button>
          </div>
        </FrostedCard>

        <div style={listStyle}>
          {loading && <FrostedCard style={{ padding: 18, color: 'var(--text-muted)' }}>加载中...</FrostedCard>}
          {error && <FrostedCard style={{ padding: 18, color: '#b42318' }}>{error}</FrostedCard>}
          <FrostedCard style={{ padding: 16 }}>
            <div style={scheduleHeadStyle}>
              <h3 style={dayTitleStyle}>{selectedDate}</h3>
              <div style={scheduleHeadActionsStyle}>
                <button onClick={() => setCalendarOpen(true)} style={smallButtonStyle}>打开日历</button>
                <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={smallSelectStyle}>
                  {availableDates.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </div>
            </div>
            {!loading && selectedEvents.length === 0 && <div style={emptyStyle}>这一天还没排时间段。</div>}
            {selectedEvents.length > 0 && (
              <div style={tableStyle}>
                <div style={tableHeaderStyle}>时间段</div>
                <div style={tableHeaderStyle}>日程</div>
                <div style={tableHeaderStyle}>分类</div>
                <div style={tableHeaderStyle}>操作</div>
                {selectedEvents.map((event) => (
                  <div key={event.id} style={rowContentsStyle}>
                    <div style={timeBlockStyle}>{formatTimeBlock(event)}</div>
                    <div style={tableCellStyle}>
                      <div style={eventTitleStyle}>{event.title}</div>
                      {event.notes && <p style={notesStyle}>{event.notes}</p>}
                    </div>
                    <div style={{ ...tableCellStyle, ...tagStyle }}>{categoryLabel[event.category]}</div>
                    <div style={tableCellStyle}>
                      <button onClick={() => remove(event.id)} style={ghostButtonStyle}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FrostedCard>
        </div>
      </div>

      {calendarOpen && (
        <div style={drawerBackdropStyle} onMouseDown={() => setCalendarOpen(false)}>
          <aside style={drawerStyle} onMouseDown={(event) => event.stopPropagation()}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={drawerTitleStyle}>日历视图</h3>
                <p style={hintStyle}>按月查看日程和待办截止日期。</p>
              </div>
              <button onClick={() => setCalendarOpen(false)} style={ghostButtonStyle}>关闭</button>
            </div>
            <div style={monthToolbarStyle}>
              <button onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))} style={ghostButtonStyle}>上月</button>
              <input value={calendarMonth} onChange={(e) => setCalendarMonth(e.target.value)} type="month" style={monthInputStyle} />
              <button onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))} style={ghostButtonStyle}>下月</button>
            </div>
            <div style={weekdayGridStyle}>
              {['一', '二', '三', '四', '五', '六', '日'].map((day) => <div key={day} style={weekdayStyle}>{day}</div>)}
            </div>
            <div style={calendarGridStyle}>
              {calendarDays.map((day) => {
                const dayEvents = grouped[day.iso] || [];
                const dayTodos = todosByDate[day.iso] || [];
                return (
                  <button
                    key={day.iso}
                    onClick={() => {
                      setSelectedDate(day.iso);
                      setCalendarMonth(monthKey(day.iso));
                      setCalendarOpen(false);
                    }}
                    style={{
                      ...calendarCellStyle,
                      opacity: day.inMonth ? 1 : 0.45,
                      borderColor: day.iso === selectedDate ? 'var(--primary-blue)' : 'rgba(117, 220, 232, 0.35)',
                    }}
                  >
                    <div style={calendarDayNumberStyle}>{Number(day.iso.slice(8, 10))}</div>
                    <div style={calendarItemsStyle}>
                      {dayEvents.slice(0, 2).map((event) => <span key={event.id} style={eventPillStyle}>{event.start_time || '日程'} {event.title}</span>)}
                      {dayTodos.slice(0, 2).map((todo) => <span key={todo.id} style={todoPillStyle}>{todo.done ? '已完成' : '待办'} {todo.title}</span>)}
                      {dayEvents.length + dayTodos.length > 4 && <span style={moreStyle}>+{dayEvents.length + dayTodos.length - 4}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function formatTimeBlock(event: ScheduleEvent) {
  if (!event.start_time && !event.end_time) return '未定';
  if (event.start_time && event.end_time) return `${event.start_time}-${event.end_time}`;
  return event.start_time || `至 ${event.end_time}`;
}

function parseTimeRange(value: string) {
  const normalized = value.trim().replace(/[：]/g, ':');
  const match = normalized.match(/^(\d{1,2}:\d{2})\s*(?:-|—|–|~|～|到|至)\s*(\d{1,2}:\d{2})$/);
  if (!match) return null;
  return { start: normalizeTime(match[1]), end: normalizeTime(match[2]) };
}

function normalizeTime(value: string) {
  const [hour, minute] = value.split(':');
  return `${hour.padStart(2, '0')}:${minute}`;
}

function buildCalendarDays(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthNumber - 1, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const dateValue = new Date(start);
    dateValue.setDate(start.getDate() + index);
    const iso = [
      dateValue.getFullYear(),
      String(dateValue.getMonth() + 1).padStart(2, '0'),
      String(dateValue.getDate()).padStart(2, '0'),
    ].join('-');
    return { iso, inMonth: dateValue.getMonth() === monthNumber - 1 };
  });
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const dateValue = new Date(year, monthNumber - 1 + delta, 1);
  return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;
}

const pageStyle: React.CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 };
const headerActionsStyle: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' };
const titleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-lg)', margin: 0 };
const hintStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: '6px 0 0' };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 16, alignItems: 'start' };
const formStyle: React.CSSProperties = { display: 'grid', gap: 10 };
const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const listStyle: React.CSSProperties = { display: 'grid', gap: 12 };
const inputStyle: React.CSSProperties = { padding: '9px 11px', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-main)', background: 'rgba(255,255,255,0.7)', outline: 'none' };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 88, resize: 'vertical' };
const primaryButtonStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, background: 'var(--primary-blue)', color: 'white', fontWeight: 700 };
const secondaryButtonStyle: React.CSSProperties = { ...primaryButtonStyle, background: 'var(--mint)', color: 'var(--deep-blue)' };
const dayTitleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-base)', margin: '0 0 12px' };
const tagStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' };
const eventTitleStyle: React.CSSProperties = { color: 'var(--text-main)', fontWeight: 700, marginTop: 4, wordBreak: 'break-word' };
const notesStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: '6px 0 0', lineHeight: 1.5 };
const ghostButtonStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' };
const datePickerStyle: React.CSSProperties = { ...inputStyle, width: 160 };
const scheduleHeadStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' };
const scheduleHeadActionsStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' };
const smallSelectStyle: React.CSSProperties = { ...inputStyle, width: 150, padding: '7px 9px', fontSize: 'var(--font-size-xs)' };
const smallButtonStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, background: 'var(--mint)', color: 'var(--deep-blue)', fontWeight: 700, fontSize: 'var(--font-size-xs)' };
const emptyStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', padding: '12px 0' };
const tableStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 72px 52px', columnGap: 12, rowGap: 0, alignItems: 'start' };
const tableHeaderStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 700, padding: '8px 0', borderBottom: '1px solid rgba(117, 220, 232, 0.45)' };
const rowContentsStyle: React.CSSProperties = { display: 'contents' };
const timeBlockStyle: React.CSSProperties = { color: 'var(--deep-blue)', fontSize: 'var(--font-size-sm)', fontWeight: 700, padding: '12px 0', borderBottom: '1px solid rgba(117, 220, 232, 0.22)' };
const tableCellStyle: React.CSSProperties = { minWidth: 0, padding: '12px 0', borderBottom: '1px solid rgba(117, 220, 232, 0.22)' };
const drawerBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(16, 35, 31, 0.18)', display: 'flex', justifyContent: 'flex-end' };
const drawerStyle: React.CSSProperties = { width: 'min(640px, 100vw)', height: '100%', background: 'rgba(246, 252, 255, 0.96)', borderLeft: '1px solid var(--glass-border)', boxShadow: '-18px 0 40px rgba(80, 150, 180, 0.24)', padding: 22, overflow: 'auto' };
const drawerHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', marginBottom: 16 };
const drawerTitleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-lg)', margin: 0 };
const monthToolbarStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 };
const monthInputStyle: React.CSSProperties = { ...inputStyle, width: 150 };
const weekdayGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 };
const weekdayStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 700, textAlign: 'center' };
const calendarGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 };
const calendarCellStyle: React.CSSProperties = { minHeight: 92, padding: 8, border: '1px solid rgba(117, 220, 232, 0.35)', borderRadius: 8, background: 'rgba(255,255,255,0.62)', textAlign: 'left', overflow: 'hidden' };
const calendarDayNumberStyle: React.CSSProperties = { color: 'var(--deep-blue)', fontWeight: 800, fontSize: 'var(--font-size-sm)', marginBottom: 6 };
const calendarItemsStyle: React.CSSProperties = { display: 'grid', gap: 4 };
const eventPillStyle: React.CSSProperties = { color: 'var(--deep-blue)', background: 'rgba(93, 185, 232, 0.18)', borderRadius: 5, padding: '3px 5px', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const todoPillStyle: React.CSSProperties = { ...eventPillStyle, background: 'rgba(139, 230, 212, 0.22)' };
const moreStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '0.68rem' };

export default ScheduleView;
