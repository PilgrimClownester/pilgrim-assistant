import { useEffect, useMemo, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { createTodo, deleteTodo, getTodos, updateTodo } from '../../api/client';
import type { TodoItem } from '../../types';

const priorityLabel = {
  high: '高',
  medium: '中',
  low: '低',
};

const priorityRank = {
  high: 0,
  medium: 1,
  low: 2,
};

function TodoView() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TodoItem['priority']>('medium');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<'active' | 'all' | 'done'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await getTodos() as { items: TodoItem[] };
      setItems(data.items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visibleItems = useMemo(() => {
    const filtered = filter === 'active'
      ? items.filter((item) => !item.done)
      : filter === 'done'
        ? items.filter((item) => item.done)
        : items;
    return [...filtered].sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      const aDue = a.due_date || '9999-12-31';
      const bDue = b.due_date || '9999-12-31';
      const dateDiff = aDue.localeCompare(bDue);
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
  }, [filter, items]);

  const addTodo = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    try {
      const data = await createTodo({
        title: cleanTitle,
        priority,
        due_date: dueDate || null,
        notes: notes.trim(),
      }) as { item: TodoItem };
      setItems((current) => [...current, data.item]);
      setTitle('');
      setDueDate('');
      setNotes('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
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
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={titleStyle}>TodoList</h2>
          <p style={hintStyle}>把今天要推进的事收在这里，先清主线。</p>
        </div>
        <div style={segmentStyle}>
          {(['active', 'all', 'done'] as const).map((key) => (
            <button key={key} onClick={() => setFilter(key)} style={filter === key ? activeSegStyle : segStyle}>
              {key === 'active' ? '进行中' : key === 'done' ? '已完成' : '全部'}
            </button>
          ))}
        </div>
      </div>

      <div style={gridStyle}>
        <FrostedCard style={{ padding: 18 }}>
          <div style={formStyle}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新增待办" style={inputStyle} />
            <div style={rowStyle}>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TodoItem['priority'])} style={inputStyle}>
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
              <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" style={inputStyle} />
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="备注，可不填" style={textareaStyle} />
            <button onClick={addTodo} style={primaryButtonStyle}>添加</button>
          </div>
        </FrostedCard>

        <div style={listStyle}>
          {loading && <FrostedCard style={{ padding: 18, color: 'var(--text-muted)' }}>加载中...</FrostedCard>}
          {error && <FrostedCard style={{ padding: 18, color: '#b42318' }}>{error}</FrostedCard>}
          {!loading && visibleItems.length === 0 && (
            <FrostedCard style={{ padding: 18, color: 'var(--text-muted)' }}>这里暂时是空的。</FrostedCard>
          )}
          {visibleItems.map((item) => (
            <FrostedCard key={item.id} style={{ padding: 16 }}>
              <div style={itemTopStyle}>
                <label style={checkLabelStyle}>
                  <input type="checkbox" checked={item.done} onChange={() => toggleDone(item)} />
                  <span style={{ ...itemTitleStyle, textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</span>
                </label>
                <button onClick={() => remove(item.id)} style={ghostButtonStyle}>删除</button>
              </div>
              <div style={metaStyle}>
                <span>优先级：{priorityLabel[item.priority]}</span>
                {item.due_date && <span>截止：{item.due_date}</span>}
              </div>
              {item.notes && <p style={notesStyle}>{item.notes}</p>}
            </FrostedCard>
          ))}
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const toolbarStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 18, alignItems: 'center' };
const titleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-lg)', margin: 0 };
const hintStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: '6px 0 0' };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 16, alignItems: 'start' };
const formStyle: React.CSSProperties = { display: 'grid', gap: 10 };
const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const listStyle: React.CSSProperties = { display: 'grid', gap: 10 };
const segmentStyle: React.CSSProperties = { display: 'flex', padding: 3, border: '1px solid var(--glass-border)', borderRadius: 8, background: 'rgba(246,252,255,0.65)' };
const segStyle: React.CSSProperties = { padding: '7px 12px', color: 'var(--text-muted)', background: 'transparent', borderRadius: 6, fontSize: 'var(--font-size-sm)' };
const activeSegStyle: React.CSSProperties = { ...segStyle, background: 'var(--primary-cyan)', color: 'var(--deep-blue)', fontWeight: 700 };
const inputStyle: React.CSSProperties = { padding: '9px 11px', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-main)', background: 'rgba(255,255,255,0.7)', outline: 'none' };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 88, resize: 'vertical' };
const primaryButtonStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, background: 'var(--primary-blue)', color: 'white', fontWeight: 700 };
const ghostButtonStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' };
const itemTopStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' };
const checkLabelStyle: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 };
const itemTitleStyle: React.CSSProperties = { color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-word' };
const metaStyle: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 8 };
const notesStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: '8px 0 0', lineHeight: 1.5 };

export default TodoView;
