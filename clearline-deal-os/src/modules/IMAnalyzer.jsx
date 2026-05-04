import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { extractPDFText } from '../lib/pdf';
import { callAI } from '../lib/ai';
import geoConfig from '../data/geography_config.json';

// ─── Canonical Schema ─────────────────────────────────────────────────────────
const EXTRACTION_SCHEMA = {
  document_type: 'information_memorandum | financial_statements | management_accounts | unknown',
  detected_currency: 'GBP | USD | EUR | INR | AED',
  company: {
    name: null,
    company_number: null,
    registered_address: null,
    hq_city: null,
    hq_country: null,
    founded_year: null,
    sector: null,
    sub_sector: null,
    ownership_structure: 'sole trader | partnership | limited company | unknown | null',
    employees_total: null,
    employees_fte: null,
    reason_for_sale: null,
    seller_name: null,
    adviser_name: null,
    adviser_firm: null,
  },
  financials: {
    reporting_year: null,
    revenue: null,
    revenue_prior_year: null,
    revenue_growth_pct: null,
    gross_profit: null,
    gross_margin_pct: null,
    ebitda_reported: null,
    ebitda_adjusted: null,
    ebitda_margin_pct: null,
    ebit: null,
    profit_before_tax: null,
    profit_after_tax: null,
    operating_cash_flow: null,
    free_cash_flow: null,
    capex: null,
    net_debt: null,
    net_cash: null,
    total_assets: null,
    net_assets: null,
    trade_debtors: null,
    trade_creditors: null,
    debtor_days: null,
  },
  deal: {
    asking_price: null,
    asking_ebitda_multiple: null,
    transaction_structure: 'share sale | asset sale | unknown | null',
    earnout_available: null,
    recurring_revenue_pct: null,
    top_client_concentration_pct: null,
    client_count: null,
  },
  qualitative: {
    strengths: [null, null, null],
    risks: [null, null, null],
    growth_opportunities: [null, null],
    key_management: [],
    certifications: [],
    summary_paragraph: null,
  },
  ecrm: {
    flags: [],
    overall_rating: 'HIGH | MEDIUM | LOW | CLEAN',
    document_quality: 'HIGH | MEDIUM | LOW',
  },
};

