import { useEffect, useMemo, useState } from 'react';
import FrostedCard from '../shared/FrostedCard';
import {
  getDailyFortune,
  getProfile,
  getSavedDailyFortune,
  getSavedFortuneResults,
  postBaziAnalyze,
  postTarot,
  postYijing,
  syncFortuneResults,
} from '../../api/client';
import type { FortuneSyncEntry } from '../../api/client';
import type { BirthInfo, UserProfile } from '../../types';
import './ToolsView.css';

type ToolId = 'daily' | 'bazi' | 'tarot' | 'yijing';
type BaziPeriod = '近7天' | '本月' | '未来3个月';
type QuestionToolId = 'tarot' | 'yijing';

const FORTUNE_CACHE_KEY = 'firefly:fortune-results:v1';
const EMPTY_RESULTS: Record<ToolId, unknown | null> = { daily: null, bazi: null, tarot: null, yijing: null };
const EMPTY_LOADING: Record<ToolId, boolean> = { daily: false, bazi: false, tarot: false, yijing: false };
const EMPTY_ERRORS: Record<ToolId, string> = { daily: '', bazi: '', tarot: '', yijing: '' };

const TOOL_META: Record<ToolId, { label: string; mark: string; title: string; description: string }> = {
  daily: { label: '每日', mark: '日', title: '今日运势', description: '给今天一条清晰、轻盈的行动线索。' },
  bazi: { label: '八字', mark: '命', title: '近期运势', description: '以已保存的命盘为依据，看看一段时间里的节奏与侧重点。' },
  tarot: { label: '塔罗', mark: '星', title: '三张牌阵', description: '让过去、当下与下一步，为一个具体问题提供新视角。' },
  yijing: { label: '易经', mark: '卦', title: '观象问事', description: '从本卦到变卦，观察局势正在怎样流动。' },
};

const TAROT_PROMPTS = ['最近的选择该如何推进？', '我忽略了什么重要信号？', '这段关系需要怎样调整？'];
const YIJING_PROMPTS = ['眼前这件事适合继续推进吗？', '当前局面最重要的转折在哪里？', '我应该守住什么、改变什么？'];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadCachedResults(dateKey: string): Partial<Record<ToolId, unknown>> {
  try {
    const raw = window.localStorage.getItem(FORTUNE_CACHE_KEY);
    if (!raw) return {};
    const payload = JSON.parse(raw) as { date?: unknown; results?: unknown };
    if (payload.date !== dateKey || !payload.results || typeof payload.results !== 'object') {
      window.localStorage.removeItem(FORTUNE_CACHE_KEY);
      return {};
    }
    const saved = payload.results as Record<string, unknown>;
    return { bazi: saved.bazi ?? null, tarot: saved.tarot ?? null, yijing: saved.yijing ?? null };
  } catch {
    return {};
  }
}

function cachedEntriesForMigration(dateKey: string): FortuneSyncEntry[] {
  const cached = loadCachedResults(dateKey);
  return (['bazi', 'tarot', 'yijing'] as const).flatMap((tool) => {
    const result = cached[tool];
    if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
    return [{ tool, date: dateKey, result: result as Record<string, unknown>, updated_at: `${dateKey}T00:00:00Z` }];
  });
}

function entriesToResults(entries: FortuneSyncEntry[]): Partial<Record<ToolId, unknown>> {
  return Object.fromEntries(entries.map((entry) => [entry.tool, entry.result])) as Partial<Record<ToolId, unknown>>;
}

