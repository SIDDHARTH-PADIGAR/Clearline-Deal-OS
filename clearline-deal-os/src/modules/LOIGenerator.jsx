import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { callAI } from '../lib/ai';

const LOI_SYSTEM_PROMPT = `You are a UK M&A solicitor drafting a Letter of Intent (also known as Heads of Terms) on behalf of Clearline Capital Ltd, the buyer. This is a non-binding expression of interest in acquiring the target company via a share purchase. Write in standard UK M&A legal style — formal, precise, unambiguous. Use British spelling throughout.

Generate a complete LOI with the following sections:

1. PARTIES
Buyer: Clearline Capital Ltd, registered in England and Wales.
Seller: [seller name] as owner of [company name].
Adviser to seller: [broker name].

2. PROPOSED TRANSACTION
Brief description of what is being acquired and on what basis (shares vs assets).
State that this letter is non-binding except where explicitly stated.

3. PURCHASE PRICE & STRUCTURE
State the proposed enterprise value. State cash-free, debt-free basis if applicable.
Include working capital peg reference. Reference earnout if applicable.

4. CONDITIONS PRECEDENT
List the conditions that must be satisfied before exchange of contracts.
Always include: satisfactory completion of financial, legal and commercial due diligence; board approval of Clearline Capital; financing being in place on acceptable terms. Add any buyer-specified conditions.

5. EXCLUSIVITY
State that the seller agrees not to solicit, entertain or enter into discussions with any third party regarding a sale of the business for [X] weeks from the date of this letter. State that this clause IS binding.

6. DUE DILIGENCE
Outline the proposed DD process, timeline, and access requirements. Buyer requires access to: management accounts (3 years), customer contracts, employee records, property leases, and any material litigation disclosures.

7. CONFIDENTIALITY
Both parties confirm existing NDA remains in force. This letter is confidential. State that this clause IS binding.

8. COSTS
Each party bears its own costs unless otherwise agreed.

9. GOVERNING LAW
This letter is governed by the laws of England and Wales.

10. NEXT STEPS
Propose that the parties agree to this LOI within [X] business days and proceed to grant exclusivity and commence due diligence.

Close with signature blocks for both parties.

Write in full legal prose. No bullet points in the body. Section headers in uppercase. Do not include any commentary or notes outside the document itself.`;

function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Render LOI with styled section headers
function renderLOI(text) {
  const sectionPattern = /^(\d+\.\s+[A-Z &]+)$/m;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const isHeader = /^\d+\.\s+[A-Z &\/]{3,}$/.test(line.trim());
    if (isHeader) {
      return (
        <div key={i} style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: '10px',
          letterSpacing: '0.12em',
          color: 'var(--amber)',
          textTransform: 'uppercase',
          marginTop: '20px',
          marginBottom: '6px',
        }}>{line.trim()}</div>
      );
    }
    return (
      <div key={i} style={{ minHeight: line.trim() === '' ? '8px' : 'auto', lineHeight: 1.9, fontSize: '13px' }}>
        {line}
      </div>
    );
  });
}

