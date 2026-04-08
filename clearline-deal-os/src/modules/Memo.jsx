import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { callAI } from '../lib/ai';
import Tooltip from '../components/shared/Tooltip';

const DEAL_DECISION_PROMPT = `You are a senior deal analyst at a UK private equity firm. You are preparing a Deal Decision Brief for Oscar Lindhardt, Founder of Clearline Capital — a solo PE operator building a UK B2B Services roll-up platform. Oscar has no traditional finance background. He acquires 1-2 businesses per year, targets £500K–£3M EBITDA, and needs this brief to be direct, specific, and actionable.

You will receive structured deal data extracted from an Information Memorandum. Generate a full Deal Decision Brief with exactly these eight sections. Be specific to THIS deal — never generic. Use company names, contract names, actual numbers from the data. Write like a trusted advisor who has seen hundreds of deals, not like a report generator.

SECTION 1 — INVESTMENT CASE
Write 3-4 sentences making the strongest honest case FOR this acquisition. Reference specific financials and attributes. Explain WHY each attribute matters for a roll-up strategy specifically. Not bullet points — flowing analytical prose.

SECTION 2 — RED FLAGS & CONCERNS
Write 3-4 sentences on the most material risks. For each risk, explain the downstream consequence if it materialises. Be direct — if a risk is deal-threatening, say so. Not a list — prose.

SECTION 3 — MARKET & SECTOR CONTEXT
2-3 sentences placing this deal in the current UK M&A market. Reference realistic EBITDA multiples for this sector and size. Comment on whether the asking price is fair, cheap, or full. Comment on sector tailwinds or headwinds relevant to the thesis.

SECTION 4 — ROLL-UP PLATFORM ASSESSMENT
3-4 sentences assessing this business specifically as a PLATFORM acquisition — the first in a series. Does it have the accreditations, management depth, systems, and geographic position to serve as a base for add-on acquisitions? What does acquiring this business unlock for deal two?

SECTION 5 — PRE-SELLER-CALL QUESTIONS (ranked, max 5)
List exactly 5 questions Oscar must get answered before or on the seller call. Format each as:
"[Question] — [Why this question matters / what a bad answer looks like]"
Rank them 1-5 by importance. Be deal-specific. No generic DD questions.

SECTION 6 — WHO TO SPEAK TO AND WHAT TO ASK
Three subsections:

BROKER ([broker name if known, else "the broker"]):
What to request from them before the seller call. Specific documents and information.

SELLER ([owner name if known, else "the owner"]):
3 specific probing questions for the seller call that go beyond the IM. Focus on things the IM cannot tell you — personal motivations, relationship dynamics, operational truths.

LENDER:
Given the asking price and EBITDA, outline what a realistic senior debt structure looks like (3-3.5x EBITDA is standard for UK SME FM). Tell Oscar what to ask his bank about this specific deal.

SECTION 7 — AI RECOMMENDATION
One paragraph. The AI gives its own clear recommendation — CONDITIONAL GO, GO, or NO-GO — with specific conditions if conditional. State what would need to be true for this to become a full GO. State what single factor would flip this to a NO-GO. Be direct and decisive.

SECTION 8 — IF THIS GOES AHEAD: IMMEDIATE NEXT STEPS
Numbered list of exactly 4 actions in chronological order, each with a timeframe. These are the specific next steps in the deal process after Oscar makes his decision. Reference real PE process steps: EOI submission, seller call, management accounts request, heads of terms, exclusivity, DD kick-off.

Respond with exactly these 8 sections in order. Use the section titles exactly as written above. No preamble, no summary, no closing remarks. Just the 8 sections.`;

const SECTION_TITLES = [
  'SECTION 1 — INVESTMENT CASE',
  'SECTION 2 — RED FLAGS & CONCERNS',
  'SECTION 3 — MARKET & SECTOR CONTEXT',
  'SECTION 4 — ROLL-UP PLATFORM ASSESSMENT',
  'SECTION 5 — PRE-SELLER-CALL QUESTIONS (ranked, max 5)',
  'SECTION 6 — WHO TO SPEAK TO AND WHAT TO ASK',
  'SECTION 7 — AI RECOMMENDATION',
  'SECTION 8 — IF THIS GOES AHEAD: IMMEDIATE NEXT STEPS',
];

function getScoreColor(score) {
  if (score >= 75) return 'var(--green)';
  if (score >= 55) return 'var(--amber)';
  return 'var(--red)';
}

// Strip common markdown formatting the LLM may emit
function cleanMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')        // ## headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // **bold**
    .replace(/\*(.+?)\*/g, '$1')        // *italic*
    .replace(/__(.+?)__/g, '$1')        // __bold__
    .replace(/_(.+?)_/g, '$1')          // _italic_
    .replace(/`(.+?)`/g, '$1')          // `code`
    .replace(/^>\s+/gm, '')             // > blockquotes
    .replace(/^[-*+]\s+/gm, '')         // unordered list markers (bare)
    .trim();
}

