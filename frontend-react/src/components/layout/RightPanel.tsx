import { useEffect, useMemo, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { getProfile, getSchedule, getTodos } from '../../api/client';
import type { ScheduleEvent, TodoItem, UserProfile } from '../../types';
import './RightPanel.css';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function toMinutes(value: string) {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function getStatus(events: ScheduleEvent[]) {
  const now = minutesNow();
  const timed = events
    .map((event) => ({ event, start: toMinutes(event.start_time), end: toMinutes(event.end_time) }))
    .filter((item) => item.start !== null)
    .sort((a, b) => (a.start || 0) - (b.start || 0));

  const current = timed.find((item) => {
    const end = item.end ?? (item.start || 0) + 60;
    return (item.start || 0) <= now && now <= end;
  });
  if (current) return `进行中：${current.event.title}`;

  const next = timed.find((item) => (item.start || 0) > now);
  if (next) return `下一项：${next.event.start_time} ${next.event.title}`;

  return events.length ? '今日日程已排完' : '暂无日程';
}

function RightPanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [profileData, todoData, scheduleData] = await Promise.all([
        getProfile(),
        getTodos(),
        getSchedule(),
      ]);
      setProfile(profileData as UserProfile);
      setTodos((todoData as { items: TodoItem[] }).items);
      setSchedule((scheduleData as { items: ScheduleEvent[] }).items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态加载失败');
    }
  };

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const activeTodos = todos.filter((todo) => !todo.done);
    const doneTodos = todos.filter((todo) => todo.done);
    const totalTodos = todos.length;
    const progress = totalTodos === 0 ? 0 : Math.round((doneTodos.length / totalTodos) * 100);
    const todayEvents = schedule.filter((event) => event.date === today());
    return {
      activeTodos,
      doneTodos,
      totalTodos,
      progress,
      todayEvents,
      status: getStatus(todayEvents),
    };
  }, [schedule, todos]);

  return (
    <aside className="right-panel">
      <div className="right-panel-inner">
        <FrostedCard className="panel-card">
          <h3 className="panel-card-title">🎯 今日目标</h3>
          <p className="panel-card-text">{profile?.current_goals?.trim() || '先把主线任务推进一小步'}</p>
        </FrostedCard>

        <FrostedCard className="panel-card">
          <h3 className="panel-card-title">✨ 当前状态</h3>
          <p className="panel-card-text">{error || stats.status}</p>
        </FrostedCard>

        <FrostedCard className="panel-card">
          <h3 className="panel-card-title">📋 待办数量</h3>
          <p className="panel-card-number">{stats.activeTodos.length}</p>
          <p className="panel-card-hint">项待处理</p>
        </FrostedCard>

        <FrostedCard className="panel-card">
          <h3 className="panel-card-title">📊 今日进度</h3>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${stats.progress}%` }} />
          </div>
          <p className="panel-card-hint">{stats.doneTodos.length} / {stats.totalTodos} 已完成</p>
        </FrostedCard>

        <FrostedCard className="panel-card">
          <h3 className="panel-card-title">📅 今日日程</h3>
          <p className="panel-card-number">{stats.todayEvents.length}</p>
          <p className="panel-card-hint">个时间段</p>
        </FrostedCard>
      </div>
    </aside>
  );
}

export default RightPanel;
