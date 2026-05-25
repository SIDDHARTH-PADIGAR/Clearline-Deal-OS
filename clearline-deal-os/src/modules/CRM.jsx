import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { callAI } from '../lib/ai';

export default function CRM({ session }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('broker');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [contactForm, setContactForm] = useState({
    name: '', company: '', type: 'broker', email: '', phone: '', last_contact: '', next_action: '', notes: '', deals: ''
  });
  
  const [draft, setDraft] = useState('');
  const [draftModal, setDraftModal] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [session.user.id]);

  const loadContacts = async () => {
    setLoading(true);
    const { data } = await supabase.from('contacts').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
    setContacts(data || []);
    setLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const data = {
      ...contactForm,
      deals: contactForm.deals.split(',').map(d => d.trim()).filter(Boolean),
      user_id: session.user.id
    };
    
    if (editingId) {
      await supabase.from('contacts').update(data).eq('id', editingId);
    } else {
      await supabase.from('contacts').insert(data);
    }
    
    setShowModal(false);
    loadContacts();
  };

  const openForm = (c = null) => {
    if (c) {
      setEditingId(c.id);
      setContactForm({ ...c, deals: (c.deals || []).join(', ') });
    } else {
      setEditingId(null);
      setContactForm({ name: '', company: '', type: activeTab, email: '', phone: '', last_contact: '', next_action: '', notes: '', deals: '' });
    }
    setShowModal(true);
  };

  const generateDraft = async (c) => {
    setDraftModal(true);
    setDraftLoading(true);
    setDraft('');
    const prompt = `Draft a brief, professional follow-up email from Oscar Lindhardt (Founder, Deal OS)
to ${c.name} at ${c.company}. Context: ${c.next_action}. Tone: direct, warm, non-salesy. Max 120 words. No intro or explanation, just the email body.`;
    const res = await callAI('You are an assistant.', prompt);
    setDraft(res);
    setDraftLoading(false);
  };

  const copyDraft = () => {
    navigator.clipboard.writeText(draft);
    alert('Copied');
  };

  const filtered = contacts.filter(c => c.type === activeTab);

  if (loading) return <div className="empty-state"><span className="spinner"/></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-20">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {['broker', 'seller', 'investor'].map(t => (
            <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}s
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => openForm()}>Add Contact</button>
      </div>

      <div className="card" style={{ padding: '0 20px' }}>
        {filtered.length === 0 ? <div className="empty-state">No contacts found</div> : filtered.map(c => (
          <div key={c.id} className="contact-row" onClick={(e) => { if(e.target.tagName !== 'BUTTON') openForm(c) }}>
            <div className={`avatar avatar-${c.type}`}>
              {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ width: '20%' }}>
              <div style={{ fontSize: '13px', fontWeight: '500' }}>{c.name}</div>
              <div className="mono muted" style={{ fontSize: '10px' }}>{c.company}</div>
            </div>
            <div className="mono muted" style={{ width: '15%', fontSize: '11px' }}>
               {c.last_contact ? new Date(c.last_contact).toLocaleDateString() : '-'}
            </div>
            <div style={{ flex: 1, fontSize: '12px' }}>{c.next_action}</div>
            <button className="btn btn-outline btn-sm" onClick={() => generateDraft(c)}>AI Email</button>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingId ? 'Edit Contact' : 'Add Contact'}</div>
            <form onSubmit={handleSave}>
              <div className="grid-2">
                <div className="field"><label>Name</label><input required value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} /></div>
                <div className="field"><label>Company</label><input value={contactForm.company} onChange={e => setContactForm({...contactForm, company: e.target.value})} /></div>
                <div className="field">
                  <label>Type</label>
                  <select value={contactForm.type} onChange={e => setContactForm({...contactForm, type: e.target.value})}>
                    <option value="broker">Broker</option>
                    <option value="seller">Seller</option>
                    <option value="investor">Investor</option>
                  </select>
                </div>
                <div className="field"><label>Email</label><input type="email" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} /></div>
                <div className="field"><label>Phone</label><input value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} /></div>
                <div className="field"><label>Last Contact</label><input type="date" value={contactForm.last_contact} onChange={e => setContactForm({...contactForm, last_contact: e.target.value})} /></div>
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Next Action</label><input value={contactForm.next_action} onChange={e => setContactForm({...contactForm, next_action: e.target.value})} /></div>
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Notes</label><textarea value={contactForm.notes} onChange={e => setContactForm({...contactForm, notes: e.target.value})} /></div>
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Associated Deals (comma separated)</label><input value={contactForm.deals} onChange={e => setContactForm({...contactForm, deals: e.target.value})} /></div>
              </div>
              <div className="flex justify-between mt-16">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {draftModal && (
        <div className="modal-overlay" onClick={() => setDraftModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">AI Email Draft</div>
            {draftLoading ? <div className="muted"><span className="spinner"/> Drafting...</div> : (
              <>
                <div className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.6, background: 'var(--navy3)', padding: '16px', borderRadius: '4px', marginBottom: '20px' }}>
                  {draft}
                </div>
                <div className="flex justify-between">
                  <button className="btn btn-ghost" onClick={() => setDraftModal(false)}>Close</button>
                  <button className="btn btn-primary" onClick={copyDraft}>Copy Final Draft</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
