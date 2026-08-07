import { useEffect, useMemo, useState } from 'react';
import {
  commitInbox,
  confirmLearningCandidate,
  getInboxActions,
  getLearningCandidates,
  getLearningPreferences,
  getLearningWeeklySummary,
  getProjects,
  parseInbox,
  rejectLearningCandidate,
  undoInboxAction,
  updateLearningPreferences,
} from '../../api/client';
import type { InboxAction, InboxKind, InboxProposal, LearningCandidate, LearningWeeklySummary, Project } from '../../types';
import '../workspace/Workspace.css';
import './InboxView.css';

const KIND_META: Record<InboxKind, { label: string; icon: string; color: string }> = {
  todo: { label: '待办', icon: '✓', color: '#3FAFD9' },
  schedule: { label: '日程', icon: '◷', color: '#6E8EEB' },
  expense: { label: '支出', icon: '¥', color: '#E0A557' },
  habit: { label: '习惯', icon: '↻', color: '#51B99D' },
  goal: { label: '目标', icon: '◎', color: '#8D78D2' },
  idea: { label: '灵感', icon: '✦', color: '#E285A4' },
  project: { label: '项目', icon: '◇', color: '#318BB4' },
  treehole: { label: '树洞', icon: '⌁', color: '#6D638D' },
};

const MEMORY_META: Record<LearningCandidate['category'], string> = {
  preference: '偏好',
  goal: '长期目标',
  context: '背景',
  boundary: '边界',
};

function localDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}
function futureLocal(months: number) {
  const value = new Date();
  value.setMonth(value.getMonth() + months);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function InboxView() {
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<InboxProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [actions, setActions] = useState<InboxAction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [learningCandidates, setLearningCandidates] = useState<LearningCandidate[]>([]);
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [learningSummary, setLearningSummary] = useState<LearningWeeklySummary | null>(null);
  const [learningBusy, setLearningBusy] = useState('');
  const [projectId, setProjectId] = useState('');
  const [password, setPassword] = useState('');
  const [unlockDate, setUnlockDate] = useState(futureLocal(6));
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; actionId?: string } | null>(null);

  const load = async () => {
    const [workspaceResult, learningResult] = await Promise.allSettled([
      Promise.all([getInboxActions(12), getProjects()]),
      Promise.all([getLearningCandidates('pending', 50), getLearningPreferences(), getLearningWeeklySummary()]),
    ]);
    if (workspaceResult.status === 'fulfilled') {
      const [actionResult, projectResult] = workspaceResult.value;
      setActions((actionResult as { items: InboxAction[] }).items);
      setProjects((projectResult as { items: Project[] }).items);
    }
    if (learningResult.status === 'fulfilled') {
      const [candidateResult, preferenceResult, summaryResult] = learningResult.value;
      setLearningCandidates((candidateResult as { items: LearningCandidate[] }).items);
      setLearningEnabled((preferenceResult as { preferences: { enabled: boolean } }).preferences.enabled);
      setLearningSummary(summaryResult as LearningWeeklySummary);
    }
  };
  useEffect(() => { load().catch(() => undefined); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await parseInbox(text) as { proposal: InboxProposal };
      setProposal(result.proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败');
    } finally {
      setLoading(false);
    }
  };
  const updatePayload = (key: string, value: unknown) => setProposal((current) => current ? { ...current, payload: { ...current.payload, [key]: value } } : current);
  const updateTitle = (value: string) => setProposal((current) => {
    if (!current) return current;
    const key = current.kind === 'habit' ? 'name' : current.kind === 'idea' || current.kind === 'treehole' ? 'content' : 'title';
    return { ...current, title: value, payload: { ...current.payload, [key]: value } };
  });
  const switchKind = (kind: InboxKind) => {
    if (!proposal) return;
    const title = proposal.title || proposal.source_text;
    const bases: Record<InboxKind, Record<string, unknown>> = {
      todo: { title, priority: 'medium', due_date: null, notes: '来自万能收件箱' },
      schedule: { title, date: localDate(), start_time: '', end_time: '', category: 'other', notes: proposal.source_text },
      expense: { amount: 0, category: '其他', note: title, date: localDate() },
      habit: { name: title, frequency: 'daily', weekly_target: 1 },
      goal: { title, deadline: localDate(90), milestones: [] },
      idea: { content: proposal.source_text, category: '待分类', tags: [] },
      project: { title, description: '', deadline: null, milestones: [], tasks: [] },
      treehole: { content: proposal.source_text },
    };
    setProposal({ ...proposal, kind, title, payload: bases[kind], missing_fields: kind === 'treehole' ? ['password', 'unlock_date'] : [] });
    if (!['todo', 'schedule', 'idea'].includes(kind)) setProjectId('');
  };
  const canCommit = useMemo(() => Boolean(
    proposal
    && proposal.title.trim()
    && (proposal.kind !== 'expense' || Number(proposal.payload.amount) > 0)
    && (proposal.kind !== 'schedule' || Boolean(proposal.payload.date))
    && (proposal.kind !== 'treehole' || (password.length >= 6 && unlockDate)),
  ), [password, proposal, unlockDate]);
  const commit = async () => {
    if (!proposal || !canCommit) return;
    setCommitting(true);
    setError('');
    try {
      const result = await commitInbox({
        proposal,
        project_id: projectId || null,
        password: proposal.kind === 'treehole' ? password : null,
        unlock_date: proposal.kind === 'treehole' ? new Date(unlockDate).toISOString() : null,
      }) as { action: { id: string } };
      setToast({ text: `已加入${KIND_META[proposal.kind].label}`, actionId: result.action.id });
      setText('');
      setProposal(null);
      setPassword('');
      setProjectId('');
      await load();
      window.dispatchEvent(new CustomEvent('firefly:workspace-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败');
    } finally {
      setCommitting(false);
    }
  };
  const undo = async (id: string) => {
    try {
      await undoInboxAction(id);
      setToast({ text: '已撤销，数据恢复到操作前' });
      await load();
      window.dispatchEvent(new CustomEvent('firefly:workspace-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败');
    }
  };
  const updateLearningDraft = (id: string, patch: Partial<LearningCandidate>) => {
    setLearningCandidates((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const confirmLearning = async (item: LearningCandidate) => {
    if (!item.content.trim() || learningBusy) return;
    setLearningBusy(item.id);
    setError('');
    try {
      await confirmLearningCandidate(item.id, {
        content: item.content.trim(),
        category: item.category,
        use_in_chat: item.use_in_chat,
      });
      setToast({ text: '已确认，写入“Firefly 眼中的我”' });
      await load();
      window.dispatchEvent(new CustomEvent('firefly:learning-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '确认失败');
    } finally {
      setLearningBusy('');
    }
  };
  const rejectLearning = async (id: string) => {
    if (learningBusy) return;
    setLearningBusy(id);
    setError('');
    try {
      await rejectLearningCandidate(id);
      setToast({ text: '已忽略，这条不会成为长期记忆' });
      await load();
      window.dispatchEvent(new CustomEvent('firefly:learning-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法忽略');
    } finally {
      setLearningBusy('');
    }
  };
  const toggleLearning = async () => {
    if (learningBusy) return;
    setLearningBusy('preferences');
    setError('');
    try {
      const result = await updateLearningPreferences(!learningEnabled) as { preferences: { enabled: boolean } };
      setLearningEnabled(result.preferences.enabled);
      setToast({ text: result.preferences.enabled ? '已恢复从普通对话中发现候选' : '已暂停自动发现；已有候选仍由你决定' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置保存失败');
    } finally {
      setLearningBusy('');
    }
  };

  return <main className="workspace-page inbox-page">
    <header className="workspace-head"><div><span className="workspace-eyebrow">ONE PLACE TO CAPTURE & CONFIRM</span><h2>万能收件箱</h2><p>事情先在这里归位，Firefly 的新认识也先在这里等你确认。</p></div><div className="workspace-head-badge"><i />分析不等于执行 · 由你做主</div></header>
    <section className={`inbox-learning workspace-card${learningCandidates.length ? ' has-pending' : ''}`}>
      <header className="inbox-learning-head">
        <div className="inbox-learning-title"><i>◇</i><span><small>FIREFLY LEARNS, YOU DECIDE</small><h3>Firefly 想向你确认</h3><p>只有确认后的内容才会成为长期记忆；你可以先修改，也可以直接忽略。</p></span></div>
        <label className="inbox-learning-toggle"><input type="checkbox" checked={learningEnabled} disabled={learningBusy === 'preferences'} onChange={toggleLearning} /><span><i /></span><em>{learningEnabled ? '自动发现已开启' : '自动发现已暂停'}</em></label>
      </header>
      {learningCandidates.length ? <div className="inbox-learning-list">{learningCandidates.map((item) => <article key={item.id}>
        <div className="inbox-learning-card-head"><span>{item.source_type === 'chat_observation' ? '从你的话里发现' : item.source_type === 'explicit_remember' ? '你让我记住' : '来自回复反馈'}</span><em>{Math.round(item.confidence * 100)}% 把握{item.occurrence_count > 1 ? ` · 出现 ${item.occurrence_count} 次` : ''}</em></div>
        <textarea value={item.content} maxLength={240} onChange={(event) => updateLearningDraft(item.id, { content: event.target.value })} aria-label="学习候选内容" />
        <div className="inbox-learning-fields">
          <label><span>作为</span><select value={item.category} onChange={(event) => updateLearningDraft(item.id, { category: event.target.value as LearningCandidate['category'] })}>{Object.entries(MEMORY_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="inbox-learning-context"><input type="checkbox" checked={item.use_in_chat} onChange={(event) => updateLearningDraft(item.id, { use_in_chat: event.target.checked })} /><span>确认后允许用于对话</span></label>
        </div>
        <details><summary>为什么出现这条？</summary><p>{item.reason}</p>{item.evidence && <blockquote>“{item.evidence}”</blockquote>}</details>
        <footer><button disabled={learningBusy === item.id} onClick={() => rejectLearning(item.id)}>不是我 / 忽略</button><button className="workspace-btn-primary" disabled={learningBusy === item.id || !item.content.trim()} onClick={() => confirmLearning(item)}>{learningBusy === item.id ? '处理中…' : '确认成为记忆'}</button></footer>
      </article>)}</div> : <div className="inbox-learning-empty"><i>✓</i><span><strong>现在没有等待确认的新认识</strong><small>{learningEnabled ? 'Firefly 只会捕捉明确、稳定的表达，不会猜测你。' : '自动发现已暂停，聊天里的“记住”仍然可以使用。'}</small></span></div>}
      <footer className="inbox-learning-week"><span>本周学习记录</span><p>{learningSummary ? `发现 ${learningSummary.generated} 条 · 你确认 ${learningSummary.confirmed} 条 · 忽略 ${learningSummary.rejected} 条` : '正在读取…'}</p><em>树洞、运势与敏感信息不会进入这里</em></footer>
    </section>
    <section className="inbox-capture workspace-card"><div className="inbox-capture-mark">✦</div><textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze(); }} placeholder="例如：明天下午三点提醒我交报告 / 午饭 18 元 / 每周跑步三次…" /><div className="inbox-capture-foot"><span>{text.length ? `${text.length} 字 · Ctrl/⌘ + Enter 解析` : '一句话可以成为任务、日程、支出、习惯、目标、灵感或项目'}</span><button className="workspace-btn-primary" onClick={analyze} disabled={loading || !text.trim()}>{loading ? '正在判断…' : '解析去处'} <b>→</b></button></div></section>
    {error && <div className="workspace-error inbox-error">{error}</div>}
    <section className="inbox-layout">
      <article className="workspace-card inbox-preview">{proposal ? <>
        <header><div className="inbox-kind" style={{ '--kind-color': KIND_META[proposal.kind].color } as React.CSSProperties}><i>{KIND_META[proposal.kind].icon}</i><span><small>建议归入</small><strong>{KIND_META[proposal.kind].label}</strong></span></div><span className="inbox-confidence">{Math.round(proposal.confidence * 100)}% 把握</span></header>
        <div className="inbox-kind-switch">{(Object.keys(KIND_META) as InboxKind[]).map((kind) => <button key={kind} className={proposal.kind === kind ? 'is-active' : ''} onClick={() => switchKind(kind)}>{KIND_META[kind].icon}<span>{KIND_META[kind].label}</span></button>)}</div>
        <div className="inbox-preview-form">
          <label className="workspace-field"><span>{proposal.kind === 'idea' ? '内容' : proposal.kind === 'treehole' ? '封存内容' : '标题'}</span>{proposal.kind === 'idea' || proposal.kind === 'treehole' ? <textarea rows={3} value={String(proposal.payload.content || '')} onChange={(e) => updateTitle(e.target.value)} /> : <input value={proposal.title} onChange={(e) => updateTitle(e.target.value)} />}</label>
          <KindFields proposal={proposal} update={updatePayload} />
          {(['todo', 'schedule', 'idea'] as InboxKind[]).includes(proposal.kind) && projects.length > 0 && <label className="workspace-field"><span>关联项目（可选）</span><select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">不关联项目</option>{projects.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
          {proposal.kind === 'treehole' && <div className="inbox-secret-fields"><label className="workspace-field"><span>封存密码</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位，无法找回" /></label><label className="workspace-field"><span>解锁时间</span><input type="datetime-local" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} /></label></div>}
        </div>
        <footer><div><small>判断依据</small><p>{proposal.rationale}</p></div><button className="workspace-btn-primary" disabled={!canCommit || committing} onClick={commit}>{committing ? '正在写入…' : `确认加入${KIND_META[proposal.kind].label}`}</button></footer>
      </> : <div className="workspace-empty"><i>⌁</i><strong>等待一条输入</strong><p>解析结果会在这里预览；没有确认前，不会修改任何数据。</p></div>}</article>
      <aside className="workspace-card inbox-history"><header><div><span className="workspace-eyebrow">RECENT</span><h3>最近收纳</h3></div><small>{actions.filter((item) => !item.undone).length} 条有效操作</small></header><div>{actions.length ? actions.map((action) => { const item = action.payload?.proposal; const meta = KIND_META[action.kind]; return <article key={action.id} className={action.undone ? 'is-undone' : ''}><i style={{ background: meta.color }}>{meta.icon}</i><span><strong>{item?.title || meta.label}</strong><small>{meta.label} · {new Date(action.created_at).toLocaleString('zh-CN')}</small></span>{action.undone ? <em>已撤销</em> : <button onClick={() => undo(action.id)}>撤销</button>}</article>; }) : <div className="inbox-history-empty">还没有收纳记录</div>}</div></aside>
    </section>
    {toast && <div className="workspace-toast"><span>{toast.text}</span>{toast.actionId && <button onClick={() => undo(toast.actionId!)}>撤销</button>}</div>}
  </main>;
}

function KindFields({ proposal, update }: { proposal: InboxProposal; update: (key: string, value: unknown) => void }) {
  const payload = proposal.payload;
  if (proposal.kind === 'todo') return <div className="inbox-fields-row"><label className="workspace-field"><span>优先级</span><select value={String(payload.priority || 'medium')} onChange={(e) => update('priority', e.target.value)}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label className="workspace-field"><span>截止日期</span><input type="date" value={String(payload.due_date || '')} onChange={(e) => update('due_date', e.target.value || null)} /></label></div>;
  if (proposal.kind === 'schedule') return <div className="inbox-fields-row three"><label className="workspace-field"><span>日期</span><input type="date" value={String(payload.date || '')} onChange={(e) => update('date', e.target.value)} /></label><label className="workspace-field"><span>开始</span><input type="time" value={String(payload.start_time || '')} onChange={(e) => update('start_time', e.target.value)} /></label><label className="workspace-field"><span>分类</span><select value={String(payload.category || 'other')} onChange={(e) => update('category', e.target.value)}><option value="study">学习</option><option value="project">项目</option><option value="life">生活</option><option value="deadline">截止</option><option value="other">其他</option></select></label></div>;
  if (proposal.kind === 'expense') return <div className="inbox-fields-row"><label className="workspace-field"><span>金额</span><input type="number" min="0.01" step="0.01" value={String(payload.amount || '')} onChange={(e) => update('amount', Number(e.target.value))} /></label><label className="workspace-field"><span>分类</span><select value={String(payload.category || '其他')} onChange={(e) => update('category', e.target.value)}><option>餐饮</option><option>交通</option><option>学习</option><option>购物</option><option>其他</option></select></label></div>;
  if (proposal.kind === 'habit') return <div className="inbox-fields-row"><label className="workspace-field"><span>频率</span><select value={String(payload.frequency || 'daily')} onChange={(e) => update('frequency', e.target.value)}><option value="daily">每日</option><option value="weekly">每周</option></select></label><label className="workspace-field"><span>每周目标</span><input type="number" min="1" max="7" value={Number(payload.weekly_target || 1)} onChange={(e) => update('weekly_target', Number(e.target.value))} /></label></div>;
  if (proposal.kind === 'goal' || proposal.kind === 'project') return <label className="workspace-field"><span>目标日期</span><input type="date" value={String(payload.deadline || '')} onChange={(e) => update('deadline', e.target.value || null)} /></label>;
  return null;
}

export default InboxView;
