import { useEffect, useMemo, useState } from 'react';
import {
  addProjectDecision, addProjectEvent, addProjectLink, addProjectMilestone,
  addProjectRisk, addProjectTask, createProject, getIdeas, getProjects,
  linkProjectIdea, resolveProjectRisk, toggleProjectMilestone, updateProject, updateTodo,
} from '../../api/client';
import type { Idea, Project } from '../../types';
import '../workspace/Workspace.css';
import './ProjectsView.css';

function ProjectsView({ onStartFocus }: { onStartFocus: (title: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ title: '', description: '', deadline: '', milestones: '', tasks: '' });
  const [milestone, setMilestone] = useState('');
  const [task, setTask] = useState('');
  const [risk, setRisk] = useState('');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [ideaId, setIdeaId] = useState('');

  const load = async (preferred?: string) => {
    const [projectResult, ideaResult] = await Promise.all([getProjects(), getIdeas()]);
    const list = (projectResult as { items: Project[] }).items;
    setProjects(list);
    setIdeas((ideaResult as { items: Idea[] }).items);
    setSelectedId((current) => {
      if (preferred && list.some((item) => item.id === preferred)) return preferred;
      if (current && list.some((item) => item.id === current)) return current;
      return list[0]?.id || '';
    });
  };
  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : '项目加载失败')); }, []);
  const selected = useMemo(() => projects.find((item) => item.id === selectedId) || null, [projects, selectedId]);
  const active = projects.filter((item) => item.status === 'active');
  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2200); };
  const refresh = async () => { await load(selectedId); window.dispatchEvent(new CustomEvent('firefly:workspace-updated')); };

  const create = async () => {
    if (!draft.title.trim()) return;
    try {
      const split = (value: string) => value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
      const result = await createProject({
        title: draft.title.trim(), description: draft.description.trim(), deadline: draft.deadline || null,
        color: ['#3FAFD9', '#55B99E', '#8D78D2', '#E09B5A'][projects.length % 4],
        milestones: split(draft.milestones).map((title) => ({ title, weight: 1 })),
        tasks: split(draft.tasks).map((title) => ({ title, priority: 'medium', due_date: null, notes: '来自项目创建' })),
      }) as { item: Project };
      setDraft({ title: '', description: '', deadline: '', milestones: '', tasks: '' });
      setCreating(false);
      await load(result.item.id);
      flash('项目驾驶舱已建立');
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败'); }
  };
  const addMilestone = async () => { if (selected && milestone.trim()) { await addProjectMilestone(selected.id, { title: milestone.trim(), weight: 1 }); setMilestone(''); await refresh(); } };
  const addTask = async () => { if (selected && task.trim()) { await addProjectTask(selected.id, { title: task.trim(), priority: 'medium', due_date: selected.deadline, notes: `项目：${selected.title}` }); setTask(''); await refresh(); } };
  const addRisk = async () => { if (selected && risk.trim()) { await addProjectRisk(selected.id, { text: risk.trim(), level: riskLevel }); setRisk(''); await refresh(); } };
  const linkIdea = async () => { if (selected && ideaId) { await linkProjectIdea(selected.id, ideaId); setIdeaId(''); await refresh(); } };

  return <main className="workspace-page projects-page">
    <header className="workspace-head">
      <div><span className="workspace-eyebrow">PROJECT COMMAND</span><h2>项目驾驶舱</h2><p>让任务、里程碑、日程、资料、决策与风险围绕同一个结果协同。</p></div>
      <button className="workspace-btn-primary" onClick={() => setCreating(true)}>＋ 新建项目</button>
    </header>
    {(notice || error) && <div className={error ? 'workspace-error' : 'projects-notice'}>{error || notice}</div>}
    <section className="projects-overview">
      <Overview label="进行中" value={active.length} hint="个项目" />
      <Overview label="平均进度" value={`${active.length ? Math.round(active.reduce((sum, item) => sum + item.progress, 0) / active.length) : 0}%`} hint="持续推进" />
      <Overview label="开放风险" value={projects.reduce((sum, item) => sum + item.open_risks, 0)} hint="需要留意" />
      <Overview label="本周完成" value={projects.reduce((sum, item) => sum + item.weekly_completed, 0)} hint="项关联行动" />
    </section>
    <section className="projects-layout">
      <aside className="workspace-card project-list">
        <header><h3>全部项目</h3><span>{projects.length}</span></header>
        {projects.length ? <div>{projects.map((item) => <button key={item.id} className={selectedId === item.id ? 'is-active' : ''} onClick={() => setSelectedId(item.id)}><i style={{ background: item.color }} /><span><strong>{item.title}</strong><small>{statusLabel(item.status)} · {item.tasks.filter((todo) => !todo.done).length} 项待推进</small><em><b style={{ width: `${item.progress}%`, background: item.color }} /></em></span><mark>{item.progress}%</mark></button>)}</div> : <Empty />}
      </aside>
      <article className="workspace-card project-detail">
        {selected ? <>
          <header className="project-detail-head"><div className="project-title-mark" style={{ background: selected.color }}>◇</div><div><span className="workspace-eyebrow">ACTIVE PROJECT</span><h3>{selected.title}</h3><p>{selected.description || '还没有项目说明，可以先从下一步行动开始。'}</p></div><select value={selected.status} onChange={async (e) => { await updateProject(selected.id, { status: e.target.value }); refresh(); }}><option value="active">进行中</option><option value="paused">暂停</option><option value="completed">已完成</option><option value="archived">归档</option></select></header>
          <div className="project-progress"><div><span>总体进度</span><strong>{selected.progress}%</strong></div><em><i style={{ width: `${selected.progress}%`, background: selected.color }} /></em><p>{selected.deadline ? (selected.days_left !== null && selected.days_left >= 0 ? `距离 ${selected.deadline} 还有 ${selected.days_left} 天` : `截止日期 ${selected.deadline}`) : '尚未设置截止日期'} · {selected.open_risks ? `${selected.open_risks} 个风险待处理` : '当前没有开放风险'}</p></div>
          <div className="project-columns">
            <ProjectSection title="里程碑" count={selected.milestones.length} action={<QuickAdd value={milestone} set={setMilestone} submit={addMilestone} placeholder="添加里程碑" />}><div className="project-milestones">{selected.milestones.map((item) => <label key={item.id} className={item.done ? 'is-done' : ''}><input type="checkbox" checked={item.done} onChange={async (e) => { await toggleProjectMilestone(selected.id, item.id, e.target.checked); refresh(); }} /><i /><span>{item.title}</span><small>权重 {item.weight}</small></label>)}</div></ProjectSection>
            <ProjectSection title="关联任务" count={selected.tasks.length} action={<QuickAdd value={task} set={setTask} submit={addTask} placeholder="添加下一步行动" />}><div className="project-tasks">{selected.tasks.map((item) => <div key={item.id} className={item.done ? 'is-done' : ''}><button className="project-task-check" onClick={async () => { await updateTodo(item.id, { done: !item.done }); refresh(); }}>{item.done ? '✓' : ''}</button><span><strong>{item.title}</strong><small>{item.due_date ? `截止 ${item.due_date}` : '未设置日期'}</small></span>{!item.done && <button onClick={() => onStartFocus(item.title)}>专注</button>}</div>)}</div></ProjectSection>
            <ProjectSection title="风险雷达" count={selected.open_risks} action={<div className="project-risk-add"><select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><QuickAdd value={risk} set={setRisk} submit={addRisk} placeholder="记录风险或阻塞" /></div>}><div className="project-risks">{selected.risks.map((item) => <label key={item.id} className={`risk-${item.level} ${item.status === 'resolved' ? 'is-resolved' : ''}`}><button onClick={async () => { await resolveProjectRisk(selected.id, item.id, item.status !== 'resolved'); refresh(); }}>{item.status === 'resolved' ? '↶' : '✓'}</button><span>{item.text}</span><small>{item.level === 'high' ? '高风险' : item.level === 'medium' ? '中风险' : '低风险'}</small></label>)}</div></ProjectSection>
            <ProjectSection title="灵感关联" count={selected.ideas.length} action={<div className="project-idea-link"><select value={ideaId} onChange={(e) => setIdeaId(e.target.value)}><option value="">选择灵感…</option>{ideas.filter((item) => !selected.idea_ids.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.content.slice(0, 36)}</option>)}</select><button onClick={linkIdea} disabled={!ideaId}>关联</button></div>}><div className="project-ideas">{selected.ideas.map((item) => <article key={item.id}><small>{item.category}</small><p>{item.content}</p></article>)}</div></ProjectSection>
          </div>
        </> : <Empty />}
      </article>
    </section>
    {selected && <ProjectConnections project={selected} refresh={refresh} />}
    {creating && <CreateProjectModal draft={draft} setDraft={setDraft} close={() => setCreating(false)} submit={create} />}
  </main>;
}

