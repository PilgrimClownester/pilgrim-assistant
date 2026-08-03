import { useEffect, useMemo, useState } from 'react';
import { createTodo, deleteTodo, getTodos, updateTodo } from '../../api/client';
import type { TodoItem } from '../../types';
import './TodoView.css';

type TodoFilter = 'active' | 'all' | 'done';

const priorityMeta = {
  high: { label: '重要', mark: '!' },
  medium: { label: '常规', mark: '·' },
  low: { label: '稍后', mark: '↓' },
};

const priorityRank = { high: 0, medium: 1, low: 2 };

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function TodoView({ onStartFocus }: { onStartFocus?: (title: string) => void }) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TodoItem['priority']>('medium');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<TodoFilter>('active');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = (initial = false) => getTodos()
      .then((data) => { if (mounted) { setItems((data as { items: TodoItem[] }).items); setError(''); } })
      .catch((err) => { if (mounted && initial) setError(err instanceof Error ? err.message : '加载失败'); })
      .finally(() => { if (mounted && initial) setLoading(false); });
    load(true);
    const timer = window.setInterval(() => load(), 12_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const useCache = (event: Event) => {
      if (!mounted) return;
      setItems((event as CustomEvent<{ todos: TodoItem[] }>).detail.todos);
      setLoading(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('firefly:productivity-cache', useCache);
    return () => { mounted = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('firefly:productivity-cache', useCache); };
  }, []);

  const stats = useMemo(() => {
    const today = localToday();
    const active = items.filter((item) => !item.done);
    const done = items.filter((item) => item.done);
    const todayItems = items.filter((item) => item.due_date === today);
    const urgent = active.filter((item) => item.priority === 'high' || Boolean(item.due_date && item.due_date <= today));
    const progress = items.length ? Math.round((done.length / items.length) * 100) : 0;
    return { active: active.length, done: done.length, today: todayItems.length, urgent: urgent.length, progress };
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = filter === 'active'
      ? items.filter((item) => !item.done)
      : filter === 'done'
        ? items.filter((item) => item.done)
        : items;
    return [...filtered].sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff) return priorityDiff;
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31') || a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
  }, [filter, items]);

  const addTodo = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || submitting) return;
    setSubmitting(true);
    try {
      const data = await createTodo({ title: cleanTitle, priority, due_date: dueDate || null, notes: notes.trim() }) as { item: TodoItem };
      setItems((current) => current.some((item) => item.id === data.item.id) ? current : [...current, data.item]);
      setTitle('');
      setDueDate('');
      setNotes('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDone = async (item: TodoItem) => {
    try {
      const data = await updateTodo(item.id, { done: !item.done }) as { item: TodoItem };
      setItems((current) => current.map((todo) => todo.id === item.id ? data.item : todo));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteTodo(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <main className="todo-page">
      <header className="productivity-header">
        <div>
          <span className="productivity-eyebrow">FIREFLY FOCUS</span>
          <h2>任务清单</h2>
          <p>不用记住所有事，只决定现在要推进哪一件。</p>
        </div>
        <div className="todo-progress-orb" style={{ '--todo-progress': `${stats.progress * 3.6}deg` } as React.CSSProperties}>
          <span><b>{stats.progress}%</b><small>总进度</small></span>
        </div>
      </header>

      <section className="todo-overview" aria-label="任务概览">
        <article><span>待推进</span><strong>{stats.active}</strong><small>保持一条清晰主线</small></article>
        <article><span>今天到期</span><strong>{stats.today}</strong><small>先处理时间敏感项</small></article>
        <article className={stats.urgent ? 'is-urgent' : ''}><span>需要留意</span><strong>{stats.urgent}</strong><small>{stats.urgent ? '重要或临期任务' : '目前节奏轻松'}</small></article>
        <article><span>已经完成</span><strong>{stats.done}</strong><small>每一步都算数</small></article>
      </section>

      <section className="todo-capture-card">
        <div className="todo-capture-main">
          <span className="todo-capture-mark">＋</span>
          <label>
            <small>快速记下一件事</small>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') addTodo(); }}
              placeholder="例如：完成首页交互稿"
            />
          </label>
        </div>
        <div className="todo-capture-options">
          <div className="priority-picker" aria-label="优先级">
            {(Object.keys(priorityMeta) as TodoItem['priority'][]).map((value) => (
              <button key={value} className={priority === value ? `is-active is-${value}` : ''} onClick={() => setPriority(value)}>
                <i>{priorityMeta[value].mark}</i>{priorityMeta[value].label}
              </button>
            ))}
          </div>
          <label className="todo-date-field"><span>截止</span><input value={dueDate} onChange={(event) => setDueDate(event.target.value)} type="date" /></label>
          <button className="todo-add-button" onClick={addTodo} disabled={!title.trim() || submitting}>{submitting ? '正在加入…' : '加入清单'}<b>→</b></button>
        </div>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="补充备注（可选）" />
      </section>

      <section className="todo-board">
        <div className="todo-board-head">
          <div><span>任务流</span><h3>{filter === 'active' ? '现在要做的事' : filter === 'done' ? '完成记录' : '全部任务'}</h3></div>
          <nav className="todo-filters" aria-label="筛选任务">
            {(['active', 'all', 'done'] as const).map((key) => (
              <button key={key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
                {key === 'active' ? '进行中' : key === 'done' ? '已完成' : '全部'}
              </button>
            ))}
          </nav>
        </div>

        {error && <div className="productivity-error">{error}</div>}
        {loading && <div className="productivity-empty">正在整理任务…</div>}
        {!loading && visibleItems.length === 0 && (
          <div className="productivity-empty"><span>✓</span><strong>{filter === 'active' ? '手上没有待办' : '这里还是空的'}</strong><p>给自己留一点空白，也是一种进度。</p></div>
        )}
        <div className="todo-list">
          {visibleItems.map((item) => {
            const due = getDueMeta(item.due_date, item.done);
            return (
              <article key={item.id} className={`todo-item todo-item--${item.priority}${item.done ? ' is-done' : ''}`}>
                <button className="todo-check" onClick={() => toggleDone(item)} aria-label={item.done ? `恢复 ${item.title}` : `完成 ${item.title}`}><span>✓</span></button>
                <div className="todo-item-copy">
                  <div className="todo-item-title-row"><h4>{item.title}</h4><span className={`todo-priority todo-priority--${item.priority}`}>{priorityMeta[item.priority].label}</span></div>
                  {item.notes && <p>{item.notes}</p>}
                  <div className="todo-item-meta">
                    {due && <span className={due.tone}>{due.label}</span>}
                    {!item.due_date && <span>没有截止时间</span>}
                    {item.done && <span className="is-complete">已完成</span>}
                  </div>
                </div>
                <div className="todo-item-actions">
                  {!item.done && <button className="todo-focus" onClick={() => onStartFocus?.(item.title)}>专注</button>}
                  <button className="todo-delete" onClick={() => remove(item.id)} aria-label={`删除 ${item.title}`} title="删除">×</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function getDueMeta(dueDate: string | null, done: boolean) {
  if (!dueDate) return null;
  const today = localToday();
  if (done) return { label: `截止 ${dueDate}`, tone: '' };
  if (dueDate < today) return { label: `已逾期 · ${dueDate}`, tone: 'is-overdue' };
  if (dueDate === today) return { label: '今天到期', tone: 'is-today' };
  return { label: `截止 ${dueDate}`, tone: '' };
}

export default TodoView;