// ─── Unified Extraction Prompt ────────────────────────────────────────────────
const buildExtractionPrompt = (geography, geo) => `You are a financial document analyst. Your task is to extract information from the uploaded document and return it as a JSON object that exactly matches the schema below. Every field in the schema must appear in your response. If you cannot find a value for a field after searching the entire document, return null for that field. Never omit a field. Never add fields not in the schema. Never change field names. Return only the JSON object — no explanation, no markdown, no code fences.

SCHEMA:
${JSON.stringify(EXTRACTION_SCHEMA, null, 2)}

Now extract from the document. Search the entire document for each field.

EXTRACTION RULES:
- For all monetary values, return raw numbers in the document's base currency unit (e.g., 890000 for £890,000 — never return 890 or 0.89).
- For percentages, return the number without the % symbol (e.g., 13.1 for 13.1%).
- detected_currency: scan for currency symbols (£, $, €, ₹, AED) and currency statements ('in thousands of pounds', 'all figures in USD', etc). Set to 'GBP', 'USD', 'EUR', 'INR', or 'AED'.
- document_type: classify as 'information_memorandum' (sales document by adviser), 'financial_statements' (statutory accounts), 'management_accounts' (internal pack), or 'unknown'.
- financials.ebitda_adjusted: search for exact strings 'Adjusted EBITDA', 'adj. EBITDA', 'normalised EBITDA', 'EBITDA (adjusted)'. If a reconciliation table shows both Reported and Adjusted EBITDA, always use Adjusted. If only one EBITDA figure exists, use it for both ebitda_reported and ebitda_adjusted.
- deal.asking_ebitda_multiple: if not explicitly stated, calculate as asking_price divided by ebitda_adjusted if both values are present.
- financials.revenue_growth_pct: if not explicitly stated, calculate as ((revenue - revenue_prior_year) / revenue_prior_year) × 100 if both are present.
- financials.debtor_days: if not explicitly stated, calculate as (trade_debtors / revenue) × 365 if both are present.
- financials.net_debt / net_cash: if the document states a net cash position, set net_debt to 0 and net_cash to the positive value.
- qualitative.strengths: infer exactly 3 strengths from the financial data and business description even if not explicitly stated.
- qualitative.risks: infer exactly 3 risks from the financial data and business description even if not explicitly stated.
- company.sector: MUST NOT be null. Infer from business description if not explicitly stated. Fall back to 'Business & Consumer Services'.
- company.founded_year: Search for the following patterns to find the founding year: (1) 'Founded in [year]', (2) 'established in [year]', (3) 'incorporated in [year]', (4) 'since [year]', (5) 'Company was formed in [year]', (6) any 4-digit number between 1970 and 2020 appearing within 10 words of the words 'founded', 'established', 'incorporated', or 'formed'. Extract the 4-digit year. If multiple years are found in these patterns, take the earliest one. Return as a number.
- ecrm.flags: Scan EVERY section of the document INCLUDING ALL NUMBERED NOTES to the financial statements. Do NOT return CLEAN for any category unless you have explicitly searched the notes section and found no evidence. If the notes section is absent from the document, return severity MEDIUM with evidence 'Notes section not found — manual review required'. Return a flag object for each category:
  1. related_party_transactions: Only flag as LOW if there is explicit documentary evidence in the uploaded document — a direct quote or specific reference (e.g. 'Note 12: Dividends of £120,000 paid to director John Smith'). If no such evidence is found after searching the entire document, return severity CLEAN. Do not flag speculatively. The evidence field must contain the direct quote; if evidence is null, severity must be CLEAN. Any dividend payment to a director or shareholder found in the notes IS a related party transaction.
  2. director_loans: Only flag as LOW if there is explicit documentary evidence of a director loan balance in the notes to the accounts. The evidence field must contain a direct reference (e.g. 'Note 8: Director loan balance £45,000 outstanding'). If no evidence is found, return severity CLEAN. Do not flag speculatively.
  3. hmrc_tax: Search for any mention of HMRC, tax settlement, tax dispute, enquiry, investigation, or penalty.
  4. revenue_spike: Calculate year-on-year revenue growth from the financial data. Growth between 0–25% is normal trading — return CLEAN. Growth above 25% warrants investigation: flag as LOW with the exact growth percentage as evidence and note 'verify whether growth is sustainable or pre-sale window dressing'. Growth above 50% year-on-year should return MEDIUM severity.
  5. beneficial_ownership: Flag if beneficial owners are not clearly identified in the document.
  6. regulatory: Flag if any regulatory investigations or legal proceedings are mentioned anywhere in the document.
  7. companies_house: Companies House filing discrepancies — check if accounts filing dates match and no overdue filings are mentioned.
  8. hmrc_vat_paye: HMRC VAT or PAYE arrears — search for any mention of VAT disputes, PAYE arrears, or Time to Pay arrangements.
  9. director_disqualification: Director disqualification history — flag if any director disqualification is mentioned.

For the action field inside each flag: if severity is LOW, MEDIUM, or HIGH, the action field MUST contain a specific recommended buyer action in plain English, maximum 2 sentences. Use these as the baseline:
- related_party_transactions: 'Request a full schedule of all payments made to directors and connected parties for the last 3 years. Confirm all transactions are at arm\'s length and fully disclosed in statutory accounts.'
- director_loans: 'Obtain a director loan account reconciliation. Ensure all balances are repaid or formally documented before completion.'
- hmrc_tax or hmrc_vat_paye: 'Request HMRC correspondence and evidence of settlement. Obtain a tax indemnity from the seller in the SPA.'
- revenue_spike: 'Request monthly revenue breakdown for the last 24 months. Verify growth is from new contracts not accounting reclassification.'
- beneficial_ownership: 'Request a full PSC register extract from Companies House. Verify UBO identity through independent KYC process.'
- companies_house: 'Obtain current filing history from Companies House. Confirm no penalties or compulsory strike-off notices are outstanding.'
- director_disqualification: 'Conduct a director disqualification search on all directors at Companies House. Do not proceed until results are confirmed clean.'
- regulatory: 'Obtain details of the investigation and current status. Seek legal counsel opinion on residual liability before signing heads of terms.'
For CLEAN flags, set action to null.

Return ONLY the JSON object.`;

