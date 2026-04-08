import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { extractPDFText } from '../lib/pdf';
import { callAI } from '../lib/ai';

const IM_SYSTEM_PROMPT = `You are a deal analyst for Clearline Capital, a UK-based private equity firm targeting B2B Services businesses with £500K–£3M EBITDA. Extract and structure the following from the IM text. Respond ONLY with a valid JSON object. No markdown, no preamble, no explanation.

{
  "company_name": "",
  "sector": "",
  "hq_location": "",
  "asking_price": "",
  "asking_multiple": "",
  "revenue_ttm": "",
  "ebitda_ttm": "",
  "ebitda_margin": "",
  "employees": "",
  "founded": "",
  "ownership": "",
  "reason_for_sale": "",
  "customer_concentration": "",
  "top_customer_pct": "",
  "recurring_revenue_pct": "",
  "revenue_trend": "",
  "key_risks": ["", "", ""],
  "key_strengths": ["", "", ""],
  "owner_dependent": true,
  "management_team_retained": false,
  "fit_summary": "2-3 sentence plain english summary of fit with Clearline thesis",
  "scores": {
    "sector_fit": 0,
    "ebitda_quality": 0,
    "revenue_durability": 0,
    "management_dependency": 0,
    "rollup_potential": 0,
    "asking_multiple_score": 0
  }
}

Scoring rules:
- sector_fit: 80+ if UK B2B services
- management_dependency: 80+ if owner is NOT critical day-to-day
- asking_multiple_score: 85+ if EV/EBITDA < 5x, 65 if 5-7x, 40 if >7x
- ebitda_quality: based on margin consistency and adjustments mentioned
- revenue_durability: based on recurring revenue % and contract lengths
- rollup_potential: based on whether business has systems, brand, and replicable model
Use "N/A" for any field not found. Be conservative. This is for investment decisions.`;

