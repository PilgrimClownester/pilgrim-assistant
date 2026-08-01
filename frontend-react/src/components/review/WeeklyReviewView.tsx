import { useEffect, useState } from 'react';
import { applyWeeklyPlan, getWeeklyReview, getWeeklyReviewHistory, saveWeeklyReview } from '../../api/client';
import type { SavedWeeklyReview, WeeklyPlanSuggestion, WeeklyReviewData } from '../../types';
import '../workspace/Workspace.css';
import './WeeklyReviewView.css';

function WeeklyReviewView() {
  const [data, setData] = useState<WeeklyReviewData | null>(null);
  const [plan, setPlan] = useState<WeeklyPlanSuggestion[]>([]);
  const [history, setHistory] = useState<SavedWeeklyReview[]>([]);
  const [form, setForm] = useState({ highlight: '', challenge: '', next_focus: '', note: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [review, past] = await Promise.all([getWeeklyReview(), getWeeklyReviewHistory()]);
      const next = review as WeeklyReviewData;
      const items = (past as { items: SavedWeeklyReview[] }).items;
      setData(next);
      setPlan(next.plan_suggestions);
      setHistory(items);
      const saved = items.find((item) => item.week_start === next.start);
      if (saved) setForm({ highlight: saved.highlight, challenge: saved.challenge, next_focus: saved.next_focus, note: saved.note });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '复盘加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const flash = (value: string) => { setNotice(value); window.setTimeout(() => setNotice(''), 2400); };
  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await saveWeeklyReview({ week_start: data.start, ...form, snapshot: data });
      await load();
      flash('这一周已经收好');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const apply = async () => {
    const tasks = plan.filter((item) => item.selected && item.title.trim()).map(({ selected, ...item }) => ({ ...item, notes: '来自每周复盘' }));
    if (!tasks.length) return;
    try {
      await applyWeeklyPlan({ tasks });
      setPlanned(true);
      flash(`已把 ${tasks.length} 项加入下周清单`);
      window.dispatchEvent(new CustomEvent('firefly:workspace-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '计划创建失败');
    }
  };
  const updatePlan = (index: number, patch: Partial<WeeklyPlanSuggestion>) => setPlan((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));

  if (loading) return <main className="workspace-page"><div className="review-loading"><i>✦</i><p>正在整理这一周的足迹…</p></div></main>;
  return <main className="workspace-page review-page">
    <header className="workspace-head">
      <div><span className="workspace-eyebrow">WEEK IN REVIEW</span><h2>每周复盘</h2><p>{data ? `${formatDate(data.start)} — ${formatDate(data.end)}` : '最近七天'}，把进展看清，再轻轻安排下一步。</p></div>
      <div className="workspace-head-badge"><i />本地统计 · 由你确认计划</div>
    </header>
    {(notice || error) && <div className={error ? 'workspace-error' : 'review-notice'}>{error || notice}</div>}
    {data && <>
      <section className="review-metrics">
        <Metric label="完成事项" value={data.metrics.completed} unit="项" trend={data.metrics.completed ? '有进展留下' : '从今天开始'} />
        <Metric label="专注投入" value={data.metrics.focus_minutes} unit="分钟" trend={data.metrics.focus_minutes >= 120 ? '节奏扎实' : '给专注留一段空间'} />
        <Metric label="平均心情" value={data.metrics.mood_average ?? '—'} unit="/ 5" trend={data.metrics.mood_average === null ? '等待记录' : data.metrics.mood_average >= 3.5 ? '整体明亮' : '需要多一点照顾'} />
        <Metric label="支出记录" value={`¥${data.metrics.expense_total}`} unit="" trend={`${data.metrics.reflection_days} 天有复盘`} />
      </section>
      <section className="review-story-grid">
        <article className="workspace-card review-signals">
          <header><div><span className="workspace-eyebrow">SIGNALS</span><h3>这一周告诉你的事</h3></div><span>{data.metrics.overdue ? `${data.metrics.overdue} 项逾期` : '节奏清爽'}</span></header>
          <div className="review-signal-columns">
            <section><h4><i>↑</i>值得保留</h4>{data.wins.map((item, index) => <p key={index}>{item}</p>)}</section>
            <section className="is-watch"><h4><i>!</i>需要留意</h4>{data.watchouts.length ? data.watchouts.map((item, index) => <p key={index}>{item}</p>) : <p>目前没有明显风险，继续保持真实节奏。</p>}</section>
          </div>
          <div className="review-project-pulse"><header><h4>项目脉搏</h4><small>{data.projects.filter((project) => project.status === 'active').length} 个进行中</small></header>{data.projects.filter((project) => project.status === 'active').slice(0, 4).map((project) => <div key={project.id}><span><strong>{project.title}</strong><small>{project.open_risks ? `${project.open_risks} 个开放风险` : project.days_left === null ? '长期项目' : `剩余 ${project.days_left} 天`}</small></span><em><i style={{ width: `${project.progress}%`, background: project.color }} /></em><b>{project.progress}%</b></div>)}</div>
        </article>
        <article className="workspace-card review-reflection">
          <header><span className="workspace-eyebrow">YOUR WORDS</span><h3>用自己的话收好这一周</h3></header>
          <label className="workspace-field"><span>最值得肯定的一件事</span><input value={form.highlight} onChange={(e) => setForm({ ...form, highlight: e.target.value })} placeholder="哪怕只是一个小进展" /></label>
          <label className="workspace-field"><span>最大的摩擦或消耗</span><input value={form.challenge} onChange={(e) => setForm({ ...form, challenge: e.target.value })} placeholder="什么让事情变难了" /></label>
          <label className="workspace-field"><span>下周唯一主线</span><input value={form.next_focus} onChange={(e) => setForm({ ...form, next_focus: e.target.value })} placeholder="如果只推进一件事…" /></label>
          <label className="workspace-field"><span>写给下周的自己</span><textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="提醒、边界或一句鼓励" /></label>
          <button className="workspace-btn-primary" onClick={save} disabled={saving}>{saving ? '正在保存…' : '保存本周复盘'}</button>
        </article>
      </section>
      <WeeklyContext data={data} />
      <section className="workspace-card review-plan">
        <header><div><span className="workspace-eyebrow">NEXT WEEK</span><h3>下周建议计划</h3><p>Firefly 只提出候选；勾选、修改并确认后才写入任务清单。</p></div><button className="workspace-btn-primary" onClick={apply} disabled={planned || !plan.some((item) => item.selected)}>{planned ? '已生成计划' : '生成下周清单'}</button></header>
        {plan.length ? <div className="review-plan-list">{plan.map((item, index) => <article key={index} className={item.selected ? 'is-selected' : ''}><label><input type="checkbox" checked={item.selected} onChange={(e) => updatePlan(index, { selected: e.target.checked })} /><i /></label><input className="review-plan-title" value={item.title} onChange={(e) => updatePlan(index, { title: e.target.value })} /><select value={item.priority} onChange={(e) => updatePlan(index, { priority: e.target.value as WeeklyPlanSuggestion['priority'] })}><option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option></select><input type="date" value={item.due_date || ''} onChange={(e) => updatePlan(index, { due_date: e.target.value || null })} /><small>{item.project_id ? '关联项目' : '独立任务'}</small></article>)}</div> : <div className="workspace-empty"><i>✓</i><strong>暂时没有自动建议</strong><p>可以先在项目驾驶舱中添加下一步里程碑。</p></div>}
      </section>
      {history.length > 0 && <section className="review-history"><header><span className="workspace-eyebrow">ARCHIVE</span><h3>复盘档案</h3></header><div>{history.slice(0, 6).map((item) => <article className="workspace-card" key={item.id}><time>{formatDate(item.week_start)}</time><strong>{item.next_focus || item.highlight || '这一周已完成复盘'}</strong><p>{item.note || item.challenge || '没有留下额外文字。'}</p></article>)}</div></section>}
    </>}
  </main>;
}

function WeeklyContext({ data }: { data: WeeklyReviewData }) {
  const strongest = [...data.habits].sort((a, b) => b.current_streak - a.current_streak).slice(0, 3);
  const activeGoals = data.goals.filter((goal) => goal.progress < 100).slice(0, 3);
  return <section className="review-context-grid">
    <article className="workspace-card review-context-card"><header><i>◎</i><div><span className="workspace-eyebrow">HABITS</span><h3>习惯节奏</h3></div></header>{strongest.length ? strongest.map((habit) => <div className="review-context-row" key={habit.id}><span><strong>{habit.name}</strong><small>{habit.checked_today ? '今天已完成' : `本周目标 ${habit.weekly_target} 次`}</small></span><b>{habit.current_streak}<small>{habit.streak_unit === 'day' ? '天' : '周'}连续</small></b></div>) : <ContextEmpty text="还没有习惯记录" />}</article>
    <article className="workspace-card review-context-card"><header><i>◇</i><div><span className="workspace-eyebrow">GOALS</span><h3>长期目标</h3></div></header>{activeGoals.length ? activeGoals.map((goal) => <div className="review-goal" key={goal.id}><span><strong>{goal.title}</strong><small>{goal.days_left === null ? '持续推进' : `剩余 ${goal.days_left} 天`}</small></span><em><i style={{ width: `${goal.progress}%` }} /></em><b>{goal.progress}%</b></div>) : <ContextEmpty text="暂时没有进行中的目标" />}</article>
    <article className="workspace-card review-context-card review-old-idea"><header><i>✦</i><div><span className="workspace-eyebrow">REDISCOVER</span><h3>旧想法回看</h3></div></header>{data.old_idea ? <><p>{data.old_idea.content}</p><footer><span>{data.old_idea.category}</span><time>{new Date(data.old_idea.created_at).toLocaleDateString('zh-CN')}</time></footer></> : <ContextEmpty text="灵感箱还在等第一颗火花" />}</article>
  </section>;
}

function ContextEmpty({ text }: { text: string }) { return <div className="review-context-empty">{text}</div>; }
function Metric({ label, value, unit, trend }: { label: string; value: string | number; unit: string; trend: string }) { return <article className="workspace-card"><span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div><p>{trend}</p></article>; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }); }

export default WeeklyReviewView;