// ─── Validation Function ──────────────────────────────────────────────────────
function validateExtraction(data) {
  const warnings = [];

  // 1. Check top-level keys
  const required = ['document_type', 'detected_currency', 'company', 'financials', 'deal', 'qualitative', 'ecrm'];
  for (const key of required) {
    if (!(key in data)) {
      warnings.push(`Missing top-level key: ${key}`);
      data[key] = key === 'company' || key === 'financials' || key === 'deal' || key === 'qualitative' || key === 'ecrm' ? {} : null;
    }
  }

  // 2. Ensure ecrm structure
  if (!data.ecrm) data.ecrm = {};
  if (!Array.isArray(data.ecrm.flags)) data.ecrm.flags = [];
  if (!data.ecrm.overall_rating) data.ecrm.overall_rating = 'CLEAN';
  if (!data.ecrm.document_quality) data.ecrm.document_quality = 'MEDIUM';

  // 3. Ensure qualitative arrays
  if (!data.qualitative) data.qualitative = {};
  if (!Array.isArray(data.qualitative.strengths)) data.qualitative.strengths = [];
  if (!Array.isArray(data.qualitative.risks)) data.qualitative.risks = [];
  if (!Array.isArray(data.qualitative.growth_opportunities)) data.qualitative.growth_opportunities = [];
  if (!Array.isArray(data.qualitative.key_management)) data.qualitative.key_management = [];
  if (!Array.isArray(data.qualitative.certifications)) data.qualitative.certifications = [];

  // 4. Coerce numeric fields to numbers
  const numericFinancials = [
    'revenue', 'revenue_prior_year', 'revenue_growth_pct', 'gross_profit', 'gross_margin_pct',
    'ebitda_reported', 'ebitda_adjusted', 'ebitda_margin_pct', 'ebit', 'profit_before_tax',
    'profit_after_tax', 'operating_cash_flow', 'free_cash_flow', 'capex', 'net_debt', 'net_cash',
    'total_assets', 'net_assets', 'trade_debtors', 'trade_creditors', 'debtor_days', 'reporting_year',
  ];
  if (data.financials) {
    for (const field of numericFinancials) {
      if (data.financials[field] != null) {
        const parsed = parseFloat(data.financials[field]);
        if (!isNaN(parsed)) data.financials[field] = parsed;
        else { warnings.push(`Non-numeric value for financials.${field}: ${data.financials[field]}`); data.financials[field] = null; }
      }
    }
  }

  const numericDeal = ['asking_price', 'asking_ebitda_multiple', 'recurring_revenue_pct', 'top_client_concentration_pct', 'client_count'];
  if (data.deal) {
    for (const field of numericDeal) {
      if (data.deal[field] != null) {
        const parsed = parseFloat(data.deal[field]);
        if (!isNaN(parsed)) data.deal[field] = parsed;
        else { warnings.push(`Non-numeric value for deal.${field}: ${data.deal[field]}`); data.deal[field] = null; }
      }
    }
  }

  // 5. ebitda_adjusted fallback
  if (!data.financials) data.financials = {};
  if (data.financials.ebitda_adjusted == null && data.financials.ebitda_reported != null) {
    data.financials.ebitda_adjusted = data.financials.ebitda_reported;
    if (!Array.isArray(data.ecrm.flags)) data.ecrm.flags = [];
    data.ecrm.flags.push({
      category: 'EBITDA Quality',
      severity: 'MEDIUM',
      evidence: 'No adjusted EBITDA found — using reported EBITDA. Add-backs not verified.',
      action: 'Request full EBITDA bridge from seller showing all add-back adjustments.',
    });
    warnings.push('ebitda_adjusted was null — set to ebitda_reported. Flag added.');
  }

  // 6. Calculate asking_ebitda_multiple if missing
  if (!data.deal) data.deal = {};
  if (data.deal.asking_ebitda_multiple == null && data.deal.asking_price != null && data.financials.ebitda_adjusted != null && data.financials.ebitda_adjusted > 0) {
    data.deal.asking_ebitda_multiple = parseFloat((data.deal.asking_price / data.financials.ebitda_adjusted).toFixed(2));
    warnings.push('asking_ebitda_multiple calculated from asking_price / ebitda_adjusted.');
  }

  if (warnings.length > 0) console.warn('[IMAnalyzer] Validation warnings:', warnings);
  return data;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
function computeScores(data) {
  const sector = (data.company?.sector || '').toLowerCase();
  // Sector fit: baseline 70 for any mapped Damodaran sector, adjust up/down by category type
  // Penalty sectors explicitly outside acquisition thesis
  const offThesisSectors = ['manufacturing', 'agriculture', 'oil', 'gas', 'mining', 'fishing', 'forestry'];
  const premiumSectors   = ['b2b', 'business & consumer', 'software', 'technology services', 'professional services',
                            'it services', 'managed services', 'consulting', 'saas', 'facilities', 'itad', 'recycling',
                            'healthcare support', 'human resources', 'staffing'];
  const isOffThesis   = offThesisSectors.some(t => sector.includes(t));
  const isPremium     = premiumSectors.some(t => sector.includes(t));
  const sectorFit     = isOffThesis ? 35 : isPremium ? 80 : 70;  // 70 = mapped but neutral; 80 = on-thesis; 35 = off-thesis

  const margin = data.financials?.ebitda_margin_pct;
  const ebitdaQuality = margin == null ? 40 : margin > 20 ? 85 : margin > 12 ? 65 : 40;

  const recurringPct = data.deal?.recurring_revenue_pct;
  const revDurability = recurringPct == null ? 50 : recurringPct > 70 ? 85 : recurringPct > 40 ? 65 : 40;

  const mgmtDep = 50; // Cannot score without explicit management data

  const rollup = 50; // Base — AI cannot reliably score without strategic narrative

  const multiple = data.deal?.asking_ebitda_multiple;
  const askingScore = multiple == null ? 0
    : multiple < 5 ? 90
    : multiple <= 7 ? 75
    : multiple <= 9 ? 55
    : multiple <= 12 ? 30
    : 10;

  const total = Math.round(sectorFit * 0.20 + ebitdaQuality * 0.20 + revDurability * 0.15 + mgmtDep * 0.15 + rollup * 0.15 + askingScore * 0.15);

  return { sector_fit: sectorFit, ebitda_quality: ebitdaQuality, revenue_durability: revDurability, management_dependency: mgmtDep, rollup_potential: rollup, asking_multiple_score: askingScore, total };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const severityColor = { HIGH: 'var(--red)', MEDIUM: 'var(--amber)', LOW: 'var(--blue)', CLEAN: 'var(--green)' };

const riskBadgeStyle = (risk) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '2px',
  fontFamily: 'DM Mono, monospace',
  fontSize: '9px',
  letterSpacing: '0.08em',
  background: risk === 'CLEAN' ? 'rgba(34,197,94,0.12)' : risk === 'LOW' ? 'rgba(96,165,250,0.12)' : risk === 'MEDIUM' ? 'rgba(232,168,53,0.15)' : 'rgba(239,68,68,0.12)',
  color: severityColor[risk] || 'var(--muted)',
  border: `1px solid ${severityColor[risk] || 'var(--border)'}`,
});

