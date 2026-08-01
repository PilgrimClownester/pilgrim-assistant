import { useEffect, useState } from 'react';
import { getHabits, getRandomIdea, getSchedule, getTodos } from '../../api/client';
import type { Habit, Idea, ScheduleEvent, TodoItem } from '../../types';

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function ReminderWatcher() {
  const [enabled, setEnabled] = useState(() => window.localStorage.getItem('firefly:reminders-enabled') === 'true');

  useEffect(() => {
    const update = (event: Event) => setEnabled(Boolean((event as CustomEvent).detail));
    window.addEventListener('firefly:reminders-changed', update);
    return () => window.removeEventListener('firefly:reminders-changed', update);
  }, []);

  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const check = async () => {
      try {
        const [scheduleData, todoData, habitData] = await Promise.all([getSchedule(), getTodos(), getHabits()]);
        remindSchedule((scheduleData as { items: ScheduleEvent[] }).items);
        remindTodos((todoData as { items: TodoItem[] }).items);
        remindHabits((habitData as { items: Habit[] }).items);
        await remindWeeklyIdea();
      } catch { /* 后端暂时离线时等待下一轮。 */ }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return null;
}

function remindSchedule(items: ScheduleEvent[]) {
  const now = new Date();
  const today = localToday();
  const current = now.getHours() * 60 + now.getMinutes();
  items.filter((item) => item.date === today && !item.done && item.start_time).forEach((item) => {
    const [hour, minute] = item.start_time.split(':').map(Number);
    const delta = hour * 60 + minute - current;
    if (delta < 0 || delta > 10) return;
    notifyOnce(`event:${today}:${item.id}`, `还有 ${delta || 1} 分钟`, `${item.start_time} · ${item.title}`);
  });
}

function remindTodos(items: TodoItem[]) {
  const today = localToday();
  const due = items.filter((item) => !item.done && item.due_date && item.due_date <= today);
  if (due.length) notifyOnce(`todos:${today}`, '今天有需要留意的任务', `${due.length} 项临期或逾期，去清单重新安排一下。`);
}

function remindHabits(items: Habit[]) {
  const now = new Date();
  if (now.getHours() < 21) return;
  const pending = items.filter((item) => item.frequency === 'daily' && !item.checked_today);
  if (pending.length) notifyOnce(`habits:${localToday()}`, '今天的习惯还在等你', pending.slice(0, 3).map((item) => item.name).join('、'));
}

async function remindWeeklyIdea() {
  const now = new Date();
  if (now.getDay() !== 1 || now.getHours() < 10) return;
  const weekKey = `${now.getFullYear()}-${Math.ceil((((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)}`;
  if (window.localStorage.getItem(`firefly:reminder:idea:${weekKey}`)) return;
  const result = await getRandomIdea() as { item: Idea | null };
  if (result.item) notifyOnce(`idea:${weekKey}`, '翻到一颗旧火花', `${result.item.content.slice(0, 90)}${result.item.content.length > 90 ? '…' : ''}`);
}

function notifyOnce(key: string, title: string, body: string) {
  const sentKey = `firefly:reminder:${key}`;
  if (window.localStorage.getItem(sentKey)) return;
  new Notification(title, { body });
  window.localStorage.setItem(sentKey, new Date().toISOString());
}

export default ReminderWatcher;
