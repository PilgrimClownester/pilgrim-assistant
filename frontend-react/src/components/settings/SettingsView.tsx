import { useEffect, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { createMemory, deleteMemory, exportChatArchive, getMemories, getProfile, logout, postBaziChart, saveProfile, updateMemory } from '../../api/client';
import type { BirthInfo, CompanionMemory, UserProfile } from '../../types';
import BaziChartView from './BaziChartView';
import './SettingsView.css';

function toNumberOrNull(value: string) {
  return value === '' ? null : Number(value);
}

function buildBirthInfo(profile: UserProfile): BirthInfo | null {
  if (!profile.birth_year || !profile.birth_month || !profile.birth_day || profile.birth_hour === null || profile.birth_hour === undefined) return null;
  return {
    name: profile.nickname || 'Firefly 用户',
    gender: profile.gender || 'unknown',
    calendar_type: profile.calendar_type || 'solar',
    birth_year: profile.birth_year,
    birth_month: profile.birth_month,
    birth_day: profile.birth_day,
    birth_hour: profile.birth_hour,
    birth_minute: profile.birth_minute || 0,
    birth_place: profile.birth_place || undefined,
    use_true_solar_time: profile.use_true_solar_time || false,
    note: profile.bazi_note || undefined,
  };
}

function SettingsView() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [baziChart, setBaziChart] = useState<unknown>(null);
  const [baziLoading, setBaziLoading] = useState(false);
  const [baziError, setBaziError] = useState('');
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [memoryText, setMemoryText] = useState('');
  const [memoryCategory, setMemoryCategory] = useState<CompanionMemory['category']>('context');
  const [memoryUseInChat, setMemoryUseInChat] = useState(true);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryDraftCategory, setMemoryDraftCategory] = useState<CompanionMemory['category']>('context');
  const [memoryError, setMemoryError] = useState('');
  const [archiveStatus, setArchiveStatus] = useState('');

  useEffect(() => {
    getProfile()
      .then((data) => setProfile(data as UserProfile))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getMemories()
      .then((data) => setMemories((data as { items: CompanionMemory[] }).items))
      .catch(() => setMemoryError('长期记忆暂时无法读取'));
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    await saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    window.dispatchEvent(new Event('firefly:logout'));
  };

  const update = (key: keyof UserProfile, value: string | number | boolean | null) => {
    setProfile((current) => current ? { ...current, [key]: value } : current);
  };

  const toggleBaziChart = async () => {
    if (!profile) return;
    if (baziChart !== null) {
      setBaziChart(null);
      return;
    }
    const birthInfo = buildBirthInfo(profile);
    if (!birthInfo) {
      setBaziError('请先补全出生年月日时。');
      return;
    }
    setBaziLoading(true);
    setBaziError('');
    try {
      const response = await postBaziChart(birthInfo) as { chart?: unknown };
      setBaziChart(response.chart ?? null);
    } catch (error) {
      setBaziError(error instanceof Error ? error.message : '命盘读取失败');
    } finally {
      setBaziLoading(false);
    }
  };

  const addMemory = async () => {
    const content = memoryText.trim();
    if (!content) return;
    try {
      const data = await createMemory({ content, category: memoryCategory, use_in_chat: memoryUseInChat }) as { item: CompanionMemory };
      setMemories((current) => [data.item, ...current]);
      setMemoryText('');
      setMemoryError('');
    } catch (error) { setMemoryError(error instanceof Error ? error.message : '添加失败'); }
  };

  const changeMemory = async (id: string, patch: Partial<Pick<CompanionMemory, 'content' | 'category' | 'use_in_chat' | 'is_frozen'>>) => {
    try {
      const data = await updateMemory(id, patch) as { item: CompanionMemory };
      setMemories((current) => current.map((item) => item.id === id ? data.item : item));
      setMemoryError('');
      return data.item;
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : '更新失败');
      return null;
    }
  };

  const beginMemoryEdit = (item: CompanionMemory) => {
    setEditingMemoryId(item.id);
    setMemoryDraft(item.content);
    setMemoryDraftCategory(item.category);
  };

  const saveMemoryEdit = async (item: CompanionMemory) => {
    const content = memoryDraft.trim();
    if (!content) return;
    if (await changeMemory(item.id, { content, category: memoryDraftCategory })) {
      setEditingMemoryId(null);
      setMemoryDraft('');
    }
  };

  const removeMemory = async (id: string) => {
    if (!window.confirm('确定删除这条长期记忆吗？删除后无法从界面恢复。')) return;
    try {
      await deleteMemory(id);
      setMemories((current) => current.filter((item) => item.id !== id));
      setMemoryError('');
    } catch (error) { setMemoryError(error instanceof Error ? error.message : '删除失败'); }
  };

  const downloadChatArchive = async () => {
    setArchiveStatus('正在整理…');
    try {
      const blob = await exportChatArchive();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `firefly-chat-${new Date().toISOString().slice(0, 10)}.jsonl`;
      anchor.click();
      URL.revokeObjectURL(url);
      setArchiveStatus('已导出');
    } catch (error) {
      setArchiveStatus(error instanceof Error ? error.message : '导出失败');
    }
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>加载中...</div>;
  if (!profile) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>无法加载档案</div>;

  return (
    <div className="settings-page" style={pageStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>设置</h2>
        <div className="settings-header-actions">
          <button type="button" className="settings-logout-button" onClick={handleLogout}>退出登录</button>
          <button type="button" onClick={handleSave} style={primaryButtonStyle}>{saved ? '已保存' : '保存档案'}</button>
        </div>
      </div>

      <div style={gridStyle}>
        <FrostedCard style={{ padding: 22 }}>
          <h3 style={sectionTitleStyle}>个人档案</h3>
          <div style={formStyle}>
            <Field label="称呼">
              <input value={profile.nickname || ''} onChange={(e) => update('nickname', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="当前目标">
              <input value={profile.current_goals || ''} onChange={(e) => update('current_goals', e.target.value)} style={inputStyle} placeholder="例如：论文、项目、竞赛" />
            </Field>
            <Field label="关注方向">
              <input value={profile.focus_areas || ''} onChange={(e) => update('focus_areas', e.target.value)} style={inputStyle} placeholder="例如：学业、项目、状态" />
            </Field>
            <Field label="沟通风格">
              <textarea value={profile.communication_style || ''} onChange={(e) => update('communication_style', e.target.value)} style={textareaStyle} />
            </Field>
            <Field label="补充说明">
              <textarea value={profile.notes || ''} onChange={(e) => update('notes', e.target.value)} style={textareaStyle} placeholder="长期偏好、忌讳、需要 Firefly 记住的背景" />
            </Field>
          </div>
        </FrostedCard>

        <FrostedCard style={{ padding: 22 }}>
          <h3 style={sectionTitleStyle}>出生信息</h3>
          <div style={formStyle}>
            <div style={twoColStyle}>
              <Field label="性别">
                <select value={profile.gender || 'unknown'} onChange={(e) => update('gender', e.target.value)} style={inputStyle}>
                  <option value="unknown">未指定</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </Field>
              <Field label="历法">
                <select value={profile.calendar_type || 'solar'} onChange={(e) => update('calendar_type', e.target.value)} style={inputStyle}>
                  <option value="solar">公历</option>
                  <option value="lunar">农历</option>
                </select>
              </Field>
            </div>
            <div style={fourColStyle}>
              <Field label="年">
                <input type="number" value={profile.birth_year ?? ''} onChange={(e) => update('birth_year', toNumberOrNull(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="月">
                <input type="number" value={profile.birth_month ?? ''} onChange={(e) => update('birth_month', toNumberOrNull(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="日">
                <input type="number" value={profile.birth_day ?? ''} onChange={(e) => update('birth_day', toNumberOrNull(e.target.value))} style={inputStyle} />
              </Field>
              <Field label="时">
                <input type="number" value={profile.birth_hour ?? ''} onChange={(e) => update('birth_hour', toNumberOrNull(e.target.value))} style={inputStyle} />
              </Field>
            </div>
            <div style={twoColStyle}>
              <Field label="分钟">
                <input type="number" value={profile.birth_minute ?? 0} onChange={(e) => update('birth_minute', Number(e.target.value || 0))} style={inputStyle} />
              </Field>
              <Field label="出生地">
                <input value={profile.birth_place || ''} onChange={(e) => update('birth_place', e.target.value || null)} style={inputStyle} />
              </Field>
            </div>
            <label style={checkboxStyle}>
              <input type="checkbox" checked={profile.use_true_solar_time || false} onChange={(e) => update('use_true_solar_time', e.target.checked)} />
              使用真太阳时
            </label>
            <Field label="命理备注">
              <textarea value={profile.bazi_note || ''} onChange={(e) => update('bazi_note', e.target.value || null)} style={textareaStyle} placeholder="例如：时间可能有十分钟误差" />
            </Field>
          </div>
        </FrostedCard>

        <FrostedCard className="settings-bazi-archive" style={{ padding: 22 }}>
          <div className="settings-archive-heading">
            <div>
              <span>LONG-TERM ARCHIVE</span>
              <h3>八字档案</h3>
              <p>命盘属于长期资料，仅在你主动查看时显示；运势页只读取它作为推测依据。</p>
            </div>
            <button type="button" onClick={toggleBaziChart} disabled={baziLoading} className="settings-archive-button">
              {baziLoading ? '正在排盘…' : baziChart !== null ? '收起命盘' : '查看我的命盘'}
            </button>
          </div>
          {baziError && <p className="settings-archive-error">{baziError}</p>}
          {baziChart !== null && <div className="settings-chart-wrap"><BaziChartView chart={baziChart} /></div>}
        </FrostedCard>

        <FrostedCard className="settings-memory" style={{ padding: 22 }}>
          <div className="settings-memory-heading">
            <div><span>FIREFLY SEES ME</span><h3>Firefly 眼中的我</h3><p>你始终可以看见并控制每一条记忆。关闭“用于对话”后，它仍保存在你的 Firefly 数据中，但不会进入模型上下文。</p></div>
            <em>{memories.filter((item) => !item.is_frozen).length} 条启用 · {memories.filter((item) => item.use_in_chat && !item.is_frozen).length} 条用于对话</em>
          </div>
          <div className="settings-memory-compose">
            <select value={memoryCategory} onChange={(event) => setMemoryCategory(event.target.value as CompanionMemory['category'])}>
              <option value="preference">偏好</option><option value="goal">长期目标</option><option value="context">背景</option><option value="boundary">边界</option>
            </select>
            <input value={memoryText} onChange={(event) => setMemoryText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addMemory(); }} placeholder="例如：我不喜欢太正式的回复" maxLength={240} />
            <button onClick={addMemory} disabled={!memoryText.trim()}>记住</button>
            <label className="settings-memory-context-option"><input type="checkbox" checked={memoryUseInChat} onChange={(event) => setMemoryUseInChat(event.target.checked)} /><span>允许这条记忆进入对话上下文</span></label>
          </div>
          {memoryError && <p className="settings-memory-error">{memoryError}</p>}
          <div className="settings-memory-list">
            {memories.map((item) => <article key={item.id} className={item.is_frozen ? 'is-frozen' : ''}>
              <div className="settings-memory-item-main">
                <div className="settings-memory-item-meta"><span>{memoryLabel(item.category)}</span><em>{item.is_frozen ? '已冻结' : item.use_in_chat ? '用于对话' : '不进入对话'}</em></div>
                {editingMemoryId === item.id ? <div className="settings-memory-editor"><select value={memoryDraftCategory} onChange={(event) => setMemoryDraftCategory(event.target.value as CompanionMemory['category'])}><option value="preference">偏好</option><option value="goal">长期目标</option><option value="context">背景</option><option value="boundary">边界</option></select><textarea value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} maxLength={240} autoFocus /></div> : <p>{item.content}</p>}
              </div>
              <div className="settings-memory-item-controls">
                {editingMemoryId === item.id ? <><button className="is-primary" onClick={() => saveMemoryEdit(item)} disabled={!memoryDraft.trim()}>保存</button><button onClick={() => setEditingMemoryId(null)}>取消</button></> : <button onClick={() => beginMemoryEdit(item)}>编辑</button>}
                <button onClick={() => changeMemory(item.id, { use_in_chat: !item.use_in_chat })} disabled={item.is_frozen}>{item.use_in_chat ? '退出对话' : '用于对话'}</button>
                <button onClick={() => changeMemory(item.id, { is_frozen: !item.is_frozen })}>{item.is_frozen ? '重新启用' : '冻结'}</button>
                <button className="is-danger" onClick={() => removeMemory(item.id)}>删除</button>
              </div>
            </article>)}
            {!memories.length && <div className="settings-memory-empty">还没有长期记忆。只有你主动添加的内容才会出现在这里。</div>}
          </div>
        </FrostedCard>

        <FrostedCard className="settings-data-archive" style={{ padding: 22 }}>
          <div className="settings-archive-heading">
            <div>
              <span>CLOUD DATA</span>
              <h3>数据与聊天归档</h3>
              <p>聊天会自动保存到云端，重新打开或换设备也会接着显示；断网时保留本机缓存。Todo、日程和占卜结果由电脑在两端共享。</p>
            </div>
            <button type="button" onClick={downloadChatArchive} className="settings-archive-button">导出聊天记录</button>
          </div>
          {archiveStatus && <p className="settings-archive-status">{archiveStatus}</p>}
        </FrostedCard>

      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function memoryLabel(category: CompanionMemory['category']) {
  return { preference: '偏好', goal: '目标', context: '背景', boundary: '边界' }[category];
}

const pageStyle: React.CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 };
const titleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-lg)', margin: 0 };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' };
const sectionTitleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-base)', margin: '0 0 16px' };
const formStyle: React.CSSProperties = { display: 'grid', gap: 12 };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', minWidth: 0 };
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 };
const fourColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 };
const inputStyle: React.CSSProperties = { padding: '9px 11px', background: 'rgba(255,255,255,0.72)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-main)', outline: 'none', minWidth: 0 };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 86, resize: 'vertical' };
const checkboxStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-main)', fontSize: 'var(--font-size-sm)' };
const primaryButtonStyle: React.CSSProperties = { padding: '10px 16px', borderRadius: 8, background: 'var(--primary-blue)', color: 'white', fontWeight: 700 };

export default SettingsView;
