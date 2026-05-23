import sectorMapping from '../data/sector_mapping.json';
import benchmarks from '../data/damodaran_benchmarks_2025.json';
import geoConfig from '../data/geography_config.json';

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

  const card = (children, extra = {}) => (
    <div className="card" style={{ marginBottom: '16px', ...extra }}>{children}</div>
  );

  const sectionLabel = (t) => (
    <div className="section-label" style={{ marginBottom: '12px' }}>{t}</div>
  );

  const row = (label, value, highlight = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: highlight ? '15px' : '12px', color: highlight ? 'var(--amber)' : 'var(--text)' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>

      {/* Summary Banner */}
      {card(
        <>
          {sectionLabel('INDEPENDENT VALUATION RANGE')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
            <div className="mono" style={{ fontSize: '22px', color: 'var(--green)' }}>{formatCurrency(compositeLow, sym)}</div>
            <div style={{ flex: 1, height: '3px', background: 'var(--navy4)', borderRadius: '2px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-4px', left: '50%', transform: 'translateX(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--amber)' }} />
            </div>
            <div className="mono" style={{ fontSize: '22px', color: 'var(--amber)' }}>{formatCurrency(compositeHigh, sym)}</div>
          </div>
          {askingPrice != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="mono muted" style={{ fontSize: '11px' }}>Asking: {formatCurrency(askingPrice, sym)}</span>
              {verdict && (
                <span style={{
                  padding: '2px 10px', borderRadius: '2px', fontFamily: 'DM Mono, monospace', fontSize: '10px',
                  letterSpacing: '0.08em', background: `${verdictColor}18`, color: verdictColor, border: `1px solid ${verdictColor}`,
                }}>{verdict}</span>
              )}
            </div>
          )}
          {!bm && <div className="mono" style={{ fontSize: '10px', marginTop: '12px', color: 'var(--amber)' }}>Sector '{sector || '(unknown)'}' not mapped — benchmarks unavailable. Add to sector_mapping.json to enable.</div>}
        </>
      )}

      {/* Method 1 — Build-Up */}
      {card(
        <>
          {sectionLabel('METHOD 1 — BUILD-UP VALUATION')}
          <div className="mono muted" style={{ fontSize: '10px', marginBottom: '14px' }}>Starts from sector base multiple, adjusts for deal-specific attributes.</div>
          {!buv ? (
            <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data — EBITDA figure required.</div>
          ) : (
            <>
              {row('Base multiple (sector private median)', `${buv.baseMultiple}x`)}
              {Object.entries(buv.adjustments).map(([k, v]) =>
                row(`  ${v >= 0 ? '+' : ''}${(v * 10).toFixed(1) === '-3.5' ? '' : ''} ${k}`, `${v >= 0 ? '+' : ''}${v.toFixed(2)}x`)
              )}
              {row('Adjustments applied', `${buv.totalAdj >= 0 ? '+' : ''}${buv.totalAdj}x`)}
              {row('Implied multiple', `${buv.adjustedMultiple}x`, true)}
              {row('Implied enterprise value', formatCurrency(buv.value, sym), true)}
            </>
          )}
        </>
      )}

      {/* Method 2 — Underlying Earnings */}
      {card(
        <>
          {sectionLabel('METHOD 2 — UNDERLYING EARNINGS VALUATION')}
          <div className="mono muted" style={{ fontSize: '10px', marginBottom: '14px' }}>Applies multiple to normalised, adjusted EBITDA only.</div>
          {!uev ? (
            <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data.</div>
          ) : (
            <>
              {row(uev.isProxy ? 'Reported Profit (Proxy Used)' : 'Reported EBITDA', formatCurrency(uev.reportedEBITDA, sym))}
              {row(`Conservative haircut (${uev.haircut}% for one-offs, owner costs)`, `−${formatCurrency(uev.reportedEBITDA * uev.haircut / 100, sym).replace(sym, '')}`)}
              {row(uev.isProxy ? 'Underlying Profit' : 'Underlying EBITDA', formatCurrency(uev.underlyingEBITDA, sym), true)}
              {row('Applied multiple (from Build-up)', `${uev.multiple}x`)}
              {row('Implied enterprise value', formatCurrency(uev.value, sym), true)}
              <div className="mono muted" style={{ fontSize: '9px', marginTop: '10px', fontStyle: 'italic' }}>
                {uev.isProxy 
                  ? 'Note: Explicit EBITDA was missing from documents. Using operating profit / PBT proxy.' 
                  : 'Buyer should request full EBITDA bridge in DD to verify all adjustments. IM-stated EBITDA accepted pending verification.'}
              </div>
            </>
          )}
        </>
      )}

      {/* Method 3 — Asset Floor */}
      {card(
        <>
          {sectionLabel('METHOD 3 — ASSET-BASED FLOOR VALUATION')}
          <div className="mono muted" style={{ fontSize: '10px', marginBottom: '14px' }}>Minimum value if business stopped trading. Relevant for capital-heavy deals.</div>
          {!af ? (
            <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data for asset floor calculation.</div>
          ) : (
            <>
              <div className="mono muted" style={{ fontSize: '11px', marginBottom: '10px' }}>This appears to be an asset-light business. Asset floor is a floor, not a target.</div>
              {af.debtors && row('Estimated debtors (34-day basis)', `Est. ${formatCurrency(af.debtors, sym)}`)}
              {af.floor && row('Estimated asset floor (after liabilities)', `Est. ${formatCurrency(af.floor, sym)}`, true)}
              <div style={{ background: 'rgba(232,168,53,0.05)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '10px', marginTop: '10px' }}>
                <div className="mono muted" style={{ fontSize: '9px', fontStyle: 'italic', lineHeight: 1.6 }}>
                  Paying above asset value implies you are paying for: customer contracts, workforce, brand, systems, and management team. Ensure these are contractually protected in the SPA.
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Method 4 — Sensitivity */}
      {card(
        <>
          {sectionLabel('METHOD 4 — DOWNSIDE SENSITIVITY')}
          <div className="mono muted" style={{ fontSize: '10px', marginBottom: '14px' }}>Implied value if key risks materialise.</div>
          {scenarios.length === 0 ? (
            <div className="mono muted" style={{ fontSize: '11px' }}>Insufficient data for sensitivity analysis.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {scenarios.map((s, i) => (
                <div key={i} style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: '3px', padding: '14px' }}>
                  <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', marginBottom: '8px' }}>{s.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'EBITDA Impact', val: `${(s.ebitdaImpact * 100).toFixed(0)}%` },
                      { label: 'Distressed EBITDA', val: formatCurrency(s.distressedEBITDA, sym) },
                      { label: 'Implied Value', val: formatCurrency(s.impliedValue, sym) },
                      { label: 'vs Asking', val: s.vsAsking != null ? `${s.vsAsking > 0 ? '+' : ''}${s.vsAsking}%` : '—' },
                    ].map(m => (
                      <div key={m.label} style={{ gridColumn: m.label === 'vs Asking' ? '1 / span 4' : 'auto' }}>
                        <div className="mono muted" style={{ fontSize: '9px', marginBottom: '2px' }}>{m.label}</div>
                        <div className="mono" style={{ fontSize: '12px', color: m.label === 'vs Asking' && s.impliedValue < askingPrice ? 'var(--red)' : m.label === 'vs Asking' && s.impliedValue > askingPrice ? 'var(--green)' : 'var(--text)' }}>
                          {m.label === 'vs Asking' && askingPrice != null 
                            ? `${formatCurrency(Math.abs(s.impliedValue - askingPrice), sym)} vs asking ${formatCurrency(askingPrice, sym)} — ${s.impliedValue > askingPrice ? 'above asking — deal still makes sense under this scenario' : 'below asking — scenario represents overpayment risk'}` 
                            : m.val}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Summary Table */}
      {card(
        <>
          {sectionLabel('VALUATION SUMMARY')}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Mono, monospace', fontSize: '11px' }}>
            <thead>
              <tr>
                {['METHOD', 'LOW', 'MID', 'HIGH'].map(h => (
                  <td key={h} style={{ color: 'var(--muted)', padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: h === 'METHOD' ? 'left' : 'right' }}>{h}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Build-up', low: buv?.value ? buv.value * 0.9 : null, mid: buv?.value || null, high: buv?.value ? buv.value * 1.1 : null },
                { label: 'Underlying Earnings', low: uev?.value ? uev.value * 0.9 : null, mid: uev?.value || null, high: uev?.value ? uev.value * 1.1 : null },
                { label: 'Asset Floor', low: af?.floor || null, mid: null, high: null },
                { label: 'Sensitivity (worst)', low: scenarios.length ? Math.min(...scenarios.map(s => s.impliedValue)) : null, mid: null, high: null },
              ].map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{r.label}</td>
                  {[r.low, r.mid, r.high].map((v, j) => (
                    <td key={j} style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                      {v != null ? formatCurrency(v, sym) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text)' }}>COMPOSITE RANGE</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{compositeLow ? formatCurrency(compositeLow, sym) : '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{compositeMid ? formatCurrency(compositeMid, sym) : '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{compositeHigh ? formatCurrency(compositeHigh, sym) : '—'}</td>
              </tr>
              {askingPrice != null && (
                <tr>
                  <td style={{ padding: '8px', color: verdictColor, fontWeight: 700 }}>ASKING PRICE</td>
                  <td colSpan={2} style={{ padding: '8px', textAlign: 'right', color: verdictColor, fontWeight: 700 }}>{formatCurrency(askingPrice, sym)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '2px', background: `${verdictColor}18`, color: verdictColor, fontSize: '9px', letterSpacing: '0.06em' }}>{verdict}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {askingPrice == null ? (
            <div style={{ background: 'var(--navy3)', border: '1px solid var(--border)', padding: '12px', marginTop: '16px', borderRadius: '3px', textAlign: 'center' }}>
              <span className="mono muted" style={{ fontSize: '10px' }}>Upload IM with asking price stated to enable verdict</span>
            </div>
          ) : (verdict && (
            <div style={{ background: `${verdictColor}10`, border: `1px solid ${verdictColor}`, padding: '12px', marginTop: '16px', borderRadius: '3px', textAlign: 'center' }}>
              <span className="mono" style={{ fontSize: '11px', color: verdictColor, fontWeight: 700 }}>{verdictLabel}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
