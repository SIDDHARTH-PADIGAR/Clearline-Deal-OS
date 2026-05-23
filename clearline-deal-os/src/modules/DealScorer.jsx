import { useState } from 'react';
import Tooltip from '../components/shared/Tooltip';
import sectorMapping from '../data/sector_mapping.json';
import benchmarks from '../data/damodaran_benchmarks_2025.json';

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
    if (s.includes('food') || s.includes('beverage') || s.includes('drink') || s.includes('soft drink')) category = 'Food Processing';
    else if (/\bit\b/.test(s) || s.includes('technology') || s.includes('software') || s.includes('saas')) category = 'Software (System & Application)';
    else if (s.includes('facilities') || s.includes('cleaning') || s.includes('fm') || s.includes('facility management')) category = 'Business & Consumer Services';
    else if (s.includes('itad') || s.includes('recycling') || s.includes('disposal') || s.includes('waste')) category = 'Environmental & Waste Services';
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

// Bridge helper — reads from new nested schema with flat fallback
function b(brief) {
  const fin = brief.financials || {};
  const deal = brief.deal || {};
  const co = brief.company || {};
  return {
    revenue:               fin.revenue              ?? parseNum(brief.revenue_ttm) ?? parseNum(brief.revenue),
    ebitda:                fin.ebitda_adjusted      ?? parseNum(brief.ebitda_ttm) ?? parseNum(brief.ebitda_estimated),
    ebitda_margin:         fin.ebitda_margin_pct    ?? parseNum(brief.ebitda_margin),
    asking_price:          deal.asking_price        ?? parseNum(brief.asking_price),
    asking_multiple:       deal.asking_ebitda_multiple ?? parseNum(brief.asking_ebitda_multiple),
    recurring_revenue_pct: deal.recurring_revenue_pct ?? parseNum(brief.recurring_revenue_pct),
    sector:                co.sector                ?? brief.sector,
  };
}

