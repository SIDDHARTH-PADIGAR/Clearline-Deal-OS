import sectorMapping from '../data/sector_mapping.json';
import benchmarks from '../data/damodaran_benchmarks_2025.json';
import geoConfig from '../data/geography_config.json';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ReferenceLine, Scatter } from 'recharts';

function parseNum(val) {
  if (val == null || val === 'N/A') return null;
  if (typeof val === 'number') return val;
  const str = String(val).toUpperCase();
  const cleaned = str.replace(/[^0-9.-]/g, '');
  let n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  if (str.includes('M') || str.includes('MILLION')) n *= 1000000;
  else if (str.includes('K') || str.includes('THOUSAND')) n *= 1000;
  return n;
}

function formatINR(value) {
  if (value === null || value === undefined) return '—';
  const crore = value / 10000000;
  if (crore >= 1) return '₹' + crore.toFixed(2) + ' Cr';
  const lakh = value / 100000;
  if (lakh >= 1) return '₹' + lakh.toFixed(2) + ' L';
  return '₹' + value.toLocaleString('en-IN');
}

function formatCurrency(val, sym = '£') {
  if (val == null || typeof val !== 'number' || isNaN(val)) return `${sym}—`;
  if (sym === '₹') return formatINR(val);
  if (Math.abs(val) >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(2)}M`;
  return `${sym}${Math.round(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getBenchmark(sector) {
  if (!sector || sector === 'N/A') return null;
  const s = sector.toLowerCase();
  
  const keys = Object.keys(sectorMapping);
  
  const category = sectorMapping[sector] ||
    (() => {
      let key = keys.find(k => k.toLowerCase() === s);
      if (key) return sectorMapping[key];
      key = keys.find(k => s.includes(k.toLowerCase()) || k.toLowerCase().includes(s));
      return key ? sectorMapping[key] : null;
    })();
    
  let finalCategory = category;
  if (!finalCategory) {
    if (s.includes('food') || s.includes('beverage') || s.includes('drink') || s.includes('soft drink')) finalCategory = 'Food Processing';
    else if (/\bit\b/.test(s) || s.includes('technology') || s.includes('software') || s.includes('saas')) finalCategory = 'Software (System & Application)';
    else if (s.includes('facilities') || s.includes('cleaning') || s.includes('fm') || s.includes('facility management')) finalCategory = 'Business & Consumer Services';
    else if (s.includes('itad') || s.includes('recycling') || s.includes('disposal') || s.includes('waste')) finalCategory = 'Environmental & Waste Services';
    else if (s.includes('healthcare') || s.includes('medical') || s.includes('dental')) finalCategory = 'Healthcare Support Services';
  }

  if (!finalCategory) return null;
  const bm = benchmarks[finalCategory];
  return bm ? { ...bm, category: finalCategory } : null;
}

// Bridge helper — reads from new nested schema (brief.financials.*) with flat fallback
function b(brief) {
  const fin = brief.financials || {};
  const deal = brief.deal || {};
  const co = brief.company || {};
  return {
    revenue:               fin.revenue              ?? parseNum(brief.revenue_ttm) ?? parseNum(brief.revenue),
    ebitda:                fin.ebitda_adjusted      ?? parseNum(brief.ebitda_ttm) ?? parseNum(brief.ebitda_estimated),
    ebitda_reported:       fin.ebitda_reported      ?? null,
    ebit:                  fin.ebit                 ?? parseNum(brief.operating_profit),
    pbt:                   fin.profit_before_tax    ?? parseNum(brief.pbt),
    pat:                   fin.profit_after_tax     ?? parseNum(brief.pat),
    gross_profit:          fin.gross_profit         ?? parseNum(brief.gross_profit),
    ebitda_margin:         fin.ebitda_margin_pct    ?? parseNum(brief.ebitda_margin),
    revenue_prior:         fin.revenue_prior_year   ?? null,
    operating_cash_flow:   fin.operating_cash_flow  ?? parseNum(brief.operating_cash_flow),
    trade_debtors:         fin.trade_debtors        ?? parseNum(brief.debtors),
    net_debt:              fin.net_debt             ?? parseNum(brief.net_debt),
    total_assets:          fin.total_assets         ?? parseNum(brief.total_assets),
    asking_price:          deal.asking_price        ?? parseNum(brief.asking_price),
    asking_multiple:       deal.asking_ebitda_multiple ?? parseNum(brief.asking_ebitda_multiple),
    recurring_revenue_pct: deal.recurring_revenue_pct ?? parseNum(brief.recurring_revenue_pct),
    sector:                co.sector                ?? brief.sector,
    owner_dependent:       brief.owner_dependent    ?? null,
    revenue_trend:         brief.revenue_trend      ?? '',
    detected_currency:     brief.detected_currency  ?? brief.detectedCurrency,
  };
}

function getProxyEBITDA(brief) {
  const d = b(brief);
  if (d.ebitda) return { value: d.ebitda, isProxy: false };
  const proxy = d.ebit || d.pbt || d.pat;
  if (proxy) return { value: proxy, isProxy: true };
  return { value: null, isProxy: false };
}

function buildUpValuation(brief, bm) {
  if (!bm) return null;
  const ebitdaObj = getProxyEBITDA(brief);
  if (!ebitdaObj.value) return null;
  const ebitda = ebitdaObj.value;
  const d = b(brief);

  const privateMedianMultiple = bm.ev_ebitda_median * (1 - bm.private_sme_discount_pct / 100);
  const adj = {};
  const recurringPct = d.recurring_revenue_pct;
  if (recurringPct != null) {
    if (recurringPct > 70) adj['Strong recurring revenue'] = +0.40;
    else if (recurringPct < 40) adj['Weak recurring revenue'] = -0.40;
  }
  // Owner dependency — explicit flag takes priority; fall back to SME conservative default
  const ownerDepExplicit = d.owner_dependent;  // from old flat schema if present
  const ownershipStr     = (brief.company?.ownership_structure || '').toLowerCase();
  const employees        = brief.company?.employees_total ?? null;
  // Conservative SME default: sole traders and small limited companies (<50 staff)
  // are treated as owner-dependent unless the document explicitly contradicts this.
  const smeOwnerDepDefault =
    ownerDepExplicit == null &&
    (ownershipStr === 'sole trader' ||
      (ownershipStr.includes('limited') && employees != null && employees < 50));

  if (ownerDepExplicit === true || smeOwnerDepDefault) {
    adj['Owner dependency risk (SME default)'] = -0.35;
  } else if (ownerDepExplicit === false) {
    adj['Strong management team'] = +0.25;
  }
  const margin = d.ebitda_margin;
  if (margin != null && margin > bm.ebitda_margin_median) adj['Above-median EBITDA margins'] = +0.30;
  const trend = (d.revenue_trend || '').toLowerCase();
  if (trend.includes('grow')) adj['Positive revenue trend'] = +0.25;
  if (trend.includes('declin')) adj['Declining revenue'] = -0.50;

  const totalAdj = Object.values(adj).reduce((s, v) => s + v, 0);
  const adjustedMultiple = Math.max(2, privateMedianMultiple + totalAdj);
  return {
    baseMultiple: +privateMedianMultiple.toFixed(2),
    adjustments: adj,
    totalAdj: +totalAdj.toFixed(2),
    adjustedMultiple: +adjustedMultiple.toFixed(2),
    value: +(adjustedMultiple * ebitda).toFixed(2),
    ebitda,
    isProxy: ebitdaObj.isProxy
  };
}

function underlyingValuation(brief, bm) {
  if (!bm) return null;
  const ebitdaObj = getProxyEBITDA(brief);
  if (!ebitdaObj.value) return null;
  const ebitda = ebitdaObj.value;
  const privateMedianMultiple = bm.ev_ebitda_median * (1 - bm.private_sme_discount_pct / 100);
  const haircut = 0.10;
  const underlying = ebitda * (1 - haircut);
  return {
    reportedEBITDA: ebitda,
    haircut: haircut * 100,
    underlyingEBITDA: +underlying.toFixed(2),
    multiple: +privateMedianMultiple.toFixed(2),
    value: +(underlying * privateMedianMultiple).toFixed(2),
  };
}

function assetFloor(brief, geo) {
  const ebitdaObj = getProxyEBITDA(brief);
  const d = b(brief);
  const revenue = d.revenue;
  if (!ebitdaObj.value && !revenue) return null;
  const debtors = revenue ? +(revenue * (34 / 365)).toFixed(2) : null;
  const floor = debtors ? +(debtors * 0.6).toFixed(2) : null;
  return { debtors, floor, isAssetLight: true };
}

function sensitivityScenarios(brief, bm) {
  if (!bm) return [];
  const ebitdaObj = getProxyEBITDA(brief);
  const askingPrice = b(brief).asking_price;
  if (!ebitdaObj.value) return [];
  const ebitda = ebitdaObj.value;
  const privateMedianMultiple = bm.ev_ebitda_median * (1 - bm.private_sme_discount_pct / 100);
  return [
    { name: 'Primary contract lost / re-tender risk', revenueImpact: -0.18, ebitdaImpact: -0.22 },
    { name: 'Founder exits, key client relationships at risk', revenueImpact: -0.25, ebitdaImpact: -0.30 },
    { name: 'Labour cost inflation, unmitigated margin compression', revenueImpact: 0, ebitdaImpact: -0.12 },
  ].map(s => {
    const distressedEBITDA = ebitda * (1 + s.ebitdaImpact);
    const impliedValue = distressedEBITDA * privateMedianMultiple;
    const vsAsking = askingPrice ? ((impliedValue - askingPrice) / askingPrice * 100) : null;
    return { ...s, distressedEBITDA: +distressedEBITDA.toFixed(2), impliedValue: +impliedValue.toFixed(2), vsAsking: vsAsking != null ? +vsAsking.toFixed(1) : null };
  });
}

const geoCurrSym = (geo) => (geoConfig[geo] || geoConfig['UK']).currency_symbol;

export default function ValuationEngine({ currentDeal, setActive, geography }) {
  const geo = geography || 'UK';

  if (!currentDeal?.brief) {
    return (
      <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center', paddingTop: '120px' }}>
        <div className="empty-icon">◎</div>
        <div className="empty-text mb-20">
          Analyse an IM first to load deal data.
        </div>
        <button className="btn btn-primary" onClick={() => setActive('im')}>Go to IM Analyzer →</button>
      </div>
    );
  }

  const { brief } = currentDeal;
  // Currency comes from the document itself — geography is fallback only
  const docCurr = b(brief).detected_currency;
  const currMap = { GBP: '£', USD: '$', EUR: '€', INR: '₹', AED: 'AED ' };
  const sym = currMap[docCurr] ?? docCurr ?? geoCurrSym(geo);
  const sector = b(brief).sector;
  const bm  = getBenchmark(sector);
  const buv = buildUpValuation(brief, bm);
  const uev = underlyingValuation(brief, bm);
  const af  = assetFloor(brief, geo);
  const scenarios = sensitivityScenarios(brief, bm);
  const askingPrice = b(brief).asking_price;

  // Composite range
  const lowVals  = [buv?.value, uev?.value, af?.floor].filter(Boolean);
  const highVals = [buv?.value, uev?.value].filter(Boolean);
  const compositeLow  = lowVals.length  ? Math.min(...lowVals) : null;
  const compositeHigh = highVals.length ? Math.max(...highVals) : null;

  const revenue = b(brief).revenue;
  const sanityLimit = revenue ? revenue * 100 : null;

  if (sanityLimit && compositeHigh && (compositeHigh > sanityLimit)) {
    console.warn('Implied enterprise value exceeds 100x revenue. Check input units.');
    return (
      <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center', paddingTop: '120px' }}>
         <div className="empty-icon">⚠️</div>
         <div className="mono" style={{ fontSize: '14px', color: 'var(--amber)', marginBottom: '20px' }}>Valuation error — check input units.</div>
         <div className="serif text">The implied EV is astronomically high relative to revenue. Check if extraction captured raw values vs millions correctly.</div>
      </div>
    );
  }

  let verdict = null, verdictColor = 'var(--amber)', verdictLabel = 'Upload IM with asking price stated to enable verdict';
  let compositeMid = null;
  if (buv?.value && uev?.value) compositeMid = (buv.value + uev.value) / 2;
  else compositeMid = buv?.value || uev?.value || null;

  if (askingPrice != null && compositeLow && compositeHigh) {
    if (askingPrice < compositeLow) { verdict = 'UNDERPRICED'; verdictColor = 'var(--green)'; verdictLabel = 'UNDERPRICED — asking price below asset floor, verify asset quality'; }
    else if (askingPrice > compositeHigh) { verdict = 'OVERPRICED'; verdictColor = 'var(--red)'; verdictLabel = 'OVERPRICED — asking price exceeds independent valuation range'; }
    else { verdict = 'FAIR VALUE'; verdictColor = 'var(--green)'; verdictLabel = 'FAIR VALUE — asking price within independent valuation range'; }
  }

  const sectionLabel = (t) => (
    <div className="section-label" style={{ marginBottom: '10px', fontSize: '10px', letterSpacing: '0.08em' }}>{t}</div>
  );

  const chartData = [];
  if (buv?.value) {
    chartData.push({
      name: 'Build-up',
      min: buv.value * 0.9,
      max: buv.value * 1.1,
      mid: buv.value,
      range: [buv.value * 0.9, buv.value * 1.1]
    });
  }
  if (uev?.value) {
    chartData.push({
      name: 'Underlying',
      min: uev.value * 0.9,
      max: uev.value * 1.1,
      mid: uev.value,
      range: [uev.value * 0.9, uev.value * 1.1]
    });
  }
  if (af?.floor) {
    chartData.push({
      name: 'Asset Floor',
      min: 0,
      max: af.floor,
      mid: af.floor,
      range: [0, af.floor]
    });
  }
  const worstSens = scenarios.length ? Math.min(...scenarios.map(s => s.impliedValue)) : null;
  if (worstSens) {
    chartData.push({
      name: 'Sensitivity',
      min: 0,
      max: worstSens,
      mid: worstSens,
      range: [0, worstSens]
    });
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{ background: 'var(--navy2)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '4px', fontFamily: 'var(--mono)', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <div style={{ color: 'var(--amber)', fontWeight: '500', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{data.name} Range</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: 'var(--muted)' }}>Low/Min:</span>
              <span style={{ color: 'var(--green)', fontWeight: '500' }}>{formatCurrency(data.min, sym)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: 'var(--muted)' }}>Mid/Target:</span>
              <span style={{ color: 'var(--text)', fontWeight: '500' }}>{formatCurrency(data.mid, sym)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: 'var(--muted)' }}>High/Max:</span>
              <span style={{ color: 'var(--amber)', fontWeight: '500' }}>{formatCurrency(data.max, sym)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const hasRange = compositeLow && compositeHigh && (compositeHigh !== compositeLow);
  const rangePct = hasRange && askingPrice != null
    ? Math.max(0, Math.min(100, ((askingPrice - compositeLow) / (compositeHigh - compositeLow)) * 100))
    : 50;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px' }}>
      
      {/* VERDICT & RANGE ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px' }}>
        {/* Verdict Box */}
        <div className="card" style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: `${verdictColor}06`, border: `1px solid ${verdict ? verdictColor : 'var(--border)'}`, position: 'relative', overflow: 'hidden', minHeight: '130px' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: verdictColor, filter: 'blur(40px)', opacity: 0.12, pointerEvents: 'none' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Overall Deal Verdict
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 'bold', color: verdictColor || 'var(--text)', marginBottom: '8px' }}>
            {verdict || 'NO ASKING PRICE'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
            {verdictLabel}
          </div>
        </div>

        {/* Range Slider Box */}
        <div className="card" style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '130px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>Valuation Range vs Asking</span>
            {askingPrice != null && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--amber)', fontWeight: '500' }}>
                Asking: {formatCurrency(askingPrice, sym)}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '8px 0' }}>
            {/* The visual slider bar */}
            <div style={{ height: '6px', background: 'var(--navy4)', borderRadius: '3px', position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
              {/* Color range highlight */}
              <div style={{ position: 'absolute', left: '10%', right: '10%', height: '100%', background: 'linear-gradient(90deg, var(--green), var(--amber))', borderRadius: '3px', opacity: 0.8 }} />
              
              {/* Slider Pin for Asking Price */}
              {askingPrice != null && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    left: `${10 + (rangePct * 0.8)}%`, 
                    transform: 'translateX(-50%)', 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    background: verdictColor || 'var(--amber)', 
                    border: '2px solid var(--text)', 
                    boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                    zIndex: 5
                  }}
                  title={`Asking Price: ${formatCurrency(askingPrice, sym)}`}
                />
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <div>
                <div className="mono muted" style={{ fontSize: '8px', letterSpacing: '0.04em' }}>LOW FLOOR</div>
                <div className="mono" style={{ fontSize: '12px', color: 'var(--green)' }}>{compositeLow ? formatCurrency(compositeLow, sym) : '—'}</div>
              </div>
              {compositeMid && (
                <div style={{ textAlign: 'center' }}>
                  <div className="mono muted" style={{ fontSize: '8px', letterSpacing: '0.04em' }}>COMPOSITE MID</div>
                  <div className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{formatCurrency(compositeMid, sym)}</div>
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <div className="mono muted" style={{ fontSize: '8px', letterSpacing: '0.04em' }}>HIGH CEILING</div>
                <div className="mono" style={{ fontSize: '12px', color: 'var(--amber)' }}>{compositeHigh ? formatCurrency(compositeHigh, sym) : '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CHART & VALUATION SUMMARY ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px' }}>
        {/* Chart Box (Span 7) */}
        <div className="card" style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
          {sectionLabel('Valuation Methods Comparison')}
          <div style={{ flex: 1, minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {chartData.length === 0 ? (
              <div className="mono muted" style={{ fontSize: '11px' }}>No valuation data to chart</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 10, right: 15, left: -25, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="barValGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--green)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--amber)" stopOpacity={0.25} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    type="number"
                    domain={[0, 'auto']}
                    tickFormatter={(v) => formatCurrency(v, sym)}
                    stroke="var(--muted)"
                    style={{ fontSize: '9px', fontFamily: 'var(--mono)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="var(--muted)"
                    style={{ fontSize: '10px', fontFamily: 'var(--mono)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  {/* Floating Range Bar */}
                  <Bar dataKey="range" fill="url(#barValGradient)" stroke="var(--green)" strokeWidth={1} radius={2} barSize={8} />
                  {/* Mid/Target Point */}
                  <Scatter dataKey="mid" fill="var(--amber)" shape="circle" size={40} />
                  {askingPrice != null && (
                    <ReferenceLine
                      x={askingPrice}
                      stroke={verdictColor || 'var(--red)'}
                      strokeDasharray="3 3"
                      label={{
                        value: `Asking`,
                        fill: verdictColor || 'var(--red)',
                        position: 'top',
                        style: { fontSize: '8px', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Valuation Summary Table Box (Span 5) */}
        <div className="card" style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
          {sectionLabel('Valuation Summary')}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '10px' }}>
              <thead>
                <tr>
                  {['METHOD', 'LOW', 'HIGH'].map(h => (
                    <td key={h} style={{ color: 'var(--muted)', padding: '4px 6px', borderBottom: '1px solid var(--border)', textAlign: h === 'METHOD' ? 'left' : 'right', fontWeight: 500 }}>{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Build-up', low: buv?.value ? buv.value * 0.9 : null, high: buv?.value ? buv.value * 1.1 : null },
                  { label: 'Underlying', low: uev?.value ? uev.value * 0.9 : null, high: uev?.value ? uev.value * 1.1 : null },
                  { label: 'Asset Floor', low: af?.floor || null, high: af?.floor || null },
                  { label: 'Sensitivity', low: scenarios.length ? Math.min(...scenarios.map(s => s.impliedValue)) : null, high: null },
                ].map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{r.label}</td>
                    <td style={{ padding: '6px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                      {r.low != null ? formatCurrency(r.low, sym) : '—'}
                    </td>
                    <td style={{ padding: '6px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                      {r.high != null ? formatCurrency(r.high, sym) : '—'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px 6px 4px', fontWeight: 600, color: 'var(--text)' }}>COMPOSITE</td>
                  <td style={{ padding: '8px 6px 4px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{compositeLow ? formatCurrency(compositeLow, sym) : '—'}</td>
                  <td style={{ padding: '8px 6px 4px', textAlign: 'right', color: 'var(--amber)', fontWeight: 600 }}>{compositeHigh ? formatCurrency(compositeHigh, sym) : '—'}</td>
                </tr>
                {askingPrice != null && (
                  <tr>
                    <td style={{ padding: '4px 6px', color: verdictColor, fontWeight: 600 }}>ASKING</td>
                    <td colSpan={2} style={{ padding: '4px 6px', textAlign: 'right', color: verdictColor, fontWeight: 600 }}>{formatCurrency(askingPrice, sym)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* METHODS DETAILS: BUILD-UP & UNDERLYING (Row 3) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Method 1: Build-Up */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
          <div>
            {sectionLabel('Method 1 — Build-Up Valuation')}
            {buv && askingPrice != null && (
              <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '12px', padding: '6px 10px', background: 'var(--navy3)', borderRadius: '3px', borderLeft: `3.5px solid ${buv.value >= askingPrice ? 'var(--green)' : 'var(--red)'}`, lineHeight: 1.4 }}>
                {buv.value >= askingPrice 
                  ? 'Values business above asking price — attractive entry.'
                  : 'Values business below asking price — negotiation suggested.'}
              </div>
            )}
            {!buv ? (
              <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data — EBITDA figure required.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--muted)' }}>Base Sector SME Multiple</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{buv.baseMultiple}x</span>
                </div>
                {Object.entries(buv.adjustments).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text)' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: v >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                      {v >= 0 ? '+' : ''}{v.toFixed(2)}x
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--muted)' }}>Total Adjustments</span>
                  <span style={{ fontFamily: 'var(--mono)', color: buv.totalAdj >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {buv.totalAdj >= 0 ? '+' : ''}{buv.totalAdj}x
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {buv && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
              <div style={{ background: 'var(--navy3)', padding: '8px', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase' }}>Implied Multiple</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '14px', color: 'var(--amber)', fontWeight: 600, marginTop: '2px' }}>{buv.adjustedMultiple}x</div>
              </div>
              <div style={{ background: 'var(--navy3)', padding: '8px', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase' }}>Enterprise Value</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '14px', color: 'var(--green)', fontWeight: 600, marginTop: '2px' }}>{formatCurrency(buv.value, sym)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Method 2: Underlying Earnings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
          <div>
            {sectionLabel('Method 2 — Underlying Earnings')}
            {uev && askingPrice != null && (
              <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '12px', padding: '6px 10px', background: 'var(--navy3)', borderRadius: '3px', borderLeft: `3.5px solid ${uev.value >= askingPrice ? 'var(--green)' : 'var(--red)'}`, lineHeight: 1.4 }}>
                {uev.value >= askingPrice 
                  ? 'Normalised earnings support value relative to asking price.'
                  : 'Normalised earnings suggest potential overpayment.'}
              </div>
            )}
            {!uev ? (
              <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--muted)' }}>{uev.isProxy ? 'Reported Profit (Proxy)' : 'Reported EBITDA'}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{formatCurrency(uev.reportedEBITDA, sym)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--muted)' }}>SME Haircut ({uev.haircut}%)</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{formatCurrency(uev.reportedEBITDA * uev.haircut / 100, sym)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--muted)' }}>{uev.isProxy ? 'Underlying Profit' : 'Underlying EBITDA'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{formatCurrency(uev.underlyingEBITDA, sym)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--muted)' }}>Applied Multiple</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{uev.multiple}x</span>
                </div>
              </div>
            )}
          </div>
          
          {uev && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginTop: '12px' }}>
              <div style={{ background: 'var(--navy3)', padding: '8px', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase' }}>Implied Enterprise Value</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '14px', color: 'var(--green)', fontWeight: 600, marginTop: '2px' }}>{formatCurrency(uev.value, sym)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ASSET FLOOR & SENSITIVITY (Row 4) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '16px' }}>
        {/* Method 3: Asset Floor */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
          <div>
            {sectionLabel('Method 3 — Asset Floor')}
            {!af ? (
              <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
                  Asset-light SME default: minimum floor value if trading ceases.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {af.debtors && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                      <span style={{ color: 'var(--muted)' }}>Est. Debtors (34-day)</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{formatCurrency(af.debtors, sym)}</span>
                    </div>
                  )}
                  {af.floor && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                      <span style={{ color: 'var(--muted)' }}>Asset Floor Value</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 500 }}>{formatCurrency(af.floor, sym)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div style={{ background: 'rgba(232,168,53,0.03)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '8px', marginTop: '12px' }}>
            <div className="mono muted" style={{ fontSize: '8px', fontStyle: 'italic', lineHeight: 1.5 }}>
              Goodwill value (contracts, workforce, brand) equals asking minus asset floor. SPA should reflect these protections.
            </div>
          </div>
        </div>

        {/* Method 4: Downside Sensitivity */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
          <div>
            {sectionLabel('Method 4 — Downside Sensitivity')}
            {scenarios.length > 0 && askingPrice != null && (
              <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '12px', padding: '6px 10px', background: 'var(--navy3)', borderRadius: '3px', borderLeft: `3.5px solid ${scenarios.every(s => s.impliedValue >= askingPrice) ? 'var(--green)' : 'var(--red)'}`, lineHeight: 1.4 }}>
                {scenarios.every(s => s.impliedValue >= askingPrice)
                  ? 'All downside scenarios remain above asking price.'
                  : 'At least one downside scenario poses overpayment risk.'}
              </div>
            )}
            {scenarios.length === 0 ? (
              <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scenarios.map((s, i) => {
                  const isRisk = s.impliedValue < askingPrice;
                  return (
                    <div key={i} style={{ background: 'var(--navy3)', border: `1px solid ${isRisk ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`, borderRadius: '4px', padding: '8px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 500, fontSize: '11px' }}>{s.name}</span>
                        {askingPrice != null && (
                          <span style={{ fontSize: '9px', fontWeight: 600, color: isRisk ? 'var(--red)' : 'var(--green)', background: isRisk ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', padding: '1px 5px', borderRadius: '2px', fontFamily: 'var(--mono)' }}>
                            {isRisk ? 'Risk' : 'Covered'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                        <div>
                          EBITDA Impact: <span style={{ color: 'var(--red)' }}>{(s.ebitdaImpact * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          Value: <span style={{ color: 'var(--text)' }}>{formatCurrency(s.impliedValue, sym)}</span>
                        </div>
                        {askingPrice != null && (
                          <div>
                            vs Asking: <span style={{ color: isRisk ? 'var(--red)' : 'var(--green)' }}>{s.vsAsking > 0 ? '+' : ''}{s.vsAsking}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
