import { useEffect, useState } from 'react';
import { checkinHabit, createGoal, createHabit, deleteGoal, deleteHabit, getDashboard, saveExpense, saveMood, toggleMilestone } from '../../api/client';
import type { GrowthDashboard, Goal, Habit } from '../../types';
import './GrowthView.css';

const empty: GrowthDashboard = { period: 'week', focus_minutes: 0, moods: [], mood_average: null, expense_total: 0, expense_by_category: {}, habits: [], goals: [], todo_completion_rate: 0 };

function GrowthView() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [data, setData] = useState<GrowthDashboard>(empty);
  const [habitName, setHabitName] = useState('');
  const [goal, setGoal] = useState({ title: '', deadline: '', milestones: '' });
  const [expense, setExpense] = useState({ amount: '', category: '餐饮', note: '' });
  const [moodNote, setMoodNote] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => getDashboard(period).then((value) => setData(value as GrowthDashboard));
  useEffect(() => { load().catch(() => setNotice('成长数据暂时无法读取')); }, [period]);
  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2200); };

  const addHabit = async () => {
    if (!habitName.trim()) return;
    await createHabit({ name: habitName.trim(), frequency: 'daily', weekly_target: 1 });
    setHabitName(''); await load(); flash('习惯已创建');
  };
  const doCheckin = async (item: Habit) => { await checkinHabit(item.id); await load(); flash(`「${item.name}」打卡成功`); };
  const addGoal = async () => {
    if (!goal.title.trim() || !goal.deadline) return;
    const milestones = goal.milestones.split(/[,，\n]/).map((title) => title.trim()).filter(Boolean).map((title) => ({ title, weight: 1 }));
    await createGoal({ title: goal.title, deadline: goal.deadline, milestones });
    setGoal({ title: '', deadline: '', milestones: '' }); await load(); flash('目标已创建');
  };
  const addExpense = async () => {
    if (!Number(expense.amount)) return;
    await saveExpense({ ...expense, amount: Number(expense.amount) });
    setExpense({ ...expense, amount: '', note: '' }); await load(); flash('支出已记录');
  };
  const addMood = async (score: number) => { await saveMood({ score, note: moodNote }); setMoodNote(''); await load(); flash('今天的心情已记录'); };

  return <main className="growth-page">
    <header className="growth-header"><div><span>SELF QUANTIFIED</span><h2>成长面板</h2><p>看见节奏，不让数字定义你。<small className="growth-storage">本地 SQLite · 每日自动备份</small></p></div><div className="growth-period"><button className={period === 'week' ? 'is-active' : ''} onClick={() => setPeriod('week')}>本周</button><button className={period === 'month' ? 'is-active' : ''} onClick={() => setPeriod('month')}>本月</button></div></header>
    {notice && <div className="growth-notice">{notice}</div>}
    <section className="growth-metrics">
      <Metric label="专注时间" value={`${data.focus_minutes}`} unit="分钟" />
      <Metric label="平均心情" value={data.mood_average ?? '—'} unit="/ 5" />
      <Metric label="支出合计" value={`¥${data.expense_total}`} unit={Object.keys(data.expense_by_category).slice(0,2).join(' · ')} />
      <Metric label="待办完成率" value={`${data.todo_completion_rate}%`} unit="保持真实节奏" />
    </section>
    <section className="growth-grid">
      <article className="growth-card"><CardTitle title="每日心情" hint="1 低落 · 5 明亮"/><div className="mood-picker">{[1,2,3,4,5].map((score) => <button key={score} onClick={() => addMood(score)}>{['●','◔','◑','◕','✦'][score-1]}<small>{score}</small></button>)}</div><input value={moodNote} onChange={(e) => setMoodNote(e.target.value)} placeholder="可选：今天发生了什么" /><div className="mood-chart">{data.moods.slice(-14).map((item, index) => <span key={`${item.date}-${item.score}-${index}`} title={`${item.date} · ${item.score}`}><i style={{ height: `${item.score * 18}%` }} /></span>)}</div></article>
      <article className="growth-card"><CardTitle title="快速记账" hint="也可在对话里说「午饭 15」"/><div className="growth-form row"><input type="number" min="0" value={expense.amount} onChange={(e) => setExpense({...expense, amount:e.target.value})} placeholder="金额"/><select value={expense.category} onChange={(e) => setExpense({...expense,category:e.target.value})}><option>餐饮</option><option>交通</option><option>学习</option><option>购物</option><option>其他</option></select></div><input value={expense.note} onChange={(e) => setExpense({...expense,note:e.target.value})} placeholder="备注"/><button className="growth-primary" onClick={addExpense}>记录支出</button><div className="expense-tags">{Object.entries(data.expense_by_category).map(([key,value]) => <span key={key}>{key} ¥{value}</span>)}</div></article>
      <article className="growth-card growth-wide"><CardTitle title="习惯守护" hint="连续打卡与最长记录"/><div className="growth-form row"><input value={habitName} onChange={(e) => setHabitName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHabit()} placeholder="想养成的习惯"/><button className="growth-primary" onClick={addHabit}>新建习惯</button></div><div className="habit-list">{data.habits.map((item) => <div key={item.id}><div className="habit-flame"><b>{item.current_streak}</b><small>连续{item.streak_unit === 'week' ? '周数' : '天数'}</small></div><span><strong>{item.name}</strong><small>最长 {item.longest_streak} {item.streak_unit === 'week' ? '周' : '天'}{item.frequency === 'weekly' ? ` · 本周 ${item.weekly_progress}/${item.weekly_target}` : ''}</small></span><button className={item.checked_today ? 'is-done' : ''} disabled={item.checked_today} onClick={() => doCheckin(item)}>{item.checked_today ? '今日已打卡' : '现在打卡'}</button><button className="icon-delete" onClick={async () => { await deleteHabit(item.id); load(); }}>×</button></div>)}</div></article>
      <article className="growth-card growth-wide"><CardTitle title="人生进度条" hint="里程碑采用等权重，可由 API 自定义权重"/><div className="goal-create"><input value={goal.title} onChange={(e) => setGoal({...goal,title:e.target.value})} placeholder="长期目标"/><input type="date" value={goal.deadline} onChange={(e) => setGoal({...goal,deadline:e.target.value})}/><input value={goal.milestones} onChange={(e) => setGoal({...goal,milestones:e.target.value})} placeholder="里程碑，用逗号分隔"/><button className="growth-primary" onClick={addGoal}>创建目标</button></div><div className="goal-list">{data.goals.map((item) => <GoalCard key={item.id} item={item} onChange={load} />)}</div></article>
    </section>
  </main>;
}

function Metric({label,value,unit}:{label:string;value:string|number;unit:string}) { return <article><span>{label}</span><strong>{value}</strong><small>{unit}</small></article>; }
function CardTitle({title,hint}:{title:string;hint:string}) { return <header className="growth-card-title"><h3>{title}</h3><small>{hint}</small></header>; }
function GoalCard({ item, onChange }:{item:Goal;onChange:()=>void}) { return <div className="goal-item"><header><span><strong>{item.title}</strong><small>{item.days_left === null ? '' : item.days_left >= 0 ? `剩余 ${item.days_left} 天` : `已逾期 ${-item.days_left} 天`}</small></span><b>{item.progress}%</b><button className="icon-delete" onClick={async()=>{await deleteGoal(item.id);onChange();}}>×</button></header><div className="goal-bar"><i style={{width:`${item.progress}%`}}/></div><div className="milestones">{item.milestones.map((step) => <label key={step.id}><input type="checkbox" checked={step.done} onChange={async(e)=>{await toggleMilestone(item.id,step.id,e.target.checked);onChange();}}/><span>{step.title}</span><small>{step.weight}</small></label>)}</div></div>; }
export default GrowthView;
