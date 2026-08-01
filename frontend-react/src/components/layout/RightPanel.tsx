import { useEffect, useMemo, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import { getProfile, getSavedDailyFortune, getSchedule, getTodos } from '../../api/client';
import type { DailyFortuneResult } from '../../api/client';
import type { ScheduleEvent, TodoItem, UserProfile } from '../../types';
import './RightPanel.css';

const FORTUNE_CACHE_KEY = 'firefly:fortune-results:v1';
type FortuneTool = 'bazi' | 'tarot' | 'yijing';

function today() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function minutesNow() { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); }
function toMinutes(value: string) { if (!value) return null; const [hour, minute] = value.split(':').map(Number); return Number.isFinite(hour + minute) ? hour * 60 + minute : null; }
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }

function getStatus(events: ScheduleEvent[]) {
  const now = minutesNow();
  const timed = events.map((event) => ({ event, start: toMinutes(event.start_time), end: toMinutes(event.end_time) })).filter((item) => item.start !== null).sort((a,b) => (a.start || 0) - (b.start || 0));
  const current = timed.find((item) => (item.start || 0) <= now && now <= (item.end ?? (item.start || 0) + 60));
  if (current) return `进行中：${current.event.title}`;
  const next = timed.find((item) => (item.start || 0) > now);
  if (next) return `下一项：${next.event.start_time} ${next.event.title}`;
  return events.length ? '今日日程已排完' : '暂无日程';
}

function readFortuneCache(): Partial<Record<FortuneTool, unknown>> {
  try {
    const payload = asRecord(JSON.parse(window.localStorage.getItem(FORTUNE_CACHE_KEY) || '{}'));
    if (payload?.date !== today()) return {};
    const results = asRecord(payload.results);
    return { bazi: results?.bazi, tarot: results?.tarot, yijing: results?.yijing };
  } catch { return {}; }
}

function RightPanel({ mode = 'productivity', onOpenDaily }: {
  mode?: 'home' | 'productivity' | 'fortune';
  onOpenDaily?: () => void;
}) {
  return mode === 'fortune' ? <FortunePanel /> : <ProductivityPanel showDaily={mode === 'home'} onOpenDaily={onOpenDaily} />;
}

