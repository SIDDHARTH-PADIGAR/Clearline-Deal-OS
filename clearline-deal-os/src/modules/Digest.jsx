import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { callAI } from '../lib/ai';
import Tooltip from '../components/shared/Tooltip';

export default function Digest({ session }) {
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [dealsRes, contactsRes] = await Promise.all([
          supabase.from('deals').select('*').eq('user_id', session.user.id),
          supabase.from('contacts').select('*').eq('user_id', session.user.id)
        ]);
        if (dealsRes.error) throw dealsRes.error;
        if (contactsRes.error) throw contactsRes.error;
        setDeals(dealsRes.data || []);
        setContacts(contactsRes.data || []);
      } catch (err) {
        setError('Failed to load digest data.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [session.user.id]);

  const activeDeals = deals.filter(d => d.col !== 'Close').length;
  const avgScore = deals.length ? Math.round(deals.reduce((acc, d) => acc + (d.score || 0), 0) / deals.length) : 0;
  
  const today = new Date();
  const overdueContacts = contacts.filter(c => {
    if (!c.last_contact || !c.next_action) return false;
    const diff = today - new Date(c.last_contact);
    return diff > 7 * 24 * 60 * 60 * 1000;
  }).length;
  const inDiligence = deals.filter(d => d.col === 'Diligence').length;

  const handleBriefing = async () => {
    setBriefingLoading(true);
    setError(null);
    try {
      const prompt = `You are chief of staff to Oscar Lindhardt, solo founder of Deal OS (UK PE firm).
Given this data: ${JSON.stringify({ deals, contacts })}

Write a crisp 3-bullet morning briefing. Max 2 lines per bullet.
Focus only on what moves deals forward today. Be specific — name companies and people.

Format:
• [action] — [why it matters now]
• [action] — [why it matters now]
• [action] — [why it matters now]`;
      const res = await callAI(prompt, 'Generate morning briefing.');
      setBriefing(res);
    } catch (err) {
      setError('Failed to generate briefing.');
    } finally {
      setBriefingLoading(false);
    }
  };

  if (loading) return <div className="empty-state"><span className="spinner"/></div>;

  const actionContacts = contacts.filter(c => c.next_action).sort((a, b) => new Date(a.last_contact || 0) - new Date(b.last_contact || 0));
  
  const getDotColor = (dateStr) => {
    if (!dateStr) return 'var(--blue)';
    const diff = today - new Date(dateStr);
    const days = diff / (1000 * 60 * 60 * 24);
    if (days > 14) return 'var(--red)';
    if (days > 7) return 'var(--amber)';
    return 'var(--blue)';
  };

  const columns = ['Sourcing', 'Screening', 'Seller Call', 'LOI', 'Diligence', 'Close'];
  const colCounts = columns.map(col => deals.filter(d => d.col === col).length);
  const maxCount = Math.max(...colCounts, 1);

  return (
    <div>
      <div className="grid-4 mb-20">
        <div className="metric">
          <div className="metric-label">Active Deals</div>
          <div className="metric-value">{activeDeals}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Avg Score</div>
          <div className="metric-value">{avgScore}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Overdue Actions</div>
          <div className="metric-value" style={{color: overdueContacts > 0 ? 'var(--amber)' : 'inherit'}}>{overdueContacts}</div>
        </div>
        <div className="metric">
          <div className="metric-label">In Diligence</div>
          <div className="metric-value">{inDiligence}</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '60% 40%' }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Today's Actions</div></div>
          <div className="flex-col gap-12 mb-20">
            {actionContacts.length === 0 ? <div className="muted mono" style={{fontSize: '10px'}}>No pending actions.</div> :
              actionContacts.map(c => (
                <div key={c.id} className="flex items-center gap-12">
                  <div style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getDotColor(c.last_contact)}} />
                  <div>
                    <div style={{fontSize: '13px'}}>{c.next_action}</div>
                    <div className="mono muted" style={{fontSize: '10px'}}>{c.name} · {c.company}</div>
                  </div>
                </div>
              ))
            }
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0' }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleBriefing} disabled={briefingLoading}>
              {briefingLoading ? <span className="spinner"/> : 'Get Morning Briefing'}
            </button>
            <Tooltip text="Reads your live pipeline and tells you what to focus on today." />
          </div>
          
          {error && <div className="error-msg">{error}</div>}
          
          {briefing && (
            <div className="highlight-box mt-16" style={{whiteSpace: 'pre-wrap'}}>
              {briefing}
            </div>
          )}
        </div>

        <div className="card">
           <div className="card-header"><div className="card-title">Pipeline Snapshot</div></div>
           <div className="flex-col gap-12">
             {columns.map((col, i) => {
               const count = colCounts[i];
               const pct = (count / maxCount) * 100;
               return (
                 <div key={col}>
                   <div className="flex justify-between mb-16" style={{marginBottom: '4px'}}>
                     <span className="mono muted" style={{fontSize: '10px', textTransform: 'uppercase'}}>{col}</span>
                     <span className="mono" style={{fontSize: '10px'}}>{count}</span>
                   </div>
                   <div className="score-track">
                     <div className="score-fill" style={{width: `${pct}%`, backgroundColor: 'var(--amber)'}}></div>
                   </div>
                 </div>
               );
             })}
           </div>
        </div>
      </div>
    </div>
  );
}