function parseSections(text) {
  const sections = [];
  let remaining = text;
  for (let i = 0; i < SECTION_TITLES.length; i++) {
    const title = SECTION_TITLES[i];
    const nextTitle = SECTION_TITLES[i + 1];
    const start = remaining.indexOf(title);
    if (start === -1) continue;
    const contentStart = start + title.length;
    const end = nextTitle ? remaining.indexOf(nextTitle) : remaining.length;
    sections.push({
      title,
      content: cleanMarkdown(remaining.slice(contentStart, end !== -1 ? end : undefined).trim()),
      index: i,
    });
  }
  return sections;
}

function renderSection5(content) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {lines.map((line, i) => {
        const dashIdx = line.indexOf(' — ');
        if (dashIdx !== -1) {
          const question = line.slice(0, dashIdx).replace(/^\d+\.\s*/, '');
          const reasoning = line.slice(dashIdx + 3);
          const num = line.match(/^(\d+)/)?.[1] || (i + 1);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: '8px' }}>
              <span style={{ color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontSize: '12px', paddingTop: '2px' }}>{num}.</span>
              <div>
                <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.7 }}>{question}</div>
                <div style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic', lineHeight: 1.6 }}>— {reasoning}</div>
              </div>
            </div>
          );
        }
        return <div key={i} style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.8 }}>{line}</div>;
      })}
    </div>
  );
}

function renderSection6(content) {
  const subLabels = ['BROKER', 'SELLER', 'LENDER'];
  const parts = [];
  let remaining = content;
  for (let i = 0; i < subLabels.length; i++) {
    const label = subLabels[i];
    const next = subLabels[i + 1];
    const start = remaining.search(new RegExp(label, 'i'));
    if (start === -1) continue;
    const contentStart = start + label.length;
    const end = next ? remaining.search(new RegExp(next, 'i')) : remaining.length;
    parts.push({ label, content: remaining.slice(contentStart, end !== -1 ? end : undefined).replace(/^[\s:]+/, '').trim() });
  }
  if (!parts.length) {
    return <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{content}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {parts.map((p, i) => (
        <div key={i}>
          <div style={{ color: 'var(--blue)', fontFamily: 'DM Mono, monospace', fontSize: '10px', letterSpacing: '0.12em', marginBottom: '6px' }}>{p.label}</div>
          <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{p.content}</div>
        </div>
      ))}
    </div>
  );
}

function renderSection7(content) {
  return (
    <div style={{
      borderLeft: '2px solid var(--amber)',
      background: 'rgba(232,168,53,0.05)',
      padding: '14px 16px',
      fontFamily: 'Libre Baskerville, serif',
      fontStyle: 'italic',
      fontSize: '13px',
      lineHeight: 1.8,
      color: 'var(--text)',
    }}>
      {content}
    </div>
  );
}

function renderSection8(content) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {lines.map((line, i) => {
        const match = line.match(/^(\d+)\.\s*(.*)/);
        if (match) {
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '10px' }}>
              <span style={{ color: 'var(--amber)', fontFamily: 'DM Mono, monospace', fontSize: '12px', paddingTop: '2px' }}>{match[1]}.</span>
              <span style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.7 }}>{match[2]}</span>
            </div>
          );
        }
        return <div key={i} style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.8 }}>{line}</div>;
      })}
    </div>
  );
}

function renderSectionContent(section) {
  if (section.index === 4) return renderSection5(section.content);
  if (section.index === 5) return renderSection6(section.content);
  if (section.index === 6) return renderSection7(section.content);
  if (section.index === 7) return renderSection8(section.content);
  return <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{section.content}</div>;
}

