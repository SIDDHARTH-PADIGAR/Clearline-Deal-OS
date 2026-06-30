import { useState, useEffect } from 'react';
import sectorMapping from '../data/sector_mapping.json';
import benchmarks from '../data/damodaran_benchmarks_2025.json';
import { supabase } from '../supabaseClient';
import { callAI } from '../lib/ai';

// ─── Extraction and Helper Functions ──────────────────────────────────────────
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
  if (val == null || typeof val !== 'number' || isNaN(val)) return '—';
  const absVal = Math.abs(val);
  let formatted = '';
  if (sym === '₹') {
    formatted = formatINR(absVal);
  } else if (absVal >= 1_000_000) {
    formatted = `${sym}${(absVal / 1_000_000).toFixed(2)}M`;
  } else {
    formatted = `${sym}${Math.round(absVal).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return val < 0 ? `-${formatted}` : formatted;
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

function b(brief) {
  if (!brief) return {};
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
  const ownerDepExplicit = d.owner_dependent;
  const ownershipStr     = (brief.company?.ownership_structure || '').toLowerCase();
  const employees        = brief.company?.employees_total ?? null;
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

// ─── Table Rows Definition ───────────────────────────────────────────────────
const ROWS = [
  { key: 'name', label: 'Company Name' },
  { key: 'sector', label: 'Sector' },
  { key: 'geography', label: 'Geography' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'gross_margin', label: 'Gross Margin %' },
  { key: 'ebitda', label: 'Adjusted EBITDA' },
  { key: 'ebitda_margin', label: 'EBITDA Margin %' },
  { key: 'asking_price', label: 'Asking Price' },
  { key: 'multiple', label: 'EV/EBITDA Multiple' },
  { key: 'deal_score', label: 'Deal Score (overall)' },
  { key: 'sector_fit', label: 'Sector Fit score' },
  { key: 'ebitda_quality', label: 'EBITDA Quality score' },
  { key: 'revenue_durability', label: 'Revenue Durability score' },
  { key: 'ecrm_rating', label: 'ECRM Overall Rating' },
  { key: 'recurring_revenue', label: 'Recurring Revenue %' },
  { key: 'client_concentration', label: 'Top Client Concentration' },
  { key: 'net_debt', label: 'Net Debt/Cash' },
  { key: 'val_bu', label: 'Valuation — Build-up mid' },
  { key: 'val_ue', label: 'Valuation — Underlying Earnings mid' },
  { key: 'val_composite', label: 'Composite Valuation mid' },
  { key: 'vs_asking', label: 'vs Asking (over/under valued)' },
];

function getDealRowValue(deal, key, sym) {
  const { brief } = deal;
  if (!brief) return null;
  const bd = b(brief);
  const s = brief._scores || brief.scores || {};
  const sector = bd.sector;
  const bm = getBenchmark(sector);

  switch (key) {
    case 'name':
      return deal.name;
    case 'sector':
      return bd.sector || '—';
    case 'geography':
      return brief.company?.geography || brief.company?.headquarters_location || '—';
    case 'revenue':
      return bd.revenue;
    case 'gross_margin':
      return bd.gross_profit && bd.revenue ? (bd.gross_profit / bd.revenue) * 100 : brief.financials?.gross_margin_pct || null;
    case 'ebitda':
      return bd.ebitda;
    case 'ebitda_margin':
      return bd.ebitda_margin;
    case 'asking_price':
      return bd.asking_price;
    case 'multiple':
      if (bd.asking_multiple != null) return bd.asking_multiple;
      if (bd.asking_price != null && bd.ebitda != null && bd.ebitda > 0) {
        return parseFloat((bd.asking_price / bd.ebitda).toFixed(2));
      }
      return null;
    case 'deal_score':
      return deal.score || s.total || null;
    case 'sector_fit':
      return s.sector_fit || null;
    case 'ebitda_quality':
      return s.ebitda_quality || null;
    case 'revenue_durability':
      return s.revenue_durability || null;
    case 'ecrm_rating':
      return brief.ecrm?.overall_rating || 'CLEAN';
    case 'recurring_revenue':
      return bd.recurring_revenue_pct;
    case 'client_concentration':
      return brief.deal?.top_client_concentration_pct || null;
    case 'net_debt':
      return bd.net_debt || (bd.net_cash ? -bd.net_cash : null);
    case 'val_bu':
      return buildUpValuation(brief, bm)?.value || null;
    case 'val_ue':
      return underlyingValuation(brief, bm)?.value || null;
    case 'val_composite': {
      const buv = buildUpValuation(brief, bm);
      const uev = underlyingValuation(brief, bm);
      return buv?.value && uev?.value ? (buv.value + uev.value) / 2 : buv?.value || uev?.value || null;
    }
    case 'vs_asking': {
      const buv = buildUpValuation(brief, bm);
      const uev = underlyingValuation(brief, bm);
      const compositeMid = buv?.value && uev?.value ? (buv.value + uev.value) / 2 : buv?.value || uev?.value || null;
      if (bd.asking_price != null && compositeMid != null) {
        return ((compositeMid - bd.asking_price) / bd.asking_price) * 100;
      }
      return null;
    }
    default:
      return null;
  }
}

function formatDealRowValue(val, key, sym) {
  if (val == null) return '—';
  
  if (key === 'revenue' || key === 'ebitda' || key === 'asking_price' || key === 'val_bu' || key === 'val_ue' || key === 'val_composite') {
    return formatCurrency(val, sym);
  }
  if (key === 'net_debt') {
    if (val < 0) return `Net Cash: ${formatCurrency(Math.abs(val), sym)}`;
    if (val > 0) return `Net Debt: ${formatCurrency(val, sym)}`;
    return 'Neutral / None';
  }
  if (key === 'gross_margin' || key === 'ebitda_margin' || key === 'recurring_revenue' || key === 'client_concentration') {
    return `${parseFloat(val).toFixed(1)}%`;
  }
  if (key === 'multiple') {
    return `${parseFloat(val).toFixed(2)}x`;
  }
  if (key === 'deal_score' || key === 'sector_fit' || key === 'ebitda_quality' || key === 'revenue_durability') {
    return `${Math.round(val)}`;
  }
  if (key === 'vs_asking') {
    const sign = val >= 0 ? '+' : '';
    const label = val >= 0 ? 'Undervalued' : 'Overvalued';
    return `${label} (${sign}${val.toFixed(1)}%)`;
  }
  return String(val);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompareDeals({ session }) {
  const [deals, setDeals] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiRead, setAiRead] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    async function loadDeals() {
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setDeals(data || []);
      } catch (err) {
        console.error('Failed to load deals:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDeals();
  }, [session.user.id]);

  const selectedDeals = deals.filter(d => selectedIds.includes(d.id));

  // ─── Generate AI comparison summary ─────────────────────────────────────────
  useEffect(() => {
    if (selectedDeals.length < 2) {
      setAiRead('');
      return;
    }

    async function generateAIRead() {
      setAiLoading(true);
      try {
        const summaries = selectedDeals.map(d => {
          const bd = b(d.brief);
          return `Company: ${d.name}
Sector: ${bd.sector}
Revenue: ${bd.revenue}
Adjusted EBITDA: ${bd.ebitda} (Margin: ${bd.ebitda_margin}%)
Asking Price: ${bd.asking_price}
Deal Score: ${d.score}`;
        }).join('\n\n');

        const prompt = `You are a private equity investment screening analyst. Compare these investment opportunities side-by-side:

${summaries}

Write a short, professional summary (maximum 100 words) summarizing which deal appears stronger and why, based strictly on the comparison data.
Label it "AI Read" and start with a clear, concise sentence stating that this is an automated summary of extracted metrics for screening purposes, not investment advice. Limit the overall response to under 100 words total.`;

        const result = await callAI(prompt, 'Summarise deal comparison side-by-side.');
        setAiRead(result);
      } catch (err) {
        console.error('Failed to get AI Read:', err);
        setAiRead('Could not generate AI Read comparison summary at this time.');
      } finally {
        setAiLoading(false);
      }
    }

    const timer = setTimeout(generateAIRead, 400);
    return () => clearTimeout(timer);
  }, [selectedIds]);

  const toggleSelect = (id) => {
    setSelectedIds(current => {
      if (current.includes(id)) {
        return current.filter(x => x !== id);
      }
      if (current.length >= 3) {
        return current; // Cap at 3 selected deals
      }
      return [...current, id];
    });
  };

  // ─── Dynamic Conditional Cell Formatting ────────────────────────────────────
  const getCellFormatting = (key, deal) => {
    const { brief } = deal;
    if (!brief) return 'neutral';
    const bd = b(brief);
    const sector = bd.sector;
    const bm = getBenchmark(sector);
    const docCurr = bd.detected_currency;
    const currMap = { GBP: '£', USD: '$', EUR: '€', INR: '₹', AED: 'AED ' };
    const sym = currMap[docCurr] ?? docCurr ?? '£';

    const dealVal = getDealRowValue(deal, key, sym);
    if (dealVal == null) return 'neutral';

    if (key === 'name' || key === 'sector' || key === 'geography') return 'neutral';

    if (key === 'ecrm_rating') {
      if (dealVal === 'CLEAN') return 'green';
      if (dealVal === 'HIGH') return 'red';
      return 'neutral';
    }

    const higherIsBetter = {
      revenue: true,
      gross_margin: true,
      ebitda: true,
      ebitda_margin: true,
      asking_price: false,
      multiple: false,
      deal_score: true,
      sector_fit: true,
      ebitda_quality: true,
      revenue_durability: true,
      recurring_revenue: true,
      client_concentration: false,
      net_debt: false,
      val_bu: true,
      val_ue: true,
      val_composite: true,
      vs_asking: true,
    }[key];

    if (higherIsBetter === undefined) return 'neutral';

    // 1. Check Damodaran benchmark first
    let benchmarkVal = null;
    if (key === 'ebitda_margin' && bm?.ebitda_margin_median != null) {
      benchmarkVal = bm.ebitda_margin_median;
    } else if (key === 'multiple' && bm?.ev_ebitda_median != null) {
      benchmarkVal = bm.ev_ebitda_median;
    }

    if (benchmarkVal !== null) {
      if (dealVal > benchmarkVal) return higherIsBetter ? 'green' : 'red';
      if (dealVal < benchmarkVal) return higherIsBetter ? 'red' : 'green';
      return 'neutral';
    }

    // 2. Compare against other selected deals
    const otherVals = selectedDeals
      .map(d => {
        const dCurr = b(d.brief).detected_currency;
        const dSym = currMap[dCurr] ?? dCurr ?? '£';
        return getDealRowValue(d, key, dSym);
      })
      .filter(val => val != null);

    if (otherVals.length < 2) return 'neutral';

    const maxVal = Math.max(...otherVals);
    const minVal = Math.min(...otherVals);

    if (maxVal === minVal) return 'neutral';

    if (dealVal === maxVal) return higherIsBetter ? 'green' : 'red';
    if (dealVal === minVal) return higherIsBetter ? 'red' : 'green';

    return 'neutral';
  };

  const renderBenchmarkCell = (rowKey) => {
    const sectorBms = selectedDeals.map(d => {
      const s = b(d.brief).sector;
      const bm = getBenchmark(s);
      if (!bm) return null;
      let val = null;
      let unit = '';
      if (rowKey === 'ebitda_margin') {
        val = bm.ebitda_margin_median;
        unit = '%';
      } else if (rowKey === 'multiple') {
        val = bm.ev_ebitda_median;
        unit = 'x';
      }
      if (val == null) return null;
      return { sector: s, val, unit };
    }).filter(Boolean);

    if (sectorBms.length === 0) return '—';

    const uniqueSectors = [...new Set(sectorBms.map(item => item.sector))];
    if (uniqueSectors.length === 1) {
      return `${sectorBms[0].val}${sectorBms[0].unit}`;
    }

    return sectorBms.map(item => `${item.sector.slice(0, 10)}: ${item.val}${item.unit}`).join(' / ');
  };

  if (loading) {
    return <div className="empty-state"><span className="spinner" /></div>;
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'Libre Baskerville, serif', fontSize: '18px', fontWeight: 'bold' }}>Deal Comparison View</div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)' }}>
            Select 2 or 3 deals to display comparison · {selectedIds.length}/3 selected
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'Barlow, sans-serif' }}>
          Compare pipeline opportunities side-by-side with conditional highlights and automatic Damodaran sector benchmarks.
        </div>
      </div>

      {/* DEAL SELECTOR GRID */}
      {deals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '36px' }}>
          <div style={{ fontSize: '24px', opacity: 0.3, marginBottom: '8px' }}>⇄</div>
          <div className="mono muted" style={{ fontSize: '12px' }}>No deals saved in database yet. Upload deals through the IM Analyzer first.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {deals.map(deal => {
            const isSelected = selectedIds.includes(deal.id);
            const bd = b(deal.brief);
            return (
              <div
                key={deal.id}
                onClick={() => toggleSelect(deal.id)}
                style={{
                  background: 'var(--navy2)',
                  border: `1px solid ${isSelected ? 'var(--amber)' : 'var(--border)'}`,
                  borderRadius: '4px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 10px rgba(232, 168, 53, 0.1)' : 'none',
                }}
                onMouseEnter={e => !isSelected && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)')}
                onMouseLeave={e => !isSelected && (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                {isSelected && (
                  <div style={{ position: 'absolute', top: '8px', right: '12px', color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontSize: '10px', fontWeight: 'bold' }}>
                    ✓ SELECTED
                  </div>
                )}
                <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '80%' }}>
                  {deal.name}
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', marginTop: '4px', textTransform: 'uppercase' }}>
                  {bd.sector || 'Unclassified'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>DEAL SCORE</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '14px', color: 'var(--amber)', fontWeight: 'bold' }}>{deal.score || '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* COMPARISON VIEW */}
      {selectedDeals.length < 2 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: '4px', padding: '64px 20px', background: 'rgba(255,255,255,0.01)', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', opacity: 0.2, marginBottom: '12px' }}>⇆</div>
          <div style={{ fontFamily: 'Libre Baskerville, serif', fontSize: '13px', fontStyle: 'italic', color: 'var(--muted)' }}>
            Select at least 2 deals from the card list above to generate the comparison matrix.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* COMPARISON TABLE */}
          <div className="card" style={{ padding: 0, overflowX: 'auto', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--navy3)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', width: '240px' }}>Metric</th>
                  {selectedDeals.map(deal => (
                    <th key={deal.id} style={{ padding: '12px 16px', borderLeft: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', fontWeight: 600 }}>{deal.name}</div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)', marginTop: '2px', fontWeight: 'normal' }}>
                        Score: <span style={{ color: 'var(--amber)', fontWeight: 'bold' }}>{deal.score || '—'}</span>
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '12px 16px', borderLeft: '1px solid var(--border)', fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sector Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(row => (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 16px', fontFamily: 'Barlow, sans-serif', fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                      {row.label}
                    </td>
                    {selectedDeals.map(deal => {
                      const format = getCellFormatting(row.key, deal);
                      const bd = b(deal.brief);
                      const docCurr = bd.detected_currency;
                      const currMap = { GBP: '£', USD: '$', EUR: '€', INR: '₹', AED: 'AED ' };
                      const sym = currMap[docCurr] ?? docCurr ?? '£';
                      const val = getDealRowValue(deal, row.key, sym);

                      let bg = 'transparent';
                      let color = 'var(--text)';
                      if (format === 'green') {
                        bg = 'rgba(34, 197, 94, 0.05)';
                        color = 'var(--green)';
                      } else if (format === 'red') {
                        bg = 'rgba(239, 68, 68, 0.05)';
                        color = 'var(--red)';
                      }

                      return (
                        <td
                          key={deal.id}
                          style={{
                            padding: '10px 16px',
                            borderLeft: '1px solid var(--border)',
                            background: bg,
                            color: color,
                            fontFamily: row.key === 'name' || row.key === 'sector' || row.key === 'geography' ? 'var(--sans)' : 'var(--mono)',
                            fontSize: '12px',
                          }}
                        >
                          {formatDealRowValue(val, row.key, sym)}
                        </td>
                      );
                    })}
                    <td style={{ padding: '10px 16px', borderLeft: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
                      {renderBenchmarkCell(row.key)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI READ SUMMARY PANEL */}
          {selectedDeals.length >= 2 && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', borderLeft: '3px solid var(--amber)', background: 'rgba(232,168,53,0.02)', padding: '16px 20px', borderRadius: '0 4px 4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.5px', display: aiLoading ? 'inline-block' : 'none' }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 'bold', color: 'var(--amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>AI Read Summary</span>
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                {aiLoading ? 'Analysing deals side-by-side...' : aiRead}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