function ProjectConnections({ project, refresh }: { project: Project; refresh: () => Promise<void> }) {
  const [event, setEvent] = useState({ title: '', date: '', start_time: '' });
  const [decision, setDecision] = useState(''); const [rationale, setRationale] = useState('');
  const [link, setLink] = useState({ title: '', url: '' });
  const saveEvent = async () => { if (event.title.trim() && event.date) { await addProjectEvent(project.id, { ...event, end_time: '', category: 'project', notes: `项目：${project.title}` }); setEvent({ title: '', date: '', start_time: '' }); await refresh(); } };
  const saveDecision = async () => { if (decision.trim()) { await addProjectDecision(project.id, { decision: decision.trim(), rationale: rationale.trim(), review_date: null }); setDecision(''); setRationale(''); await refresh(); } };
  const saveLink = async () => { if (link.title.trim() && link.url.trim()) { await addProjectLink(project.id, { title: link.title.trim(), url: link.url.trim(), kind: 'reference' }); setLink({ title: '', url: '' }); await refresh(); } };
  return <section className="workspace-card project-connections"><header><span className="workspace-eyebrow">PROJECT MEMORY</span><h3>项目上下文</h3><p>本周完成 {project.weekly_completed} 项 · {project.events.length} 个日程 · {project.decisions.length} 条决策 · {project.links.length} 份资料</p></header><div>
    <ProjectSection title="关键日程" count={project.events.length} action={<div className="connection-event-add"><input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} placeholder="事件" /><input type="date" value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} /><button onClick={saveEvent}>＋</button></div>}><ConnectionList items={project.events.map((item) => ({ id: item.id, icon: '◷', title: item.title, detail: `${item.date} ${item.start_time}` }))} /></ProjectSection>
    <ProjectSection title="决策记录" count={project.decisions.length} action={null}><div className="connection-compose"><input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="我们决定…" /><input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="原因（可选）" /><button onClick={saveDecision}>记录</button></div><ConnectionList items={project.decisions.slice().reverse().map((item) => ({ id: item.id, icon: '◆', title: item.decision, detail: item.rationale || new Date(item.created_at).toLocaleDateString() }))} /></ProjectSection>
    <ProjectSection title="资料与链接" count={project.links.length} action={null}><div className="connection-compose"><input value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} placeholder="资料名称" /><input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="URL 或文件路径" /><button onClick={saveLink}>关联</button></div><ConnectionList items={project.links.map((item) => ({ id: item.id, icon: '↗', title: item.title, detail: item.url }))} /></ProjectSection>
  </div></section>;
}

