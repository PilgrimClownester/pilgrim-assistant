import './BaziChartView.css';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const STEM_ELEMENTS: Record<string, string> = {
  甲: '阳木', 乙: '阴木', 丙: '阳火', 丁: '阴火', 戊: '阳土', 己: '阴土', 庚: '阳金', 辛: '阴金', 壬: '阳水', 癸: '阴水',
};
const ELEMENT_ORDER = ['木', '火', '土', '金', '水'] as const;
const ELEMENT_SLUGS: Record<(typeof ELEMENT_ORDER)[number], string> = { 木: 'wood', 火: 'fire', 土: 'earth', 金: 'metal', 水: 'water' };

export default function BaziChartView({ chart }: { chart: unknown }) {
  if (!chart || typeof chart !== 'object') return <pre className="bazi-archive-raw">{JSON.stringify(chart, null, 2)}</pre>;
  const data = chart as Record<string, unknown>;
  const profile = asRecord(data.profile);
  const pillars = asRecord(data.pillars);
  const shiShen = asRecord(data.shi_shen);
  const wuxing = asRecord(data.wuxing);
  const daYun = Array.isArray(data.da_yun) ? data.da_yun.map(asRecord).filter(Boolean) : [];
  const liuNian = Array.isArray(data.liu_nian) ? data.liu_nian.map(asRecord).filter(Boolean) : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
  const dayMaster = typeof data.day_master === 'string' ? data.day_master : '—';
  const currentYear = new Date().getFullYear();
  const definitions = [
    { key: 'year', label: '年柱', relation: 'year_stem' },
    { key: 'month', label: '月柱', relation: 'month_stem' },
    { key: 'day', label: '日柱', relation: 'day_stem' },
    { key: 'hour', label: '时柱', relation: 'hour_stem' },
  ];
  const maxElement = Math.max(1, ...ELEMENT_ORDER.map((item) => Number(wuxing?.[item]) || 0));

  return (
    <div className="bazi-archive-chart">
      <section className="bazi-chart-hero">
        <div>
          <span className="bazi-chart-kicker">DAY MASTER</span>
          <div className="bazi-day-master"><b>{dayMaster}</b><span>日主 · {STEM_ELEMENTS[dayMaster] || '未知'}</span></div>
        </div>
        <div className="bazi-chart-profile">
          <strong>{String(profile?.name || '命主')}</strong>
          <span>{String(profile?.solar_datetime || '')}</span>
          <span>{String(profile?.lunar_date || '')}</span>
          <span>{String(profile?.birth_place || '')}</span>
        </div>
      </section>

      <section className="bazi-chart-section">
        <ChartHeading number="01" title="四柱命盘" hint="天干在上，地支在下" />
        <div className="bazi-pillars">
          {definitions.map((item) => {
            const ganZhi = String(pillars?.[item.key] || '——');
            return (
              <div key={item.key} className={`bazi-pillar${item.key === 'day' ? ' bazi-pillar--day' : ''}`}>
                <span className="bazi-pillar-label">{item.label}</span>
                <span className="bazi-pillar-relation">{String(shiShen?.[item.relation] || '—')}</span>
                <strong>{ganZhi.slice(0, 1)}</strong><strong>{ganZhi.slice(1, 2)}</strong>
                {item.key === 'day' && <em>日主</em>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="bazi-overview-grid">
        <section className="bazi-chart-section">
          <ChartHeading number="02" title="五行分布" />
          <div className="bazi-elements">
            {ELEMENT_ORDER.map((element) => {
              const count = Number(wuxing?.[element]) || 0;
              return (
                <div key={element} className="bazi-element-row">
                  <span className={`bazi-element bazi-element--${ELEMENT_SLUGS[element]}`}>{element}</span>
                  <div className="bazi-element-track"><i style={{ width: `${(count / maxElement) * 100}%` }} /></div><b>{count}</b>
                </div>
              );
            })}
          </div>
        </section>
        <section className="bazi-chart-section">
          <ChartHeading number="03" title="天干十神" />
          <div className="bazi-relations">
            {definitions.map((item) => <span key={item.key}><small>{item.label}</small>{String(shiShen?.[item.relation] || '—')}</span>)}
          </div>
          {typeof shiShen?.note === 'string' && <p className="bazi-section-note">{shiShen.note}</p>}
        </section>
      </div>

      {daYun.length > 0 && (
        <section className="bazi-chart-section">
          <ChartHeading number="04" title="大运" hint="当前阶段已高亮" />
          <div className="bazi-luck-timeline">
            {daYun.map((item, index) => {
              const startYear = Number(item?.start_year) || 0;
              const endYear = Number(item?.end_year) || 0;
              const current = startYear <= currentYear && currentYear <= endYear;
              return (
                <div key={`${startYear}-${index}`} className={`bazi-luck-item${current ? ' is-current' : ''}`}>
                  <span>{Number(item?.start_age) || 0}–{Number(item?.end_age) || 0} 岁</span>
                  <strong>{String(item?.gan_zhi || '—')}</strong><small>{startYear}–{endYear}</small>
                  {current && <em>当前</em>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {liuNian.length > 0 && (
        <section className="bazi-chart-section">
          <ChartHeading number="05" title="近年流年" />
          <div className="bazi-year-list">
            {liuNian.map((item, index) => {
              const year = Number(item?.year) || 0;
              return <span key={`${year}-${index}`} className={year === currentYear ? 'is-current' : ''}><b>{year}</b>{String(item?.gan_zhi || '—')}</span>;
            })}
          </div>
        </section>
      )}

      {warnings.length > 0 && <section className="bazi-chart-notes"><strong>计算说明</strong>{warnings.map((item, index) => <p key={index}>· {item}</p>)}</section>}
      <details className="bazi-raw-details"><summary>查看原始排盘数据</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>
    </div>
  );
}

function ChartHeading({ number, title, hint }: { number: string; title: string; hint?: string }) {
  return <div className="bazi-section-heading"><div><span>{number}</span><h4>{title}</h4></div>{hint && <p>{hint}</p>}</div>;
}
