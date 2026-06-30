import { useState } from 'react';
import Tooltip from '../components/shared/Tooltip';
import sectorMapping from '../data/sector_mapping.json';
import benchmarks from '../data/damodaran_benchmarks_2025.json';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

// ─── Benchmark lookup ─────────────────────────────────────────────────────────
function getBenchmark(sector) {
  if (!sector || sector === 'N/A') return null;
  const s = sector.toLowerCase();
  const keys = Object.keys(sectorMapping);
  let category = sectorMapping[sector] ||
    (() => {
      let key = keys.find(k => k.toLowerCase() === s);
      if (key) return sectorMapping[key];
      key = keys.find(k => s.includes(k.toLowerCase()) || k.toLowerCase().includes(s));
      return key ? sectorMapping[key] : null;
    })();
  if (!category) {
    if (s.includes('food') || s.includes('beverage')) category = 'Food Processing';
    else if (/\bit\b/.test(s) || s.includes('technology') || s.includes('software') || s.includes('saas')) category = 'Software (System & Application)';
    else if (s.includes('facilities') || s.includes('cleaning') || s.includes('fm')) category = 'Business & Consumer Services';
    else if (s.includes('itad') || s.includes('recycling') || s.includes('waste')) category = 'Environmental & Waste Services';
    else if (s.includes('healthcare') || s.includes('medical') || s.includes('dental')) category = 'Healthcare Support Services';
  }
  if (!category) return null;
  const bm = benchmarks[category];
  return bm ? { ...bm, category } : null;
}

