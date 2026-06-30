import { useEffect, useMemo, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { getDailyFortune, getProfile, postBaziAnalyze, postBaziAsk, postBaziChart, postTarot, postYijing } from '../../api/client';
import type { BirthInfo, UserProfile } from '../../types';

type ToolId = 'bazi' | 'tarot' | 'yijing' | 'daily';

function buildBirthInfo(profile: UserProfile | null): BirthInfo | null {
  if (!profile?.birth_year || !profile.birth_month || !profile.birth_day || profile.birth_hour === null || profile.birth_hour === undefined) {
    return null;
  }
  return {
    name: profile.nickname || 'Pilgrim',
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

function ToolsView() {
  const [active, setActive] = useState<ToolId>('bazi');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [focus, setFocus] = useState('综合');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile().then((data) => setProfile(data as UserProfile)).catch(() => {});
  }, []);

  const birthInfo = useMemo(() => buildBirthInfo(profile), [profile]);

  const run = async (action: 'chart' | 'analyze' | 'ask' | 'tarot' | 'yijing' | 'daily') => {
    setLoading(true);
    setError('');
    try {
      let data: unknown;
      if (action === 'chart') {
        if (!birthInfo) throw new Error('先在设置里补全出生年月日时。');
        data = await postBaziChart(birthInfo);
      } else if (action === 'analyze') {
        if (!birthInfo) throw new Error('先在设置里补全出生年月日时。');
        data = await postBaziAnalyze({ ...birthInfo, focus });
      } else if (action === 'ask') {
        if (!birthInfo) throw new Error('先在设置里补全出生年月日时。');
        if (!question.trim()) throw new Error('先写一个追问。');
        data = await postBaziAsk({ birth_info: birthInfo, question: question.trim(), focus });
      } else if (action === 'tarot') {
        if (!question.trim()) throw new Error('先写一个问题。');
        data = await postTarot(question.trim());
      } else if (action === 'yijing') {
        if (!question.trim()) throw new Error('先写一个问题。');
        data = await postYijing(question.trim());
      } else {
        data = await getDailyFortune();
      }
      setResult(formatResult(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : '调用失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>工具</h2>
          <p style={hintStyle}>八字本地排盘，解读和其他占卜会调用 DeepSeek。</p>
        </div>
        <div style={tabsStyle}>
          {[
            ['bazi', '八字'],
            ['tarot', '塔罗'],
            ['yijing', '易经'],
            ['daily', '每日'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => { setActive(id as ToolId); setResult(''); setError(''); }} style={active === id ? activeTabStyle : tabStyle}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={gridStyle}>
        <FrostedCard style={{ padding: 20 }}>
          {active === 'bazi' && (
            <div style={formStyle}>
              <div style={statusStyle}>{birthInfo ? '已读取个人档案出生信息' : '出生信息未补全'}</div>
              <label style={fieldStyle}>
                <span>关注方向</span>
                <select value={focus} onChange={(e) => setFocus(e.target.value)} style={inputStyle}>
                  {['综合', '学业', '竞赛', '项目', '事业', '感情', '人际', '状态'].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label style={fieldStyle}>
                <span>八字追问</span>
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} style={textareaStyle} placeholder="例如：我最近做项目应该注意什么？" />
              </label>
              <div style={buttonRowStyle}>
                <button onClick={() => run('chart')} style={secondaryButtonStyle} disabled={loading}>排盘</button>
                <button onClick={() => run('analyze')} style={primaryButtonStyle} disabled={loading}>解读</button>
                <button onClick={() => run('ask')} style={primaryButtonStyle} disabled={loading}>追问</button>
              </div>
            </div>
          )}

          {active === 'tarot' && (
            <QuestionTool
              title="三张式塔罗"
              value={question}
              onChange={setQuestion}
              placeholder="写一个具体问题，比如：这个项目下一步怎么推进？"
              loading={loading}
              onRun={() => run('tarot')}
            />
          )}

          {active === 'yijing' && (
            <QuestionTool
              title="易经起卦"
              value={question}
              onChange={setQuestion}
              placeholder="写一个要问的现实问题。"
              loading={loading}
              onRun={() => run('yijing')}
            />
          )}

          {active === 'daily' && (
            <div style={formStyle}>
              <h3 style={panelTitleStyle}>每日运势</h3>
              <p style={hintStyle}>基于当天日期生成参考，不替代现实判断。</p>
              <button onClick={() => run('daily')} style={primaryButtonStyle} disabled={loading}>生成今日参考</button>
            </div>
          )}
        </FrostedCard>

        <FrostedCard style={{ padding: 20, minHeight: 360 }}>
          <h3 style={panelTitleStyle}>结果</h3>
          {loading && <p style={hintStyle}>Firefly 正在处理...</p>}
          {error && <p style={errorStyle}>{error}</p>}
          {!loading && !error && !result && <p style={hintStyle}>选择一个工具，然后点按钮。</p>}
          {result && <pre style={resultStyle}>{result}</pre>}
        </FrostedCard>
      </div>
    </div>
  );
}

function QuestionTool({
  title,
  value,
  onChange,
  placeholder,
  loading,
  onRun,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <div style={formStyle}>
      <h3 style={panelTitleStyle}>{title}</h3>
      <label style={fieldStyle}>
        <span>问题</span>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} style={textareaStyle} placeholder={placeholder} />
      </label>
      <button onClick={onRun} style={primaryButtonStyle} disabled={loading}>开始</button>
    </div>
  );
}

function formatResult(data: unknown) {
  if (!data || typeof data !== 'object') return String(data);
  const obj = data as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof obj.answer === 'string') parts.push(obj.answer);
  if (obj.chart) parts.push(`\n排盘数据：\n${JSON.stringify(obj.chart, null, 2)}`);
  if (obj.cards) parts.push(`\n牌面：\n${JSON.stringify(obj.cards, null, 2)}`);
  if (obj.gua) parts.push(`\n卦象：\n${JSON.stringify(obj.gua, null, 2)}`);
  if (obj.seed) parts.push(`\n生成依据：\n${JSON.stringify(obj.seed, null, 2)}`);
  return parts.length ? parts.join('\n') : JSON.stringify(data, null, 2);
}

const pageStyle: React.CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 };
const titleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-lg)', margin: 0 };
const hintStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: '6px 0 0', lineHeight: 1.5 };
const tabsStyle: React.CSSProperties = { display: 'flex', padding: 3, border: '1px solid var(--glass-border)', borderRadius: 8, background: 'rgba(246,252,255,0.65)' };
const tabStyle: React.CSSProperties = { padding: '7px 12px', color: 'var(--text-muted)', borderRadius: 6, fontSize: 'var(--font-size-sm)' };
const activeTabStyle: React.CSSProperties = { ...tabStyle, background: 'var(--primary-cyan)', color: 'var(--deep-blue)', fontWeight: 700 };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', gap: 16, alignItems: 'start' };
const formStyle: React.CSSProperties = { display: 'grid', gap: 12 };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' };
const inputStyle: React.CSSProperties = { padding: '9px 11px', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-main)', background: 'rgba(255,255,255,0.72)', outline: 'none' };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 110, resize: 'vertical' };
const buttonRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const primaryButtonStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, background: 'var(--primary-blue)', color: 'white', fontWeight: 700 };
const secondaryButtonStyle: React.CSSProperties = { ...primaryButtonStyle, background: 'var(--mint)', color: 'var(--deep-blue)' };
const statusStyle: React.CSSProperties = { padding: 10, borderRadius: 8, background: 'rgba(117,220,232,0.16)', color: 'var(--text-main)', fontSize: 'var(--font-size-sm)' };
const panelTitleStyle: React.CSSProperties = { color: 'var(--text-main)', fontSize: 'var(--font-size-base)', margin: 0 };
const errorStyle: React.CSSProperties = { color: '#b42318', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 };
const resultStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-main)', fontSize: 'var(--font-size-sm)', lineHeight: 1.65, fontFamily: 'var(--font-family)', margin: 0 };

export default ToolsView;