function ProductivityPanel({ showDaily, onOpenDaily }: { showDaily: boolean; onOpenDaily?: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [daily, setDaily] = useState<DailyFortuneResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [profileData, todoData, scheduleData] = await Promise.all([getProfile(), getTodos(), getSchedule()]);
        setProfile(profileData as UserProfile);
        setTodos((todoData as { items: TodoItem[] }).items);
        setSchedule((scheduleData as { items: ScheduleEvent[] }).items);
        setError('');
      } catch (err) { setError(err instanceof Error ? err.message : '状态加载失败'); }
    };
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showDaily) return;
    let mounted = true;
    const loadDaily = () => getSavedDailyFortune()
      .then((payload) => { if (mounted) setDaily(payload.result); })
      .catch(() => {});
    const handleUpdate = (event: Event) => {
      const detail = asRecord((event as CustomEvent).detail);
      const results = asRecord(detail?.results);
      if (results?.daily) setDaily(results.daily as DailyFortuneResult);
    };
    loadDaily();
    window.addEventListener('firefly:fortune-results-updated', handleUpdate);
    return () => { mounted = false; window.removeEventListener('firefly:fortune-results-updated', handleUpdate); };
  }, [showDaily]);

  const stats = useMemo(() => {
    const todayIso = today();
    const activeTodos = todos.filter((todo) => !todo.done);
    const todayTodos = todos.filter((todo) => todo.due_date === todayIso);
    const todayEvents = schedule.filter((event) => event.date === todayIso);
    const done = todayTodos.filter((todo) => todo.done).length + todayEvents.filter((event) => event.done).length;
    const total = todayTodos.length + todayEvents.length;
    return { active: activeTodos.length, events: todayEvents.length, done, total, progress: total ? Math.round(done / total * 100) : 0, status: getStatus(todayEvents) };
  }, [schedule, todos]);

  const dailySeed = asRecord(daily?.seed);
  const dailyEnergy = Number(dailySeed?.energy || 0);

  return (
    <aside className="right-panel">
      <div className="right-panel-inner">
        <FrostedCard className="panel-card panel-card--hero">
          <div className="panel-eyebrow"><span className="panel-eyebrow-dot" /> TODAY</div>
          <h3 className="panel-hero-title">今日主线</h3>
          <p className="panel-card-text panel-goal-text">{profile?.current_goals?.trim() || '先把主线任务推进一小步'}</p>
          <div className={`panel-status-chip${error ? ' panel-status-chip--error' : ''}`}><span className="panel-status-dot" /><span>{error || stats.status}</span></div>
        </FrostedCard>
        <div className="panel-metrics">
          <FrostedCard className="panel-card panel-card--metric"><div className="panel-metric-label"><span>✓</span> 待办</div><p className="panel-card-number">{stats.active}</p><p className="panel-card-hint">件仍待推进</p></FrostedCard>
          <FrostedCard className="panel-card panel-card--metric"><div className="panel-metric-label"><span>⌁</span> 日程</div><p className="panel-card-number">{stats.events}</p><p className="panel-card-hint">个时间段</p></FrostedCard>
        </div>
        <FrostedCard className="panel-card panel-card--progress"><div className="panel-progress-head"><h3 className="panel-card-title">今日进度</h3><span className="panel-progress-value">{stats.progress}%</span></div><div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${stats.progress}%` }} /></div><p className="panel-card-hint">{stats.total ? `${stats.done} / ${stats.total} 已完成` : '还没有安排，给今天留一点期待。'}</p></FrostedCard>
        {showDaily && (
          <button className="home-daily-card" onClick={onOpenDaily} aria-label="打开每日运势">
            <div className="home-daily-head"><span>✦ 每日占卜</span><small>查看完整解读 →</small></div>
            <div className="home-daily-body">
              <div className="home-daily-energy" style={{ '--home-energy': `${dailyEnergy * 3.6}deg` } as React.CSSProperties}><span>{dailyEnergy || '—'}</span></div>
              <div><small>今日关键词</small><strong>{String(dailySeed?.keyword || '点击展开')}</strong></div>
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}

function FortunePanel() {
  const [daily, setDaily] = useState<DailyFortuneResult | null>(null);
  const [saved, setSaved] = useState<Partial<Record<FortuneTool, unknown>>>(() => readFortuneCache());

  useEffect(() => {
    let mounted = true;
    const loadDaily = () => getSavedDailyFortune().then((payload) => { if (mounted) setDaily(payload.result); }).catch(() => {});
    const handleUpdate = (event: Event) => {
      setSaved(readFortuneCache());
      const detail = asRecord((event as CustomEvent).detail);
      const results = asRecord(detail?.results);
      const nextDaily = results?.daily;
      if (nextDaily) setDaily(nextDaily as DailyFortuneResult);
    };
    loadDaily();
    window.addEventListener('firefly:fortune-results-updated', handleUpdate);
    const interval = window.setInterval(loadDaily, 30_000);
    return () => { mounted = false; window.clearInterval(interval); window.removeEventListener('firefly:fortune-results-updated', handleUpdate); };
  }, []);

  const dailySeed = asRecord(daily?.seed);
  const bazi = asRecord(saved.bazi);
  const tarot = asRecord(saved.tarot);
  const yijing = asRecord(saved.yijing);
  const cards = Array.isArray(tarot?.cards) ? tarot.cards.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const gua = asRecord(yijing?.gua);
  const mainGua = asRecord(gua?.main_hexagram);
  const changedGua = asRecord(gua?.changed_hexagram);
  const lines = Array.isArray(gua?.lines) ? gua.lines.map(Number) : [];

  return (
    <aside className="right-panel right-panel--fortune">
      <div className="right-panel-inner fortune-panel-inner">
        <section className="fortune-panel-intro">
          <div><span>今日占卜</span><h3>灵感留痕</h3><p>结果会保留到明天或下次覆盖。</p></div>
          <img src="./assets/oracle-firefly-daily.png" alt="流萤" />
        </section>

        <section className="fortune-daily-card">
          <div className="fortune-energy" style={{ '--panel-energy': `${Number(dailySeed?.energy || 0) * 3.6}deg` } as React.CSSProperties}><span>{String(dailySeed?.energy || '—')}</span></div>
          <div><small>今日关键词</small><strong>{String(dailySeed?.keyword || '等待展开')}</strong><p>{String(dailySeed?.focus || '生成每日运势后，会在这里留下今天的主线。')}</p></div>
        </section>

        <FortuneTrace mark="命" title="近期风向" ready={Boolean(bazi)}>
          {bazi ? <><strong>{String(bazi.period || '近期')}</strong><p>{extractSnippet(bazi.answer) || `${String(bazi.focus || '综合')}趋势已保存`}</p></> : <p>八字趋势尚未生成</p>}
        </FortuneTrace>

        <FortuneTrace mark="星" title="今日牌面" ready={cards.length > 0}>
          {cards.length ? <div className="fortune-card-list">{cards.slice(0,3).map((card,index) => <span key={index}><i>{index + 1}</i><b>{String(card.card || '未知')}</b><small>{String(card.orientation || '')}</small></span>)}</div> : <p>抽牌后，三张牌会留在这里</p>}
        </FortuneTrace>

        <FortuneTrace mark="卦" title="卦象变化" ready={Boolean(gua)}>
          {gua ? <div className="fortune-gua"><MiniHexagram lines={lines} /><div><small>本卦</small><strong>{String(mainGua?.name || '—')}</strong><span>→</span><small>变卦</small><strong>{String(changedGua?.name || '—')}</strong></div></div> : <p>起卦后，本卦与变卦会留在这里</p>}
        </FortuneTrace>

        <p className="fortune-panel-note">只保留解读摘要，不显示个人资料或命盘档案。</p>
      </div>
    </aside>
  );
}

function FortuneTrace({ mark, title, ready, children }: { mark: string; title: string; ready: boolean; children: React.ReactNode }) {
  return <section className={`fortune-trace${ready ? ' is-ready' : ''}`}><header><span>{mark}</span><div><small>{ready ? '今日线索' : '尚未展开'}</small><h4>{title}</h4></div></header><div className="fortune-trace-body">{children}</div></section>;
}

function MiniHexagram({ lines }: { lines: number[] }) {
  return <div className="fortune-mini-gua">{[...lines].reverse().map((line,index) => <i key={index} className={line === 6 || line === 8 ? 'is-yin' : ''} />)}</div>;
}

function extractSnippet(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.split('\n').map((line) => line.replace(/^[#*\s]+|【.+?】/g, '').trim()).find((line) => line.length > 12)?.slice(0, 62) || '';
}

export default RightPanel;