const currencySymbol = (cur) => ({ GBP: '£', USD: '$', EUR: '€', INR: '₹', AED: 'AED ' }[cur] || '£');

function fmtMoney(val, cur = 'GBP') {
  if (val == null) return '—';
  const sym = currencySymbol(cur);
  if (Math.abs(val) >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `${sym}${Math.round(val).toLocaleString()}`;
  return `${sym}${val}`;
}

function fmtPct(val) { return val == null ? '—' : `${Number(val).toFixed(1)}%`; }
function fmtNum(val) { return val == null ? '—' : String(val); }
function fmtStr(val) { return val == null || val === '' ? '—' : val; }

// ─── ExtractionResults Component ─────────────────────────────────────────────
function ExtractionResults({ data, setActive }) {
  const cur = data.detected_currency || 'GBP';
  const co = data.company || {};
  const fin = data.financials || {};
  const deal = data.deal || {};
  const qual = data.qualitative || {};
  const ecrm = data.ecrm || {};
  const scores = data._scores || {};

  const overallRisk = ecrm.overall_rating || 'CLEAN';
  const ecrmBorderColor = overallRisk === 'HIGH' ? 'var(--red)' : overallRisk === 'MEDIUM' ? 'var(--amber)' : 'var(--border)';

  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)', minWidth: '140px' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--text)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );

  const sectionLabel = (t) => <div className="section-label" style={{ marginBottom: '10px', marginTop: '16px' }}>{t}</div>;

  return (
    <div style={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '20px' }}>
      {/* Currency badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', letterSpacing: '0.1em', background: 'rgba(232,168,53,0.1)', color: 'var(--amber)', border: '1px solid var(--border2)', borderRadius: '2px', padding: '2px 8px' }}>
          {cur} · {fmtStr(data.document_type?.replace(/_/g, ' ').toUpperCase())}
        </span>
        <span className="mono muted" style={{ fontSize: '9px' }}>Figures from source document</span>
      </div>

      {/* ── Headline metrics grid ── */}
      <div className="grid-2 mb-20" style={{ gap: '10px' }}>
        {[
          { label: 'Revenue',        val: fmtMoney(fin.revenue, cur) },
          { label: 'Adj. EBITDA',    val: fmtMoney(fin.ebitda_adjusted, cur) },
          { label: 'EBITDA Margin',  val: fmtPct(fin.ebitda_margin_pct) },
          { label: 'Gross Profit',   val: fmtMoney(fin.gross_profit, cur) },
          { label: 'Asking Price',   val: fmtMoney(deal.asking_price, cur) },
          { label: 'EV / EBITDA',    val: deal.asking_ebitda_multiple != null ? `${deal.asking_ebitda_multiple}x` : '—' },
        ].map((m, i) => (
          <div key={i} className="metric" style={{ padding: '12px' }}>
            <div className="metric-label">{m.label}</div>
            <div className="mono amber" style={{ fontSize: '15px' }}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid-2" style={{ gap: '20px', marginBottom: '16px' }}>
        {/* LEFT — Company Overview */}
        <div>
          {sectionLabel('COMPANY OVERVIEW')}
          {row('Name', fmtStr(co.name))}
          {row('Co. Number', fmtStr(co.company_number))}
          {row('Sector', fmtStr(co.sector))}
          {row('Sub-sector', fmtStr(co.sub_sector))}
          {row('HQ City', fmtStr(co.hq_city))}
          {row('HQ Country', fmtStr(co.hq_country))}
          {row('Founded', co.founded_year != null ? String(co.founded_year) : '—')}
          {row('Ownership', fmtStr(co.ownership_structure))}
          {row('Employees (Total)', fmtNum(co.employees_total))}
          {row('Employees (FTE)', fmtNum(co.employees_fte))}
          {row('Reason for Sale', fmtStr(co.reason_for_sale))}
          {row('Seller', fmtStr(co.seller_name))}
          {row('Adviser', co.adviser_name ? `${co.adviser_name} · ${co.adviser_firm || ''}` : '—')}
        </div>

        {/* RIGHT — Financial Summary */}
        <div>
          {sectionLabel('FINANCIAL SUMMARY')}
          {row('Reporting Year', fmtNum(fin.reporting_year))}
          {row('Revenue', fmtMoney(fin.revenue, cur))}
          {row('Revenue (Prior Year)', fmtMoney(fin.revenue_prior_year, cur))}
          {row('Revenue Growth', fmtPct(fin.revenue_growth_pct))}
          {row('Gross Profit', fmtMoney(fin.gross_profit, cur))}
          {row('Gross Margin', fmtPct(fin.gross_margin_pct))}
          {row('EBITDA (Reported)', fmtMoney(fin.ebitda_reported, cur))}
          {row('EBITDA (Adjusted)', fmtMoney(fin.ebitda_adjusted, cur))}
          {row('EBITDA Margin', fmtPct(fin.ebitda_margin_pct))}
          {row('EBIT', fmtMoney(fin.ebit, cur))}
          {row('PBT', fmtMoney(fin.profit_before_tax, cur))}
          {row('PAT', fmtMoney(fin.profit_after_tax, cur))}
          {row('Op. Cash Flow', fmtMoney(fin.operating_cash_flow, cur))}
          {row('Free Cash Flow', fmtMoney(fin.free_cash_flow, cur))}
          {row('CapEx', fmtMoney(fin.capex, cur))}
          {row('Net Debt', fmtMoney(fin.net_debt, cur))}
          {row('Net Cash', fmtMoney(fin.net_cash, cur))}
          {row('Total Assets', fmtMoney(fin.total_assets, cur))}
          {row('Net Assets', fmtMoney(fin.net_assets, cur))}
          {row('Trade Debtors', fmtMoney(fin.trade_debtors, cur))}
          {row('Trade Creditors', fmtMoney(fin.trade_creditors, cur))}
          {row('Debtor Days', fin.debtor_days != null ? `${fin.debtor_days.toFixed(0)} days` : '—')}
        </div>
      </div>

      {/* ── Deal Terms ── */}
      {sectionLabel('DEAL TERMS')}
      {(() => {
        const isFS = data.document_type === 'financial_statements';
        const fsNote = <span style={{ fontStyle: 'italic', fontSize: '9px', color: 'var(--muted)', maxWidth: '200px', display: 'inline-block', lineHeight: 1.5 }}>Not stated in this document. If this is a financial statements upload, cross-reference with the Information Memorandum for asking price and deal terms.</span>;
        const nullVal = (v, formatter) => v != null ? formatter(v) : (isFS ? fsNote : '—');
        return (
          <div className="grid-2" style={{ gap: '20px', marginBottom: '16px' }}>
            <div>
              {row('Asking Price', nullVal(deal.asking_price, v => fmtMoney(v, cur)))}
              {row('EV/EBITDA Multiple', nullVal(deal.asking_ebitda_multiple, v => `${v}x`))}
              {row('Transaction Structure', nullVal(deal.transaction_structure, fmtStr))}
              {row('Earnout Available', nullVal(deal.earnout_available, v => v ? 'Yes' : 'No'))}
            </div>
            <div>
              {row('Recurring Revenue', nullVal(deal.recurring_revenue_pct, fmtPct))}
              {row('Top Client Concentration', nullVal(deal.top_client_concentration_pct, fmtPct))}
              {row('Client Count', nullVal(deal.client_count, fmtNum))}
            </div>
          </div>
        );
      })()}

      {/* ── Qualitative ── */}
      {sectionLabel('QUALITATIVE')}
      <div className="grid-2 mb-20" style={{ gap: '20px' }}>
        <div>
          <div className="section-label" style={{ fontSize: '9px', marginBottom: '6px', color: 'var(--green)' }}>STRENGTHS</div>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', fontSize: '12px', lineHeight: 1.7 }}>
            {(qual.strengths || []).filter(Boolean).map((s, i) => <li key={i} style={{ color: 'var(--text)' }}>{s}</li>)}
            {!(qual.strengths || []).filter(Boolean).length && <li style={{ color: 'var(--muted)' }}>Not found in document</li>}
          </ul>
          {(qual.growth_opportunities || []).filter(Boolean).length > 0 && <>
            <div className="section-label" style={{ fontSize: '9px', marginTop: '10px', marginBottom: '6px', color: 'var(--blue)' }}>GROWTH OPPORTUNITIES</div>
            <ul style={{ listStyleType: 'disc', paddingLeft: '18px', fontSize: '12px', lineHeight: 1.7 }}>
              {qual.growth_opportunities.filter(Boolean).map((s, i) => <li key={i} style={{ color: 'var(--text)' }}>{s}</li>)}
            </ul>
          </>}
        </div>
        <div>
          <div className="section-label" style={{ fontSize: '9px', marginBottom: '6px', color: 'var(--red)' }}>RISKS</div>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', fontSize: '12px', lineHeight: 1.7 }}>
            {(qual.risks || []).filter(Boolean).map((s, i) => <li key={i} style={{ color: 'var(--text)' }}>{s}</li>)}
            {!(qual.risks || []).filter(Boolean).length && <li style={{ color: 'var(--muted)' }}>Not found in document</li>}
          </ul>
        </div>
      </div>

      {qual.summary_paragraph && (
        <div className="highlight-box serif mb-20" style={{ fontStyle: 'italic' }}>
          {qual.summary_paragraph}
        </div>
      )}

      {/* ── Scoring bars ── */}
      {Object.keys(scores).filter(k => k !== 'total').length > 0 && (
        <div className="mb-20">
          {sectionLabel('DEAL SCORES')}
          {Object.entries(scores).filter(([k]) => k !== 'total').map(([k, v]) => (
            <div key={k} className="mb-8">
              <div className="flex justify-between mono" style={{ fontSize: '9px', marginBottom: '4px' }}>
                <span>{k.replace(/_/g, ' ').toUpperCase()}</span><span>{v}/100</span>
              </div>
              <div className="score-track">
                <div className="score-fill" style={{ width: `${v}%`, backgroundColor: v >= 75 ? 'var(--green)' : v >= 55 ? 'var(--amber)' : 'var(--red)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ECRM Panel ── */}
      <div style={{ border: `1px solid ${ecrmBorderColor}`, borderLeft: `3px solid ${ecrmBorderColor}`, borderRadius: '4px', padding: '16px', background: 'var(--navy3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div className="section-label">ECRM SCREENING</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)' }}>Doc Quality: {ecrm.document_quality || '—'}</span>
            <span style={riskBadgeStyle(overallRisk)}>{overallRisk}</span>
          </div>
        </div>
        {(ecrm.flags || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ecrm.flags.map((flag, i) => (
              <div key={i} style={{ background: 'var(--navy2)', borderRadius: '3px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={riskBadgeStyle(flag.severity)}>{flag.severity}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--text)' }}>{flag.category}</span>
                </div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                  <strong style={{ color: 'var(--text)' }}>Evidence:</strong> {flag.evidence || '—'}
                </div>
                {flag.severity !== 'CLEAN' && flag.action && (
                  <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '12px', color: 'var(--amber)' }}>
                    → {flag.action}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--green)' }}>
            No economic crime risk indicators identified in this document.
          </div>
        )}
        <div style={{ marginTop: '12px', fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
          This screening is based on document analysis only. It does not substitute for legal due diligence, AML checks, or beneficial ownership verification.
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex gap-12" style={{ marginTop: '20px' }}>
        <button className="btn btn-primary" onClick={() => setActive('scorer')}>Send to Scorer →</button>
        <button className="btn btn-outline" onClick={() => setActive('valuation')}>Valuation Engine →</button>
        <button className="btn btn-outline" onClick={() => setActive('memo')}>Decision Brief →</button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IMAnalyzer({ setActive, currentDeal, setCurrentDeal, session, geography }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);

  const geo = geoConfig[geography] || geoConfig['UK'];

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      setStatus('Extracting text from PDF...');
      const text = await extractPDFText(file);

      setStatus('Running AI extraction + ECRM screening...');
      const prompt = buildExtractionPrompt(geography, geo);
      const aiRes = await callAI(prompt, text);

      // Parse
      const cleanJson = aiRes.replace(/```json/gi, '').replace(/```/g, '').trim();
      let raw;
      try {
        raw = JSON.parse(cleanJson);
      } catch (parseErr) {
        throw new Error(`AI returned invalid JSON. Raw response starts: ${cleanJson.slice(0, 200)}`);
      }

      // Validate + enrich
      const validated = validateExtraction(raw);

      // Compute scores
      const scores = computeScores(validated);
      validated._scores = scores;

      // Build deal data for Supabase + downstream modules
      const dealData = {
        name: validated.company?.name || 'Unknown',
        sector: validated.company?.sector,
        ebitda: validated.financials?.ebitda_adjusted,
        score: scores.total,
        brief: validated,   // the entire validated schema is stored as brief
        user_id: session.user.id,
      };

      setStatus('Saving to database...');
      const { error: dbError } = await supabase
        .from('deals')
        .upsert(dealData, { onConflict: 'name,user_id' });

      if (dbError) {
        const { error: insError } = await supabase.from('deals').insert(dealData);
        if (insError) {
          console.error('DB persistence failed:', insError);
          throw new Error('Analysis complete but failed to save — please refresh and try again.');
        }
      }

      setCurrentDeal(dealData);
    } catch (err) {
      setError(err.message.includes('Analysis complete') ? err.message : 'Analysis failed: ' + err.message);
    } finally {
      setLoading(false);
      setStatus('');
      e.target.value = null;
    }
  };

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '40% 60%', gap: '20px' }}>
      {/* LEFT — Upload panel */}
      <div>
        <div className="upload-zone mb-20" onClick={() => document.getElementById('pdf-upload').click()}>
          <div className="amber" style={{ fontSize: '32px', marginBottom: '16px' }}>⟁</div>
          <div className="serif" style={{ fontSize: '18px', marginBottom: '8px' }}>Upload Document</div>
          <div className="mono muted">Information Memorandum · Financial Statements · Management Accounts</div>
          <div className="mono muted" style={{ fontSize: '10px', marginTop: '8px' }}>
            AI auto-detects document type · ECRM screening included · {geo.flag} {geography} flags applied
          </div>
          <input id="pdf-upload" type="file" accept=".pdf" hidden onChange={handleUpload} />
        </div>

        {loading && (
          <div className="flex items-center gap-12 muted mono mt-16">
            <span className="spinner" /> {status}
          </div>
        )}
        {error && <div className="error-msg">{error}</div>}

        {/* Info box */}
        <div style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: '4px', padding: '16px', marginTop: '16px' }}>
          <div className="section-label" style={{ marginBottom: '10px' }}>EXTRACTION ENGINE v2</div>
          <div className="mono muted" style={{ fontSize: '10px', lineHeight: 1.8 }}>
            Schema-first extraction — all fields extracted against a fixed canonical schema.<br/>
            Auto-validates numeric fields · calculates derived metrics.<br/>
            ECRM flags cover related parties, director loans, tax disputes, and geography-specific risks.
          </div>
        </div>
      </div>

      {/* RIGHT — Results */}
      {currentDeal?.brief ? (
        <ExtractionResults data={currentDeal.brief} setActive={setActive} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px', minHeight: '400px' }}>
          <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>◎</div>
            <div className="mono" style={{ fontSize: '12px' }}>Upload a document to begin extraction</div>
          </div>
        </div>
      )}
    </div>
  );
}