function buildBirthInfo(profile: UserProfile | null): BirthInfo | null {
  if (!profile?.birth_year || !profile.birth_month || !profile.birth_day || profile.birth_hour === null || profile.birth_hour === undefined) {
    return null;
  }
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

function ToolsView() {
  const [active, setActive] = useState<ToolId>('daily');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [focus, setFocus] = useState('综合');
  const [period, setPeriod] = useState<BaziPeriod>('近7天');
  const [questions, setQuestions] = useState<Record<QuestionToolId, string>>({ tarot: '', yijing: '' });
  const [cacheDate, setCacheDate] = useState(() => localDateKey());
  const [results, setResults] = useState<Record<ToolId, unknown | null>>(() => ({
    ...EMPTY_RESULTS,
    ...loadCachedResults(localDateKey()),
  }));
  const [loadingByTool, setLoadingByTool] = useState<Record<ToolId, boolean>>({ ...EMPTY_LOADING });
  const [errorsByTool, setErrorsByTool] = useState<Record<ToolId, string>>({ ...EMPTY_ERRORS });
  const [dailySaved, setDailySaved] = useState(false);
  const [dailyDate, setDailyDate] = useState('');

  useEffect(() => {
    getProfile().then((data) => setProfile(data as UserProfile)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const migrateAndLoad = async () => {
      try {
        const legacyEntries = cachedEntriesForMigration(cacheDate);
        const payload = legacyEntries.length
          ? await syncFortuneResults(legacyEntries)
          : await getSavedFortuneResults();
        if (!cancelled && payload.date === cacheDate) {
          setResults((current) => ({ ...current, ...entriesToResults(payload.entries) }));
        }
      } catch {
        // 电脑暂时离线时继续使用当前设备上的结果，恢复后会再次同步。
      }
    };
    const refresh = async () => {
      try {
        const payload = await getSavedFortuneResults();
        if (!cancelled && payload.date === cacheDate) {
          setResults((current) => ({ ...current, ...entriesToResults(payload.entries) }));
        }
      } catch { /* 保留已有结果 */ }
    };
    migrateAndLoad();
    const timer = window.setInterval(refresh, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cacheDate]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FORTUNE_CACHE_KEY, JSON.stringify({
        version: 1,
        date: cacheDate,
        results: { bazi: results.bazi, tarot: results.tarot, yijing: results.yijing },
      }));
    } catch {
      // 本地存储不可用时仍保留当前会话结果。
    }
    window.dispatchEvent(new CustomEvent('firefly:fortune-results-updated', {
      detail: { date: cacheDate, results },
    }));
  }, [cacheDate, results]);

  useEffect(() => {
    const checkDate = () => {
      const today = localDateKey();
      if (today === cacheDate) return;
      setCacheDate(today);
      setResults({ ...EMPTY_RESULTS });
      setErrorsByTool({ ...EMPTY_ERRORS });
      setDailySaved(false);
      setDailyDate(today);
    };
    checkDate();
    const timer = window.setInterval(checkDate, 60_000);
    return () => window.clearInterval(timer);
  }, [cacheDate]);

  useEffect(() => {
    if (active !== 'daily') return;
    let cancelled = false;
    setLoadingByTool((current) => ({ ...current, daily: true }));
    setErrorsByTool((current) => ({ ...current, daily: '' }));
    getSavedDailyFortune()
      .then((payload) => {
        if (cancelled) return;
        setDailyDate(payload.date);
        setDailySaved(payload.available);
        setResults((current) => ({ ...current, daily: payload.result }));
      })
      .catch((err) => {
        if (!cancelled) setErrorsByTool((current) => ({ ...current, daily: err instanceof Error ? err.message : '读取今日运势失败' }));
      })
      .finally(() => {
        if (!cancelled) setLoadingByTool((current) => ({ ...current, daily: false }));
      });
    return () => { cancelled = true; };
  }, [active, cacheDate]);

  const birthInfo = useMemo(() => buildBirthInfo(profile), [profile]);

  const switchTool = (id: ToolId) => {
    if (active === id) return;
    setActive(id);
  };

  const run = async (action: ToolId) => {
    setLoadingByTool((current) => ({ ...current, [action]: true }));
    setErrorsByTool((current) => ({ ...current, [action]: '' }));
    try {
      let data: unknown;
      if (action === 'daily') {
        data = await getDailyFortune();
        setDailySaved(true);
      } else if (action === 'bazi') {
        if (!birthInfo) throw new Error('八字档案尚未完善，请先到设置中补全出生年月日时。');
        data = await postBaziAnalyze({ ...birthInfo, focus, period });
      } else if (action === 'tarot') {
        if (!questions.tarot.trim()) throw new Error('先写下一个想厘清的问题。');
        data = await postTarot(questions.tarot.trim());
      } else {
        if (!questions.yijing.trim()) throw new Error('先写下一个想观察的现实问题。');
        data = await postYijing(questions.yijing.trim());
      }
      setResults((current) => ({ ...current, [action]: data }));
    } catch (err) {
      setErrorsByTool((current) => ({ ...current, [action]: err instanceof Error ? err.message : '生成失败，请稍后再试。' }));
    } finally {
      setLoadingByTool((current) => ({ ...current, [action]: false }));
    }
  };

  const meta = TOOL_META[active];
  const result = results[active];
  const loading = loadingByTool[active];
  const error = errorsByTool[active];
  return (
    <main className={`oracle-page oracle-page--${active}`}>
      <header className="oracle-header">
        <div className="oracle-heading">
          <span className="oracle-eyebrow">流萤的灵感小屋 ✦</span>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
        <nav className="oracle-tabs" aria-label="运势工具">
          {(Object.keys(TOOL_META) as ToolId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`oracle-tab${active === id ? ' is-active' : ''}`}
              onClick={() => switchTool(id)}
              aria-current={active === id ? 'page' : undefined}
            >
              <span>{TOOL_META[id].mark}</span>
              {TOOL_META[id].label}
            </button>
          ))}
        </nav>
      </header>

      <section className="oracle-workspace">
        <FrostedCard className="oracle-control-card">
          {active === 'daily' && (
            <DailyControl
              date={dailyDate}
              saved={dailySaved}
              loading={loading}
              onRun={() => run('daily')}
            />
          )}
          {active === 'bazi' && (
            <BaziControl
              ready={Boolean(birthInfo)}
              focus={focus}
              period={period}
              loading={loading}
              onFocus={setFocus}
              onPeriod={setPeriod}
              onRun={() => run('bazi')}
            />
          )}
          {active === 'tarot' && (
            <QuestionControl
              type="tarot"
              value={questions.tarot}
              loading={loading}
              prompts={TAROT_PROMPTS}
              onChange={(value) => setQuestions((current) => ({ ...current, tarot: value }))}
              onRun={() => run('tarot')}
            />
          )}
          {active === 'yijing' && (
            <QuestionControl
              type="yijing"
              value={questions.yijing}
              loading={loading}
              prompts={YIJING_PROMPTS}
              onChange={(value) => setQuestions((current) => ({ ...current, yijing: value }))}
              onRun={() => run('yijing')}
            />
          )}
        </FrostedCard>

        <FrostedCard className="oracle-result-card">
          <ResultHeading active={active} period={period} result={result} />
          {loading && <LoadingState active={active} />}
          {error && <div className="oracle-error"><span>!</span><p>{error}</p></div>}
          {!loading && !error && result === null && <EmptyState active={active} ready={Boolean(birthInfo)} />}
          {!loading && !error && result !== null && <ResultView data={result} active={active} period={period} />}
        </FrostedCard>
      </section>
    </main>
  );
}