export default function Memo({ currentDeal, session, setActive }) {
  const overallScore = currentDeal?.score || 0;
  const [decision, setDecision] = useState('CONDITIONAL GO');
  const [additionalContext, setAdditionalContext] = useState('');
  const [generatedBrief, setGeneratedBrief] = useState('');
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSections([]);
    setGeneratedBrief('');
    try {
      const userContent = `Deal data:\n${JSON.stringify(currentDeal, null, 2)}\n\nWeighted deal score: ${overallScore}/100\n\nOscar's decision: ${decision}\n\nAdditional context from Oscar: ${additionalContext || 'None provided.'}\n\nToday's date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      const res = await callAI(DEAL_DECISION_PROMPT, userContent);
      setGeneratedBrief(res);
      setSections(parseSections(res));
    } catch (err) {
      setError('Generation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedBrief) return;
    setSaving(true);
    setError(null);
    try {
      const { error: dbErr } = await supabase.from('memos').upsert({
        user_id: session.user.id,
        deal_name: currentDeal?.name || currentDeal?.brief?.company_name || 'Unknown',
        decision,
        score: overallScore,
        content: generatedBrief,
      }, { onConflict: 'deal_name,user_id' });
      if (dbErr) {
        // Fallback to insert if no unique constraint
        const { error: insErr } = await supabase.from('memos').insert({
          user_id: session.user.id,
          deal_name: currentDeal?.name || currentDeal?.brief?.company_name || 'Unknown',
          decision,
          score: overallScore,
          content: generatedBrief,
        });
        if (insErr) throw insErr;
      }
      alert('Brief saved to deal.');
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedBrief);
    alert('Brief copied to clipboard.');
  };

  const handleEmail = () => {
    const companyName = currentDeal?.name || currentDeal?.brief?.company_name || 'Deal';
    const subject = encodeURIComponent(`Deal Decision Brief — ${companyName}`);
    const body = encodeURIComponent(generatedBrief);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // Empty state
  if (!currentDeal) {
    return (
      <div className="empty-state" style={{ paddingTop: '120px' }}>
        <div className="empty-icon">▤</div>
        <div className="empty-text" style={{ fontFamily: 'Libre Baskerville, serif', fontStyle: 'italic', marginBottom: '20px' }}>
          Analyse an IM first to unlock this module.
        </div>
        <button className="btn btn-primary" onClick={() => setActive('im')}>Go to IM Analyzer →</button>
      </div>
    );
  }

  const companyName = currentDeal?.brief?.company_name || currentDeal?.name || '—';
  const sector = currentDeal?.brief?.sector || '—';
  const hq = currentDeal?.brief?.hq_location || '—';
  const askingPrice = currentDeal?.brief?.asking_price || '—';
  const askingMultiple = currentDeal?.brief?.asking_multiple || '—';
  const ebitda = currentDeal?.brief?.ebitda_ttm || currentDeal?.ebitda || '—';

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '38% 62%', gap: '20px', height: '100%' }}>
      {/* LEFT — Deal context + Oscar's call */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Deal summary card */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="serif" style={{ fontSize: '16px', marginBottom: '4px' }}>{companyName}</div>
          <div className="mono muted" style={{ fontSize: '11px', marginBottom: '14px' }}>{sector} · {hq}</div>

          {/* Score badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{
              background: getScoreColor(overallScore),
              color: '#0d1117',
              fontFamily: 'DM Mono, monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '3px',
              letterSpacing: '0.05em',
            }}>
              {overallScore}/100
            </div>
            <span className="mono muted" style={{ fontSize: '11px' }}>DEAL SCORE</span>
          </div>

          {/* Metric row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'ASKING PRICE', value: askingPrice },
              { label: 'MULTIPLE', value: askingMultiple },
              { label: 'EBITDA', value: ebitda },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px' }}>
                <div className="mono muted" style={{ fontSize: '8px', letterSpacing: '0.12em', marginBottom: '4px' }}>{m.label}</div>
                <div className="mono amber" style={{ fontSize: '12px' }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Oscar's call */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="section-label" style={{ marginBottom: '16px' }}>YOUR CALL</div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center' }}>Decision<Tooltip text="GO = submit EOI. CONDITIONAL GO = seller call first. NO-GO = pass." /></label>
            <select value={decision} onChange={e => setDecision(e.target.value)}>
              <option value="CONDITIONAL GO">CONDITIONAL GO</option>
              <option value="GO">GO</option>
              <option value="NO-GO">NO-GO</option>
            </select>
          </div>

          <div className="field" style={{ marginBottom: '20px' }}>
            <label>Additional context <span className="muted">(optional)</span></label>
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              placeholder="Any personal context the AI wouldn't know — e.g. you've met the owner, you have a lender lined up, a competitor is also circling..."
              rows={3}
              style={{ resize: 'none' }}
            />
          </div>

          <button
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center' }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? <><span className="spinner" /> Thinking through the deal...</> : 'Generate Decision Brief'}
          </button>

          {error && <div className="error-msg" style={{ marginTop: '12px' }}>{error}</div>}
        </div>
      </div>

      {/* RIGHT — AI Output */}
      <div style={{
        background: 'var(--navy2)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: '600px',
      }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '40px', color: 'var(--muted)' }}>
            <span className="spinner" />
            <span className="mono" style={{ fontSize: '13px' }}>Thinking through the deal...</span>
          </div>
        )}

        {!loading && sections.length === 0 && (
          <div className="empty-state" style={{ paddingTop: '100px' }}>
            <div className="empty-icon">▤</div>
            <div className="empty-text">Set your call and generate the brief</div>
          </div>
        )}

        {sections.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {sections.map((section, i) => (
              <div key={i}>
                <div style={{
                  fontFamily: 'DM Mono, monospace',
                  fontSize: '9px',
                  color: 'var(--amber)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                }}>
                  {section.title}
                </div>
                {renderSectionContent(section)}
                {i < sections.length - 1 && (
                  <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />
                )}
              </div>
            ))}

            {/* Action bar */}
            <div style={{
              display: 'flex',
              gap: '12px',
              borderTop: '1px solid var(--border)',
              paddingTop: '20px',
              marginTop: '24px',
            }}>
              <button className="btn btn-outline" onClick={handleCopy}>Copy Brief</button>
              <button className="btn btn-outline" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save to Deal'}
              </button>
              <button className="btn btn-primary" onClick={handleEmail}>Email Draft →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