function ConnectionList({ items }: { items: { id: string; icon: string; title: string; detail: string }[] }) { return <div className="connection-list">{items.map((item) => <article key={item.id}><i>{item.icon}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span></article>)}</div>; }
function Overview({ label, value, hint }: { label: string; value: string | number; hint: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>; }
function Empty() { return <div className="workspace-empty"><i>◇</i><strong>还没有项目</strong><p>把一件长期事情建立成驾驶舱。</p></div>; }
function statusLabel(value: Project['status']) { return { active: '进行中', paused: '已暂停', completed: '已完成', archived: '已归档' }[value]; }
function QuickAdd({ value, set, submit, placeholder }: { value: string; set: (value: string) => void; submit: () => void; placeholder: string }) { return <div className="project-quick-add"><input value={value} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={placeholder} /><button onClick={submit}>＋</button></div>; }
function ProjectSection({ title, count, action, children }: { title: string; count: number; action: React.ReactNode; children: React.ReactNode }) { return <section className="project-section"><header><div><h4>{title}</h4><span>{count}</span></div>{action}</header>{children}</section>; }
function CreateProjectModal({ draft, setDraft, close, submit }: { draft: { title: string; description: string; deadline: string; milestones: string; tasks: string }; setDraft: (value: typeof draft) => void; close: () => void; submit: () => void }) { return <div className="project-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) close(); }}><section className="workspace-card project-modal"><header><div><span className="workspace-eyebrow">NEW PROJECT</span><h3>建立项目驾驶舱</h3></div><button onClick={close}>×</button></header><label className="workspace-field"><span>项目名称</span><input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：毕业设计" /></label><label className="workspace-field"><span>项目说明</span><textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="完成什么，以及为什么值得做" /></label><div className="project-modal-row"><label className="workspace-field"><span>截止日期</span><input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label><label className="workspace-field"><span>初始里程碑</span><input value={draft.milestones} onChange={(e) => setDraft({ ...draft, milestones: e.target.value })} placeholder="调研，原型，交付" /></label></div><label className="workspace-field"><span>初始任务</span><input value={draft.tasks} onChange={(e) => setDraft({ ...draft, tasks: e.target.value })} placeholder="用逗号分隔，可稍后添加" /></label><footer><button className="workspace-btn-soft" onClick={close}>取消</button><button className="workspace-btn-primary" onClick={submit} disabled={!draft.title.trim()}>创建项目</button></footer></section></div>; }
export default ProjectsView;
