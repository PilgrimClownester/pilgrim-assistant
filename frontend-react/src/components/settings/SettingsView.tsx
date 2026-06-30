import { useEffect, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { getProfile, saveProfile } from '../../api/client';
import type { UserProfile } from '../../types';

function toNumberOrNull(value: string) {
  return value === '' ? null : Number(value);
}

function SettingsView() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => setProfile(data as UserProfile))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    await saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key: keyof UserProfile, value: string | number | boolean | null) => {
    setProfile((current) => current ? { ...current, [key]: value } : current);
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>加载中...</div>;
  if (!profile) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>无法加载档案</div>;

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>设置</h2>
        <button onClick={handleSave} style={primaryButtonStyle}>{saved ? '已保存' : '保存档案'}</button>
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