function DailyControl({ date, saved, loading, onRun }: { date: string; saved: boolean; loading: boolean; onRun: () => void }) {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = today.toLocaleDateString('zh-CN', { month: 'long' });
  const weekday = today.toLocaleDateString('zh-CN', { weekday: 'long' });
  return (
    <div className="daily-control">
      <div className="daily-scene">
        <ThemeMascot theme="daily" />
        <div className="daily-date-orbit" aria-hidden="true">
          <i />
          <div><strong>{day}</strong><span>{month}</span></div>
        </div>
      </div>
      <div className="daily-intro">
        <span>{weekday} · {date || today.toISOString().slice(0, 10)}</span>
        <h3>{saved ? '今天的提示已经点亮' : '为今天抽取一份提示'}</h3>
        <p>{saved ? '内容只在当天生成一次，回来时会继续为你保留。' : '它不是结论，只是帮你看清今天该把力气放在哪里。'}</p>
      </div>
      <button className="oracle-primary daily-primary" onClick={onRun} disabled={loading || saved}>
        <span>{saved ? '今日已生成' : loading ? '正在点亮…' : '生成今日运势'}</span>
        <b aria-hidden="true">→</b>
      </button>
      <p className="oracle-privacy-note">当天仅生成一次，并在电脑与手机之间共享。</p>
    </div>
  );
}