export default function LOIGenerator({ currentDeal, session }) {
  // Pre-fill from currentDeal where available
  const [companyName,     setCompanyName]     = useState(currentDeal?.brief?.company_name || currentDeal?.name || '');
  const [sector,          setSector]          = useState(currentDeal?.brief?.sector || '');
  const [sellerName,      setSellerName]      = useState('');
  const [broker,          setBroker]          = useState('');
  const [proposedEV,      setProposedEV]      = useState(currentDeal?.brief?.asking_price || '');
  const [offerBasis,      setOfferBasis]      = useState('Cash-free / Debt-free');
  const [structure,       setStructure]       = useState('Full share purchase');
  const [earnout,         setEarnout]         = useState('No earnout');
  const [earnoutDetail,   setEarnoutDetail]   = useState('');
  const [exclusivity,     setExclusivity]     = useState('6 weeks');
  const [ddPeriod,        setDdPeriod]        = useState('6 weeks');
  const [targetCompletion,setTargetCompletion]= useState('');
  const [conditions,      setConditions]      = useState('Satisfactory completion of financial and legal DD, financing approval, key employee retention');
  const [buyerEntity,     setBuyerEntity]     = useState('Clearline Capital Ltd');
  const [buyerAdviser,    setBuyerAdviser]    = useState('');

  const [generatedLOI, setGeneratedLOI] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setGeneratedLOI('');
    try {
      const userContent = `
Target company: ${companyName}
Sector: ${sector}
Seller name: ${sellerName || 'Not specified'}
Broker: ${broker || 'Not specified'}
Proposed EV: ${proposedEV}
Offer basis: ${offerBasis}
Structure: ${structure}
Earnout: ${earnout}${earnoutDetail ? ` — ${earnoutDetail}` : ''}
Exclusivity period: ${exclusivity}
DD period: ${ddPeriod}
Target completion: ${targetCompletion || 'To be agreed'}
Conditions precedent (buyer-specified): ${conditions}
Buyer entity: ${buyerEntity}
Buyer adviser: ${buyerAdviser || 'TBC'}
Today's date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      `.trim();
      const res = await callAI(LOI_SYSTEM_PROMPT, userContent);
      setGeneratedLOI(res);
    } catch (err) {
      setError('Generation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedLOI) return;
    setSaving(true);
    setError(null);
    try {
      const { error: dbErr } = await supabase.from('memos').upsert({
        user_id: session.user.id,
        deal_name: companyName || 'Unknown',
        decision: 'LOI',
        score: null,
        content: generatedLOI,
      }, { onConflict: 'deal_name,user_id' });
      if (dbErr) {
        const { error: insErr } = await supabase.from('memos').insert({
          user_id: session.user.id,
          deal_name: companyName || 'Unknown',
          decision: 'LOI',
          score: null,
          content: generatedLOI,
        });
        if (insErr) throw insErr;
      }
      alert('LOI saved to deal.');
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLOI);
    alert('LOI copied to clipboard.');
  };

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    const name = (companyName || 'Deal').replace(/\s+/g, '_');
    downloadTxt(generatedLOI, `${name}_LOI_Draft_${date}.txt`);
  };

  const fieldStyle = { marginBottom: '12px' };

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '40% 60%', gap: '20px', alignItems: 'start' }}>

      {/* LEFT — Input form */}
      <div className="card" style={{ padding: '20px' }}>
        <div className="serif" style={{ fontSize: '14px', marginBottom: '4px' }}>LOI / Heads of Terms Generator</div>
        <div className="mono muted" style={{ fontSize: '10px', marginBottom: '20px' }}>Draft your offer letter in under 2 minutes.</div>

        <div className="section-label" style={{ marginBottom: '10px' }}>DEAL DETAILS</div>

        <div className="field" style={fieldStyle}>
          <label>Target Company Name</label>
          <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} />
        </div>
        <div className="field" style={fieldStyle}>
          <label>Target Sector</label>
          <input type="text" value={sector} onChange={e => setSector(e.target.value)} />
        </div>
        <div className="field" style={fieldStyle}>
          <label>Seller Name</label>
          <input type="text" value={sellerName} onChange={e => setSellerName(e.target.value)} placeholder="e.g. David Rennie" />
        </div>
        <div className="field" style={fieldStyle}>
          <label>Broker / Adviser</label>
          <input type="text" value={broker} onChange={e => setBroker(e.target.value)} placeholder="e.g. Benchmark International" />
        </div>

        <div className="section-label" style={{ margin: '16px 0 10px' }}>OFFER TERMS</div>

        <div className="field" style={fieldStyle}>
          <label>Proposed Enterprise Value</label>
          <input type="text" value={proposedEV} onChange={e => setProposedEV(e.target.value)} />
        </div>
        <div className="field" style={fieldStyle}>
          <label>Offer Basis</label>
          <select value={offerBasis} onChange={e => setOfferBasis(e.target.value)}>
            <option>Cash-free / Debt-free</option>
            <option>Subject to financing</option>
          </select>
        </div>
        <div className="field" style={fieldStyle}>
          <label>Proposed Structure</label>
          <select value={structure} onChange={e => setStructure(e.target.value)}>
            <option>Full share purchase</option>
            <option>Asset purchase</option>
            <option>TBD</option>
          </select>
        </div>
        <div className="field" style={fieldStyle}>
          <label>Earnout?</label>
          <select value={earnout} onChange={e => setEarnout(e.target.value)}>
            <option>No earnout</option>
            <option>Yes — performance-linked</option>
            <option>TBD</option>
          </select>
        </div>
        {earnout === 'Yes — performance-linked' && (
          <div className="field" style={fieldStyle}>
            <label>Earnout detail</label>
            <input type="text" value={earnoutDetail} onChange={e => setEarnoutDetail(e.target.value)}
              placeholder="e.g. 10% of EV linked to FY2025 EBITDA > £1.2M" />
          </div>
        )}

        <div className="section-label" style={{ margin: '16px 0 10px' }}>PROCESS</div>

        <div className="field" style={fieldStyle}>
          <label>Exclusivity Period</label>
          <select value={exclusivity} onChange={e => setExclusivity(e.target.value)}>
            <option>4 weeks</option>
            <option>6 weeks</option>
            <option>8 weeks</option>
          </select>
        </div>
        <div className="field" style={fieldStyle}>
          <label>DD Period</label>
          <select value={ddPeriod} onChange={e => setDdPeriod(e.target.value)}>
            <option>4 weeks</option>
            <option>6 weeks</option>
            <option>8 weeks</option>
          </select>
        </div>
        <div className="field" style={fieldStyle}>
          <label>Target Completion</label>
          <input type="text" value={targetCompletion} onChange={e => setTargetCompletion(e.target.value)} placeholder="e.g. Q3 2025" />
        </div>
        <div className="field" style={fieldStyle}>
          <label>Conditions Precedent</label>
          <textarea value={conditions} onChange={e => setConditions(e.target.value)} rows={3} style={{ resize: 'none' }} />
        </div>

        <div className="section-label" style={{ margin: '16px 0 10px' }}>BUYER DETAILS</div>

        <div className="field" style={fieldStyle}>
          <label>Buyer Entity</label>
          <input type="text" value={buyerEntity} onChange={e => setBuyerEntity(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: '20px' }}>
          <label>Buyer Adviser</label>
          <input type="text" value={buyerAdviser} onChange={e => setBuyerAdviser(e.target.value)} placeholder="e.g. [Law firm name] — or leave blank" />
        </div>

        <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={handleGenerate} disabled={loading}>
          {loading ? <><span className="spinner" /> Drafting LOI...</> : 'Generate LOI Draft'}
        </button>
        {error && <div className="error-msg" style={{ marginTop: '12px' }}>{error}</div>}
      </div>

      {/* RIGHT — LOI output */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!generatedLOI && !loading ? (
          <div style={{
            background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px',
            padding: '80px 40px', textAlign: 'center',
          }}>
            <div className="empty-icon">📄</div>
            <div className="empty-text">Fill in the form and generate your LOI draft</div>
          </div>
        ) : loading ? (
          <div style={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '40px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="spinner" />
            <span className="mono muted" style={{ fontSize: '13px' }}>Drafting LOI...</span>
          </div>
        ) : (
          <>
            <div style={{
              background: 'var(--navy3)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              padding: '28px 32px',
              fontFamily: 'Barlow, sans-serif',
              fontSize: '13px',
              lineHeight: 1.9,
              color: 'var(--text)',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}>
              {renderLOI(generatedLOI)}
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-outline" onClick={handleCopy}>Copy LOI</button>
              <button className="btn btn-outline" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save to Deal'}
              </button>
              <button className="btn btn-primary" onClick={handleDownload}>Download .txt</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
