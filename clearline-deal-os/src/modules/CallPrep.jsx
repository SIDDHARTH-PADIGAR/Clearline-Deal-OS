import { useState } from 'react';
import { callAI } from '../lib/ai';

const CALLPREP_SYSTEM_PROMPT = `You are preparing Oscar Lindhardt (Founder, Deal OS) for a seller call with a UK SME owner. Critical context about Oscar: he is 25 years old, Danish, self-taught in deal-making with no traditional finance background. He is direct, warm, and authentic. He has publicly admitted he gets nervous on seller calls and sometimes says something different from what he means. He is NOT a banker. He should NOT sound like one.

Write everything in plain, conversational language that Oscar would actually say out loud. No corporate phrases. No "I'm excited to explore synergies." No "mutually agreeable solutions." Write how a smart, hungry, genuine person talks.

Generate a structured call prep brief with exactly these sections:

OPENING
Write 2-3 sentences Oscar says to open the call. It must sound like him — warm, direct, slightly informal. Reference something specific about what David built. The goal is to make David feel heard and respected in the first 30 seconds.

DISCOVERY QUESTIONS
Write exactly 10 questions. Rank them 1-10 in the order Oscar should ask them — start with rapport-building, move to operational, end with the hard financial probes. Mark exactly 5 as [PRIORITY] — these are the ones where the answer materially changes the deal. For each PRIORITY question, add one sentence explaining what a bad answer looks like and what Oscar should do if he hears it.

LIKELY SELLER CONCERNS AND HOW TO HANDLE THEM
Write 5 concerns David Rennie specifically is likely to raise based on his profile (retirement-motivated, 12 years building this, emotionally attached, has loyal staff). For each concern write: what David will say or signal, and what Oscar should say back — in Oscar's voice, not legal language.

RED FLAGS TO PROBE
Write 3 specific red flags for THIS deal. For each one: what to watch for, what question surfaces it, and what Oscar does if it comes up.

CLOSING
Write exactly what Oscar says to close the call. Must include: a genuine compliment about what David built, a clear statement of intent, and a specific ask with a timeframe. Should feel like a person ending a good conversation, not a banker wrapping up a meeting.`;

export default function CallPrep({ currentDeal }) {
  const [dealName, setDealName] = useState(currentDeal?.name || '');
  const [sector, setSector] = useState(currentDeal?.brief?.sector || '');
  const [background, setBackground] = useState('');
  const [concerns, setConcerns] = useState('');
  const [outcome, setOutcome] = useState('');
  
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const prompt = `Deal Name: ${dealName}
Sector: ${sector}
Seller Background: ${background}
Key Concerns: ${concerns}
Desired Outcome: ${outcome}`;

      const res = await callAI(CALLPREP_SYSTEM_PROMPT, prompt);
      setBrief(res);
    } catch (err) {
      setError('Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const renderSection = (title, text) => {
    if (!text) return null;
    const isPriority = text.includes('[PRIORITY]');
    const highlightedText = text.replace(/\[PRIORITY\]/g, '<span class="badge badge-amber ml-2" style="margin-left: 8px">PRIORITY</span>');
    return (
      <div className="mb-20">
        <div className="section-label amber">{title}</div>
        <div className="mono" style={{ fontSize: '13px', lineHeight: 1.6 }} dangerouslySetInnerHTML={{__html: highlightedText}} />
      </div>
    );
  };

  const parseBrief = (fullText) => {
    const sections = {};
    const parts = fullText.split(/(OPENING|DISCOVERY QUESTIONS|LIKELY SELLER CONCERNS AND HOW TO HANDLE THEM|RED FLAGS TO PROBE|CLOSING)/g);
    for (let i = 1; i < parts.length; i += 2) {
      sections[parts[i]] = parts[i+1].trim();
    }
    return sections;
  };

  const s = brief ? parseBrief(brief) : {};

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '40% 60%' }}>
      <div className="card">
        <div className="card-header"><div className="card-title">Call Prep Inputs</div></div>
        
        <div className="field">
          <label>Deal Name</label>
          <input type="text" value={dealName} onChange={e => setDealName(e.target.value)} />
        </div>
        
        <div className="field">
          <label>Business Type / Sector</label>
          <input type="text" value={sector} onChange={e => setSector(e.target.value)} />
        </div>
        
        <div className="field">
          <label>Known Seller Background</label>
          <textarea value={background} onChange={e => setBackground(e.target.value)} />
        </div>
        
        <div className="field">
          <label>Key Concerns Going In</label>
          <textarea value={concerns} onChange={e => setConcerns(e.target.value)} />
        </div>
        
        <div className="field mb-20">
          <label>Desired Outcome</label>
          <input type="text" value={outcome} onChange={e => setOutcome(e.target.value)} />
        </div>

        <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={handleGenerate} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Generate Call Brief'}
        </button>
        {error && <div className="error-msg">{error}</div>}
      </div>

      <div className="card">
        {brief ? (
          <div>
            {renderSection('OPENING', s['OPENING'])}
            {renderSection('DISCOVERY QUESTIONS', s['DISCOVERY QUESTIONS'])}
            {renderSection('LIKELY SELLER CONCERNS AND HOW TO HANDLE THEM', s['LIKELY SELLER CONCERNS AND HOW TO HANDLE THEM'])}
            {renderSection('RED FLAGS TO PROBE', s['RED FLAGS TO PROBE'])}
            {renderSection('CLOSING', s['CLOSING'])}
          </div>
        ) : (
          <div className="empty-state" style={{ paddingTop: '100px' }}>
            <div className="empty-icon">◷</div>
            <div className="empty-text">Fill out inputs to generate a brief</div>
          </div>
        )}
      </div>
    </div>
  );
}