function BenchmarkRow({ label, dealValue, median, unit = '', higherIsBetter = true, note }) {
  if (dealValue == null || median == null) return null;
  const outperforms = higherIsBetter ? dealValue > median * 1.1 : dealValue < median * 0.9;
  const inline = higherIsBetter
    ? dealValue >= median * 0.9 && dealValue <= median * 1.1
    : dealValue >= median * 0.9 && dealValue <= median * 1.1;
  const color = outperforms ? 'var(--green)' : inline ? 'var(--amber)' : 'var(--red)';
  const assessment = outperforms
    ? (higherIsBetter ? 'Above sector median' : 'Better than sector median')
    : inline
    ? 'In line with sector median'
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

export default function DealScorer({ currentDeal, setActive }) {
  if (!currentDeal || !currentDeal.brief) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◎</div>
        <div className="empty-text mb-20">Analyze an IM first</div>
        <button className="btn btn-primary" onClick={() => setActive('im')}>Go to IM Analyzer</button>
      </div>
    );
  }

  const { brief, score } = currentDeal;
  // Use _scores from new extraction pipeline, fall back to brief.scores for old deals
  const s = brief._scores || brief.scores || {};
  const bd = b(brief);

  // Calculate dynamic asking multiple and score
  const ebitda = bd.ebitda;
  const askingPrice = bd.asking_price;
  const revenue = bd.revenue;
  
  let dynamicAskingMultiple = bd.asking_multiple;
  if (dynamicAskingMultiple == null && askingPrice != null && ebitda != null && ebitda > 0) {
    dynamicAskingMultiple = parseFloat((askingPrice / ebitda).toFixed(2));
  }
  
  let explicitAskingScore = s.asking_multiple_score || 0;
  if (dynamicAskingMultiple != null) {
      if (dynamicAskingMultiple < 5) explicitAskingScore = 90;
      else if (dynamicAskingMultiple <= 7) explicitAskingScore = 75;
      else if (dynamicAskingMultiple <= 9) explicitAskingScore = 55;
      else if (dynamicAskingMultiple <= 12) explicitAskingScore = 30;
      else explicitAskingScore = 10;
  }

  let dynamicEbitdaMargin = bd.ebitda_margin;
  // Fix 2: Recalculate EBITDA margin if INR auto-normalisation or warning occurred
  if ((bd.detected_currency === 'INR' || brief.extraction_warning) && ebitda != null && revenue != null && revenue > 0) {
    dynamicEbitdaMargin = parseFloat(((ebitda / revenue) * 100).toFixed(2));
  }

  const bm = getBenchmark(bd.sector);

  let explicitEbitdaScore = s.ebitda_quality || 0;
  if (dynamicEbitdaMargin != null && bm && bm.ebitda_margin_median != null) {
    // Scoring rubric against sector median
    const ratio = dynamicEbitdaMargin / bm.ebitda_margin_median;
    const diff = dynamicEbitdaMargin - bm.ebitda_margin_median;
    if (ratio >= 1.2) explicitEbitdaScore = 90;
    else if (ratio >= 0.95) explicitEbitdaScore = 80;
    else if (dynamicEbitdaMargin >= 7 && dynamicEbitdaMargin <= 12 && bm.ebitda_margin_median >= 11 && bm.ebitda_margin_median <= 15) explicitEbitdaScore = 55;
    else if (diff >= -5 || ratio >= 0.7) explicitEbitdaScore = 55;
    else if (ratio >= 0.5) explicitEbitdaScore = 40;
    else explicitEbitdaScore = 20;
  } else if (dynamicEbitdaMargin != null && (bd.detected_currency === 'INR' || brief.extraction_warning)) {
    // Fallback recalculation without benchmark
    explicitEbitdaScore = dynamicEbitdaMargin > 20 ? 85 : dynamicEbitdaMargin > 12 ? 65 : 40;
  }

  const recalculatedScore = Math.round(
    ((s.sector_fit || 0) * 0.20) +
    (explicitEbitdaScore * 0.20) +
    ((s.revenue_durability || 0) * 0.15) +
    ((s.management_dependency || 0) * 0.15) +
    ((s.rollup_potential || 0) * 0.15) +
    (explicitAskingScore * 0.15)
  );

  const criteria = [
    { label: 'Sector fit (B2B Services)', val: s.sector_fit || 0, weight: '20%' },
    { label: 'EBITDA quality & margins',  val: explicitEbitdaScore, weight: '20%' },
    { label: 'Revenue durability',        val: s.revenue_durability || 0, weight: '15%' },
    { label: 'Low owner-dependency',      val: s.management_dependency || 0, weight: '15%' },
    { label: 'Roll-up synergy potential', val: s.rollup_potential || 0, weight: '15%' },
    { label: 'Valuation (asking multiple)',val: explicitAskingScore, weight: '15%' },
  ];

  const getScoreColor = (val) => val >= 75 ? 'var(--green)' : val >= 55 ? 'var(--amber)' : 'var(--red)';
  const badgeClass = recalculatedScore >= 75 ? 'badge-green' : recalculatedScore >= 55 ? 'badge-amber' : 'badge-red';
  const badgeText  = recalculatedScore >= 75 ? 'Strong Fit' : recalculatedScore >= 55 ? 'Conditional Fit' : 'Poor Fit';

  // Benchmark data
  const dealMultiple   = dynamicAskingMultiple;
  const dealMargin     = bd.ebitda_margin;
  const dealRevGrowth  = parseNum(brief.revenue_trend === 'growing' ? null : null); // trend only

  let privateRangeLow = null, privateRangeHigh = null;
  if (bm) {
    const disc = bm.private_sme_discount_pct / 100;
    privateRangeLow  = +(bm.ev_ebitda_median * (1 - (disc + 0.05))).toFixed(1);
    privateRangeHigh = +(bm.ev_ebitda_median * (1 - (disc - 0.05))).toFixed(1);
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="flex justify-between items-center mb-20" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
          <div>
            <div className="serif" style={{ fontSize: '18px', marginBottom: '8px' }}>{currentDeal.name}</div>
            <span className={`badge ${badgeClass}`}>{badgeText}</span>
            {bd.sector && <span className="mono muted" style={{ fontSize: '10px', marginLeft: '10px' }}>{bd.sector}</span>}
          </div>
          <div className="mono amber" style={{ fontSize: '40px', fontWeight: '500', lineHeight: 1 }}>{recalculatedScore}</div>
        </div>

        <div className="flex-col gap-16 mb-20">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-16">
              <div style={{ width: '240px', fontSize: '13px' }}>{c.label}</div>
              <div style={{ flex: 1, height: '6px', background: 'var(--navy4)', borderRadius: '3px', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: '3px', width: `${c.val}%`, backgroundColor: getScoreColor(c.val) }} />
              </div>
              <div className="mono" style={{ width: '60px', textAlign: 'right', fontSize: '14px' }}>{c.val}<span className="muted" style={{ fontSize: '10px' }}>/100</span></div>
              <div className="mono muted" style={{ width: '40px', textAlign: 'right', fontSize: '10px' }}>{c.weight}</div>
            </div>
          ))}
        </div>

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center' }}>Analyst Notes<Tooltip text="Pre-filled from the IM. Edit to add your own read." /></label>
          <textarea defaultValue={brief.qualitative?.summary_paragraph || brief.fit_summary} />
        </div>

        <div className="mt-20">
          <button className="btn btn-primary" onClick={() => setActive('memo')}>Generate Decision Brief →</button>
        </div>
      </div>

      {/* Sector Benchmarks */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Sector Benchmarks</div>
          {bm && <div className="mono muted" style={{ fontSize: '10px' }}>{bm.category}</div>}
        </div>

        {!bm ? (
          <div className="muted mono" style={{ fontSize: '11px', padding: '20px 0', color: 'var(--amber)' }}>
            Sector '{bd.sector || '(unknown)'}' not mapped — benchmarks unavailable. Add to sector_mapping.json to enable.
          </div>
        ) : (
          <>
            {/* EV/EBITDA row — lower is better for buyer */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 160px', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em' }}>EV/EBITDA MULTIPLE</div>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--text)' }}>{dealMultiple != null ? `${dealMultiple}x (asking)` : 'N/A'}</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>DEAL (ASKING)</div>
              </div>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--muted)' }}>{bm.ev_ebitda_median}x public · {privateRangeLow}–{privateRangeHigh}x private range</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>SECTOR MEDIAN (PUBLIC → PRIVATE)</div>
              </div>
              <div>
                {dealMultiple != null && (() => {
                  const vs = dealMultiple < privateRangeLow
                    ? { text: 'Discount to private comps', color: 'var(--green)' }
                    : dealMultiple <= privateRangeHigh
                    ? { text: 'In private market range', color: 'var(--amber)' }
                    : { text: 'Premium to private comps', color: 'var(--red)' };
                  return <>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: vs.color, fontWeight: 500 }}>{vs.text}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>vs {privateRangeLow}–{privateRangeHigh}x range</div>
                  </>;
                })()}
              </div>
            </div>

            <BenchmarkRow
              label="EBITDA MARGIN"
              dealValue={dealMargin}
              median={bm.ebitda_margin_median}
              unit="%"
              higherIsBetter={true}
            />

            <BenchmarkRow
              label="REV GROWTH (SECTOR MEDIAN)"
              dealValue={bm.revenue_growth_median}
              median={bm.revenue_growth_median}
              unit="%"
              note="Market context only"
            />

            <div style={{ marginTop: '14px', fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
              Source: {bm.source}. Private SME discount of {bm.private_sme_discount_pct}% applied to derive private market range.
              These benchmarks are indicative. Verify against live transaction comps before making investment decisions.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