function parseNum(val) {
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

// Bridge helper
function b(brief) {
  const fin = brief.financials || {};
  const deal = brief.deal || {};
  const co = brief.company || {};
  return {
    revenue:               fin.revenue              ?? parseNum(brief.revenue_ttm) ?? parseNum(brief.revenue),
    ebitda:                fin.ebitda_adjusted      ?? parseNum(brief.ebitda_ttm)  ?? parseNum(brief.ebitda_estimated),
    ebitda_margin:         fin.ebitda_margin_pct    ?? parseNum(brief.ebitda_margin),
    asking_price:          deal.asking_price        ?? parseNum(brief.asking_price),
    asking_multiple:       deal.asking_ebitda_multiple ?? parseNum(brief.asking_ebitda_multiple),
    recurring_revenue_pct: deal.recurring_revenue_pct ?? parseNum(brief.recurring_revenue_pct),
    sector:                co.sector                ?? brief.sector,
    detected_currency:     brief.detected_currency  ?? brief.detectedCurrency,
  };
}

// ─── Benchmark row sub-component ─────────────────────────────────────────────
function BenchmarkRow({ label, dealValue, median, unit = '', higherIsBetter = true, note }) {
  if (dealValue == null || median == null) return null;
  const outperforms = higherIsBetter ? dealValue > median * 1.1 : dealValue < median * 0.9;
  const inline = dealValue >= median * 0.9 && dealValue <= median * 1.1;
  const color = outperforms ? 'var(--green)' : inline ? 'var(--amber)' : 'var(--red)';
  const assessment = outperforms
    ? (higherIsBetter ? 'Above sector median' : 'Better than sector median')
    : inline ? 'In line with sector median'
    : (higherIsBetter ? 'Below sector median' : 'Above sector — monitor');
  const diff = higherIsBetter
    ? ((dealValue - median) / median * 100).toFixed(1)
    : ((median - dealValue) / median * 100).toFixed(1);
  const sign = parseFloat(diff) >= 0 ? '+' : '';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 160px', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em' }}>{label}</div>
      <div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--text)' }}>{dealValue}{unit}</div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>DEAL</div>
      </div>
      <div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--muted)' }}>{median}{unit}</div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>SECTOR MEDIAN</div>
      </div>
      <div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color, fontWeight: 500 }}>{sign}{diff}pp{note ? ` — ${note}` : ''}</div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color }}>{assessment}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DealScorer({ currentDeal, setActive }) {
  if (!currentDeal || !currentDeal.brief) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◎</div>
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: '22px', color: 'var(--amber)', marginBottom: '8px' }}>Deal Score</div>
        <div className="empty-text mb-20">Upload and analyse an IM first to generate a score.</div>
        <button className="btn btn-primary" onClick={() => setActive('im')}>Go to Analyse a Deal →</button>
      </div>
    );
  }

  const { brief } = currentDeal;
  const s = brief._scores || brief.scores || {};
  const bd = b(brief);

  // ── Computed values ──────────────────────────────────────────────────────────
  const ebitda      = bd.ebitda;
  const askingPrice = bd.asking_price;
  const revenue     = bd.revenue;

  let askingMultiple = bd.asking_multiple;
  if (askingMultiple == null && askingPrice != null && ebitda != null && ebitda > 0) {
    askingMultiple = parseFloat((askingPrice / ebitda).toFixed(2));
  }

  let askingScore = s.asking_multiple_score || 0;
  if (askingMultiple != null) {
    if (askingMultiple < 5)       askingScore = 90;
    else if (askingMultiple <= 7) askingScore = 75;
    else if (askingMultiple <= 9) askingScore = 55;
    else if (askingMultiple <= 12)askingScore = 30;
    else                          askingScore = 10;
  }

  let ebitdaMargin = bd.ebitda_margin;
  if ((bd.detected_currency === 'INR' || brief.extraction_warning) && ebitda != null && revenue != null && revenue > 0) {
    ebitdaMargin = parseFloat(((ebitda / revenue) * 100).toFixed(2));
  }

  const bm = getBenchmark(bd.sector);

  let ebitdaScore = s.ebitda_quality || 0;
  if (ebitdaMargin != null && bm?.ebitda_margin_median != null) {
    const ratio = ebitdaMargin / bm.ebitda_margin_median;
    const diff  = ebitdaMargin - bm.ebitda_margin_median;
    if (ratio >= 1.2)      ebitdaScore = 90;
    else if (ratio >= 0.95) ebitdaScore = 80;
    else if (diff >= -5 || ratio >= 0.7) ebitdaScore = 55;
    else if (ratio >= 0.5) ebitdaScore = 40;
    else                   ebitdaScore = 20;
  } else if (ebitdaMargin != null && (bd.detected_currency === 'INR' || brief.extraction_warning)) {
    ebitdaScore = ebitdaMargin > 20 ? 85 : ebitdaMargin > 12 ? 65 : 40;
  }

  const totalScore = Math.round(
    ((s.sector_fit          || 0) * 0.20) +
    (ebitdaScore              * 0.20) +
    ((s.revenue_durability  || 0) * 0.15) +
    ((s.management_dependency || 0) * 0.15) +
    ((s.rollup_potential    || 0) * 0.15) +
    (askingScore              * 0.15)
  );

  // ── Benchmark range ──────────────────────────────────────────────────────────
  let privateRangeLow = null, privateRangeHigh = null;
  if (bm) {
    const disc = bm.private_sme_discount_pct / 100;
    privateRangeLow  = +(bm.ev_ebitda_median * (1 - (disc + 0.05))).toFixed(1);
    privateRangeHigh = +(bm.ev_ebitda_median * (1 - (disc - 0.05))).toFixed(1);
  }

  // ── Criteria + chart ─────────────────────────────────────────────────────────
  const criteria = [
    { label: 'Sector fit',         val: s.sector_fit           || 0, weight: '20%' },
    { label: 'EBITDA quality',     val: ebitdaScore,                 weight: '20%' },
    { label: 'Revenue durability', val: s.revenue_durability   || 0, weight: '15%' },
    { label: 'Owner independence', val: s.management_dependency|| 0, weight: '15%' },
    { label: 'Roll-up potential',  val: s.rollup_potential     || 0, weight: '15%' },
    { label: 'Valuation',          val: askingScore,                 weight: '15%' },
  ];

  const chartData = criteria.map(c => ({ subject: c.label, A: c.val, fullMark: 100 }));

  const badgeClass = totalScore >= 75 ? 'badge-green' : totalScore >= 55 ? 'badge-amber' : 'badge-red';
  const badgeText  = totalScore >= 75 ? 'Strong Fit'  : totalScore >= 55 ? 'Conditional Fit' : 'Poor Fit';

  // Strongest and weakest — safely handled
  const sorted   = [...criteria].sort((a, b) => b.val - a.val);
  const strongest = sorted[0];
  const weakest   = sorted[sorted.length - 1];

  const insights = {
    'Sector fit':         { top: 'This business operates in a highly attractive B2B services niche with strong underlying demand.', bottom: 'Sector fit is weak — ensure the business model strictly aligns with B2B services before proceeding.' },
    'EBITDA quality':     { top: 'Earnings quality is strong — margins are high and add-backs appear defensible.', bottom: 'Margin quality needs scrutiny — request a full EBITDA bridge and verify all owner add-backs in DD.' },
    'Revenue durability': { top: 'Revenue is sticky and well-diversified across a strong customer base.', bottom: 'Revenue concentration or churn risk is elevated — focus DD on contract terms and customer retention.' },
    'Owner independence': { top: 'The business runs independently of the founder — strong management team in place.', bottom: 'Significant owner dependency — require a structured transition period or key-person insurance in the SPA.' },
    'Roll-up potential':  { top: 'Clear platform potential with identifiable bolt-on acquisition targets.', bottom: 'Limited roll-up optionality in this sector — standalone value creation strategy may be more appropriate.' },
    'Valuation':          { top: 'The asking multiple is attractive relative to private market benchmarks.', bottom: 'Asking price is stretched — use the valuation output to anchor a negotiated offer.' },
  };

  const getInsight = (label, type) => insights[label]?.[type] || '';

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* ── Score badge ─────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
          {currentDeal.name}{bd.sector ? ` · ${bd.sector}` : ''}
        </div>
        <span className={`badge ${badgeClass}`} style={{ fontSize: '20px', padding: '10px 24px' }}>
          {badgeText} — {totalScore} / 100
        </span>
      </div>

      {/* ── Radar chart ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '16px', padding: '28px' }}>
        <div style={{ width: '100%', height: '380px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
                tickFormatter={(v, i) => `${v} (${chartData[i].A})`}
              />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Score" dataKey="A" stroke="var(--amber)" fill="var(--amber)" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Strongest / Weakest */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '14px', background: 'rgba(34,197,94,0.05)', borderRadius: '4px', borderLeft: '3px solid var(--green)' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--green)', letterSpacing: '0.08em', marginBottom: '6px' }}>
              STRONGEST · {strongest.label.toUpperCase()} ({strongest.val})
            </div>
            <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', lineHeight: 1.6, color: 'var(--text)' }}>
              {getInsight(strongest.label, 'top')}
            </div>
          </div>
          <div style={{ padding: '14px', background: 'rgba(239,68,68,0.05)', borderRadius: '4px', borderLeft: '3px solid var(--red)' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--red)', letterSpacing: '0.08em', marginBottom: '6px' }}>
              WEAKEST · {weakest.label.toUpperCase()} ({weakest.val})
            </div>
            <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', lineHeight: 1.6, color: 'var(--text)' }}>
              {getInsight(weakest.label, 'bottom')}
            </div>
          </div>
        </div>

        {/* Analyst notes */}
        <div className="field" style={{ marginTop: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Analyst Notes
            <Tooltip text="Pre-filled from the IM. Edit to add your own read." />
          </label>
          <textarea defaultValue={brief.qualitative?.summary_paragraph || brief.fit_summary || ''} rows={3} />
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={() => setActive('memo')}>Generate Decision Brief →</button>
          <button className="btn btn-outline"  onClick={() => setActive('valuation')}>View Valuation →</button>
        </div>
      </div>

      {/* ── Sector benchmarks ───────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Sector Benchmarks</div>
          {bm && <div className="mono muted" style={{ fontSize: '10px' }}>{bm.category}</div>}
        </div>

        {!bm ? (
          <div className="mono" style={{ fontSize: '11px', padding: '20px 0', color: 'var(--amber)' }}>
            Sector '{bd.sector || '(unknown)'}' not in benchmark database — add it to sector_mapping.json to enable.
          </div>
        ) : (
          <>
            {/* EV/EBITDA row */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 160px', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em' }}>EV/EBITDA MULTIPLE</div>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--text)' }}>{askingMultiple != null ? `${askingMultiple}x (asking)` : 'N/A'}</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>DEAL (ASKING)</div>
              </div>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--muted)' }}>{bm.ev_ebitda_median}x public · {privateRangeLow}–{privateRangeHigh}x private range</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>SECTOR MEDIAN (PUBLIC → PRIVATE)</div>
              </div>
              <div>
                {askingMultiple != null && (() => {
                  const vs = askingMultiple < privateRangeLow
                    ? { text: 'Discount to private comps', color: 'var(--green)' }
                    : askingMultiple <= privateRangeHigh
                    ? { text: 'In private market range',  color: 'var(--amber)' }
                    : { text: 'Premium to private comps', color: 'var(--red)' };
                  return <>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: vs.color, fontWeight: 500 }}>{vs.text}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>vs {privateRangeLow}–{privateRangeHigh}x range</div>
                  </>;
                })()}
              </div>
            </div>

            <BenchmarkRow label="EBITDA MARGIN" dealValue={ebitdaMargin} median={bm.ebitda_margin_median} unit="%" higherIsBetter={true} />
            <BenchmarkRow label="REV GROWTH (SECTOR MEDIAN)" dealValue={bm.revenue_growth_median} median={bm.revenue_growth_median} unit="%" note="Market context only" />

            <div style={{ marginTop: '14px', fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
              Source: {bm.source}. Private SME discount of {bm.private_sme_discount_pct}% applied to derive private market range.
              Benchmarks are indicative — verify against live transaction comps before making investment decisions.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
