import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function Pipeline({ setActive, currentDeal, setCurrentDeal, session }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [dealModal, setDealModal] = useState(null); // deal detail modal
  const [draggedDealId, setDraggedDealId] = useState(null);

  const [form, setForm] = useState({ name: '', sector: '', ebitda: '', col: 'Sourcing', risk: 'mid', notes: '' });

  const columns = ['Sourcing', 'Screening', 'Seller Call', 'LOI', 'Diligence', 'Close'];

  useEffect(() => {
    loadDeals();
  }, [session.user.id]);

  const loadDeals = async () => {
    setLoading(true);
    const { data } = await supabase.from('deals').select('*').eq('user_id', session.user.id).order('created_at');
    
    if (data && data.length === 0) {
      // Seed data if empty
      const seedDeals = [
        { name: "Meridian Facilities Mgmt", sector: "FM Services", ebitda: "£1.2M", score: 74, col: "Screening", risk: "mid" },
        { name: "Caldwell Recruitment", sector: "B2B Staffing", ebitda: "£890K", score: 61, col: "Sourcing", risk: "mid" },
        { name: "Apex Environmental", sector: "Compliance", ebitda: "£2.1M", score: 82, col: "Seller Call", risk: "low" },
        { name: "NorthBridge Logistics", sector: "B2B Logistics", ebitda: "£1.6M", score: 55, col: "Sourcing", risk: "high" }
      ];
      for (const d of seedDeals) {
         await supabase.from('deals').insert({...d, user_id: session.user.id});
      }
      const refreshed = await supabase.from('deals').select('*').eq('user_id', session.user.id).order('created_at');
      setDeals(refreshed.data || []);
    } else {
      setDeals(data || []);
    }
    setLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await supabase.from('deals').insert({...form, user_id: session.user.id});
    setShowModal(false);
    loadDeals();
  };

  const handleDragStart = (e, id) => {
    setDraggedDealId(id);
    e.currentTarget.classList.add('dragging');
  };
  
  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    setDraggedDealId(null);
    document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };
  
  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = async (e, col) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedDealId) return;
    
    setDeals(deals.map(d => d.id === draggedDealId ? { ...d, col } : d));
    await supabase.from('deals').update({ col, updated_at: new Date().toISOString() }).eq('id', draggedDealId).eq('user_id', session.user.id);
  };

  const openDeal = (deal) => {
    setCurrentDeal(deal);
    setDealModal(deal);
  };

  const activeDeals = deals.filter(d => d.col !== 'Close').length;
  const avgScore = deals.length ? Math.round(deals.reduce((acc, d) => acc + (d.score || 0), 0) / deals.length) : 0;
  const inDil = deals.filter(d => d.col === 'Diligence').length;
  
  const extractNum = (str) => {
    if (!str) return 0;
    const cleaned = str.toUpperCase().replace(/[^0-9.KM]/g, '');
    let val = parseFloat(cleaned) || 0;
    if (cleaned.includes('M')) val *= 1000000;
    else if (cleaned.includes('K')) val *= 1000;
    return val;
  };
  const sumEbitda = deals.reduce((acc, d) => acc + extractNum(d.ebitda), 0);
  const formattedEbitda = `£${(sumEbitda / 1000000).toFixed(1)}M`;

  if (loading) return <div className="empty-state"><span className="spinner"/></div>;

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      <div className="flex justify-between items-center mb-20" style={{ flexShrink: 0 }}>
        <div className="flex gap-20">
          <div className="mono muted" style={{ fontSize: '11px' }}>Active Deals: <span className="text">{activeDeals}</span></div>
          <div className="mono muted" style={{ fontSize: '11px' }}>Avg Score: <span className="amber">{avgScore}</span></div>
          <div className="mono muted" style={{ fontSize: '11px' }}>In Diligence: <span className="text">{inDil}</span></div>
          <div className="mono muted" style={{ fontSize: '11px' }}>Pipeline Value: <span className="green">{formattedEbitda}</span></div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Deal</button>
      </div>

      <div className="kanban">
        {columns.map(col => {
          const columnDeals = deals.filter(d => d.col === col);
          return (
            <div 
              key={col} 
              className="kanban-col"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div className="kanban-col-header">
                {col} <span className="badge" style={{background: 'var(--navy4)'}}>{columnDeals.length}</span>
              </div>
              <div className="kanban-cards">
                {columnDeals.map(d => (
                  <div 
                    key={d.id} 
                    className="deal-card" 
                    draggable 
                    onDragStart={e => handleDragStart(e, d.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openDeal(d)}
                  >
                    <div className="flex justify-between items-start mb-8">
                       <div className="deal-card-name" style={{ flex: 1, paddingRight: '8px' }}>{d.name}</div>
                       <div className={`badge badge-${d.risk === 'high' ? 'red' : d.risk === 'low' ? 'green' : 'amber'}`}>{d.risk}</div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="deal-card-meta flex-col gap-4">
                        <div>{d.sector || '-'}</div>
                        <div>{d.ebitda || '-'}</div>
                      </div>
                      <div className="deal-card-score">{d.score || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Deal</div>
            <form onSubmit={handleSave}>
              <div className="grid-2">
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Company Name</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="field"><label>Sector</label><input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} /></div>
                <div className="field"><label>EBITDA</label><input value={form.ebitda} onChange={e => setForm({...form, ebitda: e.target.value})} /></div>
                <div className="field">
                  <label>Stage</label>
                  <select value={form.col} onChange={e => setForm({...form, col: e.target.value})}>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Risk</label>
                  <select value={form.risk} onChange={e => setForm({...form, risk: e.target.value})}>
                    <option value="low">Low</option>
                    <option value="mid">Mid</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Notes</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              </div>
              <div className="flex justify-between mt-16">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Deal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dealModal && (
        <div className="modal-overlay" onClick={() => setDealModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="flex justify-between items-center mb-20" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
               <div>
                 <div className="modal-title" style={{ marginBottom: 4 }}>{dealModal.name}</div>
                 <div className="mono muted">{dealModal.col}</div>
               </div>
               <div className="mono amber" style={{ fontSize: '40px', fontWeight: '500', lineHeight: 1 }}>{dealModal.score || 0}</div>
            </div>
            
            <div className="grid-3 mb-20">
              <div className="metric"><div className="metric-label">Sector</div><div className="mono" style={{ fontSize: '14px' }}>{dealModal.sector || '-'}</div></div>
              <div className="metric"><div className="metric-label">EBITDA</div><div className="mono amber" style={{ fontSize: '14px' }}>{dealModal.ebitda || '-'}</div></div>
              <div className="metric"><div className="metric-label">Risk</div><div className="mono gap-8 flex items-center" style={{ fontSize: '14px' }}><span style={{width: 8, height: 8, borderRadius: '50%', backgroundColor: `var(--${dealModal.risk === 'high' ? 'red' : dealModal.risk === 'low' ? 'green' : 'amber'})`}}/> {dealModal.risk?.toUpperCase()}</div></div>
            </div>

            {dealModal.brief && dealModal.brief.fit_summary ? (
               <div className="highlight-box serif mb-20" style={{ fontStyle: 'italic' }}>
                 {dealModal.brief.fit_summary}
               </div>
            ) : (
               <div className="field"><label>Notes</label><div className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{dealModal.notes || '-'}</div></div>
            )}

            <div className="flex gap-12" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <button className="btn btn-primary" onClick={() => { setDealModal(null); setActive('im'); }}>Open in IM Analyzer</button>
              <button className="btn btn-outline" onClick={() => { setDealModal(null); setActive('memo'); }}>Generate Memo</button>
              <button className="btn btn-outline" onClick={() => { setDealModal(null); setActive('prep'); }}>Prep Call</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