export default function IMAnalyzer({ setActive, currentDeal, setCurrentDeal, session }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setStatus('Extracting text from PDF...');
      const text = await extractPDFText(file);
      
      setStatus('Analyzing memorandum...');
      const aiRes = await callAI(IM_SYSTEM_PROMPT, text);
      
      const cleanJson = aiRes.replace(/```json/gi, '').replace(/```/g, '').trim();
      const brief = JSON.parse(cleanJson);
      
      const weightedScore = (brief.scores.sector_fit * 0.20) + (brief.scores.ebitda_quality * 0.20) + (brief.scores.revenue_durability * 0.15) + (brief.scores.management_dependency * 0.15) + (brief.scores.rollup_potential * 0.15) + (brief.scores.asking_multiple_score * 0.15);

      const dealData = {
        name: brief.company_name,
        sector: brief.sector,
        ebitda: brief.ebitda_ttm,
        score: Math.round(weightedScore),
        brief: brief,
        user_id: session.user.id
      };

      const { error: dbError } = await supabase
        .from('deals')
        .upsert(dealData, { onConflict: 'name,user_id' });
      if (dbError) throw dbError;
      
      setCurrentDeal(dealData);
    } catch (err) {
      setError('Analysis failed: ' + err.message);
    } finally {
      setLoading(false);
      setStatus('');
      e.target.value = null; // reset
    }
  };

  const getScoreColor = (score) => score >= 75 ? 'var(--green)' : score >= 55 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="grid-2" style={{gridTemplateColumns: '55% 45%'}}>
      <div>
        <div className="upload-zone mb-20" onClick={() => document.getElementById('pdf-upload').click()}>
          <div className="amber" style={{fontSize: '32px', marginBottom: '16px'}}>⟁</div>
          <div className="serif" style={{fontSize: '18px', marginBottom: '8px'}}>Upload Information Memorandum</div>
          <div className="mono muted">Drag and drop or click to upload PDF max 30 pages</div>
          <input id="pdf-upload" type="file" accept=".pdf" hidden onChange={handleUpload} />
        </div>
        
        {loading && (
          <div className="flex items-center gap-12 muted mono mt-16">
            <span className="spinner"/> {status}
          </div>
        )}
        {error && <div className="error-msg">{error}</div>}
      </div>

      {currentDeal?.brief && (
        <div style={{background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '20px', height: 'fit-content'}}>
          <div className="grid-2 mb-20" style={{gap: '12px'}}>
            <div className="metric" style={{padding: '12px'}}><div className="metric-label">Revenue TTM</div><div className="mono amber" style={{fontSize: '16px'}}>{currentDeal.brief.revenue_ttm}</div></div>
            <div className="metric" style={{padding: '12px'}}><div className="metric-label">EBITDA TTM</div><div className="mono amber" style={{fontSize: '16px'}}>{currentDeal.brief.ebitda_ttm}</div></div>
            <div className="metric" style={{padding: '12px'}}><div className="metric-label">EBITDA Margin</div><div className="mono amber" style={{fontSize: '16px'}}>{currentDeal.brief.ebitda_margin}</div></div>
            <div className="metric" style={{padding: '12px'}}><div className="metric-label">Asking Price</div><div className="mono amber" style={{fontSize: '16px'}}>{currentDeal.brief.asking_price}</div></div>
            <div className="metric" style={{padding: '12px'}}><div className="metric-label">Asking Multiple</div><div className="mono amber" style={{fontSize: '16px'}}>{currentDeal.brief.asking_multiple}</div></div>
            <div className="metric" style={{padding: '12px'}}><div className="metric-label">Employees</div><div className="mono amber" style={{fontSize: '16px'}}>{currentDeal.brief.employees}</div></div>
          </div>

          <div className="mb-20">
            <div className="section-label">Business Overview</div>
            <div className="flex-col gap-8">
              <div className="flex"><span className="mono muted w-full">Sector</span> <span>{currentDeal.brief.sector}</span></div>
              <div className="flex"><span className="mono muted w-full">HQ</span> <span>{currentDeal.brief.hq_location}</span></div>
              <div className="flex"><span className="mono muted w-full">Founded</span> <span>{currentDeal.brief.founded}</span></div>
              <div className="flex"><span className="mono muted w-full">Ownership</span> <span>{currentDeal.brief.ownership}</span></div>
              <div className="flex"><span className="mono muted w-full">Reason for Sale</span> <span style={{textAlign:'right'}}>{currentDeal.brief.reason_for_sale}</span></div>
              <div className="flex"><span className="mono muted w-full">Recurring Rev %</span> <span>{currentDeal.brief.recurring_revenue_pct}</span></div>
              <div className="flex"><span className="mono muted w-full">Customer Conc.</span> <span>{currentDeal.brief.customer_concentration}</span></div>
            </div>
          </div>

          <div className="grid-2 mb-20">
            <div>
              <div className="section-label">Strengths</div>
              <ul style={{listStyleType: 'disc', paddingLeft: '20px', color: 'var(--green)', fontSize: '13px'}}>
                {currentDeal.brief.key_strengths.map((s,i) => <li key={i}><span style={{color:'var(--text)'}}>{s}</span></li>)}
              </ul>
            </div>
            <div>
              <div className="section-label">Risks</div>
              <ul style={{listStyleType: 'disc', paddingLeft: '20px', color: 'var(--red)', fontSize: '13px'}}>
                {currentDeal.brief.key_risks.map((s,i) => <li key={i}><span style={{color:'var(--text)'}}>{s}</span></li>)}
              </ul>
            </div>
          </div>

          <div className="highlight-box serif mb-20" style={{fontStyle: 'italic'}}>
            {currentDeal.brief.fit_summary}
          </div>

          <div className="mb-20">
            {Object.entries(currentDeal.brief.scores).map(([k, v]) => (
              <div key={k} className="mb-8">
                <div className="flex justify-between mono" style={{fontSize: '9px', marginBottom:'4px'}}><span>{k.replace(/_/g, ' ').toUpperCase()}</span><span>{v}/100</span></div>
                <div className="score-track"><div className="score-fill" style={{width: `${v}%`, backgroundColor: getScoreColor(v)}} /></div>
              </div>
            ))}
          </div>

          <div className="flex gap-12">
            <button className="btn btn-primary" onClick={() => setActive('scorer')}>Send to Scorer →</button>
            <button className="btn btn-outline" onClick={() => setActive('memo')}>Generate Memo →</button>
          </div>
        </div>
      )}
    </div>
  );
}