function BaziControl({ ready, focus, period, loading, onFocus, onPeriod, onRun }: {
  ready: boolean;
  focus: string;
  period: BaziPeriod;
  loading: boolean;
  onFocus: (value: string) => void;
  onPeriod: (value: BaziPeriod) => void;
  onRun: () => void;
}) {
  const focusItems = ['综合', '学业', '事业', '感情', '人际', '状态'];
  return (
    <div className="bazi-forecast-control">
      <ThemeMascot theme="bazi" />
      <div className={`archive-status${ready ? ' is-ready' : ''}`}>
        <span aria-hidden="true">{ready ? '✓' : '·'}</span>
        <div>
          <strong>{ready ? '八字档案已就绪' : '八字档案尚未完善'}</strong>
          <p>{ready ? '本页只读取档案作为推测依据，不显示个人资料。' : '请前往设置补全资料，命盘也会保存在那里。'}</p>
        </div>
      </div>
      <fieldset className="choice-field">
        <legend>想看多长时间</legend>
        <div className="period-options">
          {(['近7天', '本月', '未来3个月'] as BaziPeriod[]).map((item) => (
            <button key={item} type="button" className={period === item ? 'is-selected' : ''} onClick={() => onPeriod(item)}>{item}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="choice-field">
        <legend>重点关注</legend>
        <div className="focus-options">
          {focusItems.map((item) => (
            <button key={item} type="button" className={focus === item ? 'is-selected' : ''} onClick={() => onFocus(item)}>{item}</button>
          ))}
        </div>
      </fieldset>
      <button className="oracle-primary bazi-primary" onClick={onRun} disabled={loading || !ready}>
        <span>{loading ? '正在推演…' : `查看${period}运势`}</span><b aria-hidden="true">→</b>
      </button>
      <p className="oracle-privacy-note">命盘属于长期档案，可在设置中主动查看。</p>
    </div>
  );
}

function QuestionControl({ type, value, loading, prompts, onChange, onRun }: {
  type: 'tarot' | 'yijing';
  value: string;
  loading: boolean;
  prompts: string[];
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <div className={`question-control question-control--${type}`}>
      <ThemeMascot theme={type} />
      <div className="question-copy">
        <span>{type === 'tarot' ? '先在心里停留片刻' : '一事一问，问得越清楚，看到的变化越具体'}</span>
        <h3>{type === 'tarot' ? '写下此刻最想厘清的问题' : '把眼前的局面写下来'}</h3>
      </div>
      <label className="oracle-question-field">
        <span className="sr-only">问题</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={type === 'tarot' ? '例如：这个项目接下来该把重心放在哪里？' : '例如：目前的合作局面，我应该如何推进？'}
        />
        <small>{value.length}/120</small>
      </label>
      <div className="prompt-chips">
        {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onChange(prompt)}>{prompt}</button>)}
      </div>
      <button className="oracle-primary" onClick={onRun} disabled={loading || !value.trim()}>
        <span>{loading ? (type === 'tarot' ? '正在洗牌…' : '正在起卦…') : (type === 'tarot' ? '抽取三张牌' : '起卦观象')}</span><b aria-hidden="true">→</b>
      </button>
    </div>
  );
}

function ThemeMascot({ theme }: { theme: ToolId }) {
  const copy: Record<ToolId, string> = {
    daily: '早呀，今天也一起慢慢点亮。',
    bazi: '不翻档案，只看这段时间的风向。',
    tarot: '想好问题了吗？牌已经替你摆好啦。',
    yijing: '先坐稳，我们慢慢看局势怎么动。',
  };
  return (
    <div className={`theme-mascot theme-mascot--${theme}`}>
      <span>{copy[theme]}</span>
      <img src={`./assets/oracle-firefly-${theme}.png`} alt={`流萤的${TOOL_META[theme].label}主题装扮`} />
    </div>
  );
}

function ResultHeading({ active, period, result }: { active: ToolId; period: BaziPeriod; result: unknown | null }) {
  const hasResult = result !== null;
  const savedPeriod = asRecord(result)?.period;
  const titles: Record<ToolId, string> = {
    daily: '今天的展开',
    bazi: `${typeof savedPeriod === 'string' ? savedPeriod : period}趋势`,
    tarot: '牌面解读',
    yijing: '卦象解读',
  };
  const note = hasResult
    ? active === 'daily'
      ? '今天的线索'
      : active === 'bazi'
        ? '近期趋势 · 不展示个人资料'
        : '再次生成会覆盖当前结果'
    : active === 'bazi'
      ? '不展示个人资料'
      : '仅作自我观察参考';
  return (
    <div className="oracle-result-heading">
      <div><span>{hasResult ? '流萤已经看完啦' : '等一束灵感落下来'}</span><h3>{titles[active]}</h3></div>
      <em>{note}</em>
    </div>
  );
}

function LoadingState({ active }: { active: ToolId }) {
  const text: Record<ToolId, string> = { daily: '正在整理今天的线索…', bazi: '正在推演这段时间的趋势…', tarot: '正在翻开牌面…', yijing: '正在观察卦象变化…' };
  return <div className="oracle-loading"><span><i /></span><p>{text[active]}</p></div>;
}

function EmptyState({ active, ready }: { active: ToolId; ready: boolean }) {
  const content: Record<ToolId, { mark: string; title: string; text: string }> = {
    daily: { mark: '日', title: '今天尚未展开', text: '生成后，这里会呈现今日关键词、整体状态与具体行动建议。' },
    bazi: { mark: '命', title: ready ? '选择时间，查看趋势' : '等待八字档案', text: ready ? '这里展示的是近期推测；长期命盘已移至设置。' : '完善档案后即可生成近 7 天、本月或未来 3 个月的运势。' },
    tarot: { mark: '✦', title: '牌仍覆在桌面上', text: '专注于一个具体问题，三张牌会分别照见来处、当下与趋向。' },
    yijing: { mark: '☷', title: '静待一问', text: '写下一个现实问题，再从本卦、动爻与变卦中观察变化。' },
  };
  const item = content[active];
  return <div className={`oracle-empty oracle-empty--${active}`}><span>{item.mark}</span><h4>{item.title}</h4><p>{item.text}</p></div>;
}

function ResultView({ data, active, period }: { data: unknown; active: ToolId; period: BaziPeriod }) {
  if (!data || typeof data !== 'object') return <div className="reading-body"><p>{String(data)}</p></div>;
  const obj = data as Record<string, unknown>;
  const sections = parseAnswerSections(typeof obj.answer === 'string' ? obj.answer : '');
  const visibleSections = active === 'daily'
    ? sections.filter((section) => section.title !== '今日关键词')
    : sections;
  return (
    <div className={`reading-result reading-result--${active}`}>
      {(active === 'tarot' || active === 'yijing') && typeof obj.question === 'string' && (
        <div className="reading-question"><span>你问</span><strong>{obj.question}</strong></div>
      )}
      {active === 'daily' && <DailySummary data={obj} />}
      {active === 'bazi' && <BaziTrendSummary data={obj} period={period} />}
      {active === 'tarot' && <CardsSummary cards={obj.cards} />}
      {active === 'yijing' && <GuaSummary gua={obj.gua} />}
      {visibleSections.length > 0
        ? <ReadingSections sections={visibleSections} active={active} />
        : <div className="reading-missing">这次没有生成可读内容，请稍后再试。</div>}
      <div className="reading-footnote">把它当作整理思路的一束光，现实选择仍由你决定。</div>
    </div>
  );
}

function ReadingSections({ sections, active }: {
  sections: { title: string; lines: string[] }[];
  active: ToolId;
}) {
  return (
    <div className="reading-body">
      {sections.map((section, index) => {
        const visual = getSectionVisual(section.title, index);
        return (
          <section key={`${section.title}-${index}`} className={`reading-section reading-section--${visual.tone}`}>
            <header>
              <span aria-hidden="true">{index === 0 ? TOOL_META[active].mark : visual.mark}</span>
              <div>
                <small>{index === 0 ? '这次的主线' : visual.kicker}</small>
                <h4>{section.title || `提示 ${index + 1}`}</h4>
              </div>
            </header>
            <div className="reading-section-copy">
              {section.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function getSectionVisual(title: string, index: number) {
  if (index === 0) return { tone: 'hero', mark: '✦', kicker: '这次的主线' };
  if (/一句话|一句提醒|给用户|给你/.test(title)) return { tone: 'quote', mark: '✦', kicker: '流萤想对你说' };
  if (/小心|避开|留意|误区|阻力|转折|风险/.test(title)) return { tone: 'warning', mark: '!', kicker: '先留意这里' };
  if (/行动|三步|做什么|推进|力量|建议|三件事|小动作|顺风/.test(title)) return { tone: 'action', mark: '→', kicker: '可以这样做' };
  if (/变化|方向|节奏|走势|趋势|阶段/.test(title)) return { tone: 'flow', mark: '≈', kicker: '正在发生的变化' };
  return { tone: 'insight', mark: '·', kicker: '再看深一点' };
}

function DailySummary({ data }: { data: Record<string, unknown> }) {
  const seed = asRecord(data.seed);
  const energy = typeof seed?.energy === 'number' ? seed.energy : 0;
  const yijing = asRecord(data.yijing);
  const main = asRecord(yijing?.main_hexagram);
  const changed = asRecord(yijing?.changed_hexagram);
  const lines = Array.isArray(yijing?.lines) ? yijing.lines.map(Number) : [];
  const moving = Array.isArray(yijing?.moving_lines) ? yijing.moving_lines.map(Number) : [];
  return (
    <div className="daily-summary">
      <div className="energy-ring" style={{ '--energy': `${energy * 3.6}deg` } as React.CSSProperties}>
        <span><b>{energy || '—'}</b><small>能量</small></span>
      </div>
      <div className="daily-keyword"><span>今日关键词</span><strong>{String(seed?.keyword || '顺势而行')}</strong><p>{String(seed?.focus || '把注意力交给真正重要的事')}</p></div>
      {yijing && <div className="daily-gua-brief">
        <HexagramFigure lines={lines} moving={moving} label="今日日卦" />
        <div><span>今日日卦</span><strong>{String(main?.name || '—')}{moving.length ? ` → ${String(changed?.name || '—')}` : ''}</strong><p>{moving.length ? `第 ${moving.join('、')} 爻动 · 观察变化中的落点` : '无动爻 · 先把当下走稳'}</p></div>
      </div>}
    </div>
  );
}

function BaziTrendSummary({ data, period }: { data: Record<string, unknown>; period: BaziPeriod }) {
  return (
    <div className="bazi-trend-summary">
      <span className="bazi-trend-mark">运</span>
      <div><small>观察范围</small><strong>{String(data.period || period)}</strong><p>{String(data.focus || '综合')} · 基于本地命盘生成，个人资料不在此页展示</p></div>
    </div>
  );
}

function CardsSummary({ cards }: { cards: unknown }) {
  if (!Array.isArray(cards)) return null;
  return (
    <div className="drawn-cards">
      {cards.map((card, index) => {
        const item = asRecord(card);
        if (!item) return null;
        const reversed = String(item.orientation || '').includes('逆');
        return (
          <article key={index} className={`drawn-card${reversed ? ' is-reversed' : ''}`}>
            <span>{String(item.position || `第${index + 1}张`)}</span>
            <div className="drawn-card-face">
              <i>{index === 1 ? '☾' : '✦'}</i>
              <b>{String(item.card || '未知')}</b>
              <em>{String(item.orientation || '')}</em>
            </div>
            {typeof item.meaning === 'string' && <p>{item.meaning}</p>}
          </article>
        );
      })}
    </div>
  );
}

function GuaSummary({ gua }: { gua: unknown }) {
  const data = asRecord(gua);
  if (!data) return null;
  const main = asRecord(data.main_hexagram);
  const changed = asRecord(data.changed_hexagram);
  const lines = Array.isArray(data.lines) ? data.lines.map(Number) : [];
  const moving = Array.isArray(data.moving_lines) ? data.moving_lines.map(Number) : [];
  const changedLines = Array.isArray(data.changed_lines)
    ? data.changed_lines.map(Number)
    : lines.map((line) => line === 6 ? 7 : line === 9 ? 8 : line);
  return (
    <div className="gua-summary">
      <div className="gua-panel gua-panel--main">
        <div className="gua-figure-wrap"><small>本卦 · 此刻</small><HexagramFigure lines={lines} moving={moving} label="本卦六爻" /></div>
        <div className="gua-name">
          <small>{String(main?.upper || '—')}上 · {String(main?.lower || '—')}下</small>
          <strong>{String(main?.name || '—')}</strong>
          <p>{String(main?.meaning || '')}</p>
          {moving.length > 0
            ? <em className="moving-lines">动爻：第 {moving.join('、')} 爻</em>
            : <em className="moving-lines moving-lines--still">无动爻 · 局势暂稳</em>}
        </div>
      </div>
      <span className="gua-change">→</span>
      <div className="gua-panel gua-panel--changed">
        <div className="gua-figure-wrap"><small>变卦 · 趋向</small><HexagramFigure lines={changedLines} moving={[]} label="变卦六爻" /></div>
        <div className="gua-name">
          <small>{String(changed?.upper || '—')}上 · {String(changed?.lower || '—')}下</small>
          <strong>{String(changed?.name || '—')}</strong>
          <p>{String(changed?.meaning || '')}</p>
        </div>
      </div>
    </div>
  );
}

function HexagramFigure({ lines, moving, label }: { lines: number[]; moving: number[]; label: string }) {
  return (
    <div className="result-hexagram" aria-label={label}>
      {[...lines].reverse().map((line, index) => {
        const originalPosition = lines.length - index;
        const yin = line === 6 || line === 8;
        return <i key={index} className={`${yin ? 'is-yin' : ''}${moving.includes(originalPosition) ? ' is-moving' : ''}`} />;
      })}
    </div>
  );
}

function parseAnswerSections(answer: string) {
  const lines = answer.split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((line) => !line.includes('不能当作绝对') && !line.includes('娱乐性与反思性参考'));
  const sections: { title: string; lines: string[] }[] = [];
  let current = { title: '', lines: [] as string[] };
  for (const line of lines) {
    const normalized = cleanMarkdown(line);
    const bracketTitle = normalized.match(/^【(.+?)】\s*(.*)$/);
    const colonTitle = normalized.match(/^([^：:]{2,14})[：:]\s*(.*)$/);
    if (bracketTitle || colonTitle) {
      if (current.title || current.lines.length) sections.push(current);
      current = { title: bracketTitle?.[1] || colonTitle?.[1] || '', lines: [] };
      const rest = bracketTitle?.[2] || colonTitle?.[2];
      if (rest) current.lines.push(cleanAnswerLine(rest));
    } else {
      current.lines.push(cleanAnswerLine(normalized));
    }
  }
  if (current.title || current.lines.length) sections.push(current);
  return sections.filter((section) => section.lines.length > 0);
}

function cleanAnswerLine(line: string) {
  return cleanMarkdown(line).replace(/^[-*]\s*/, '').replace(/^\d+[.、]\s*/, '').trim();
}

function cleanMarkdown(line: string) {
  return line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export default ToolsView;
