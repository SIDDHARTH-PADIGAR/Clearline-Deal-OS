import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Digest from './modules/Digest';
import Pipeline from './modules/Pipeline';
import IMAnalyzer from './modules/IMAnalyzer';
import DealScorer from './modules/DealScorer';
import Memo from './modules/Memo';
import CallPrep from './modules/CallPrep';
import CRM from './modules/CRM';
import ReturnsCalculator from './modules/ReturnsCalculator';
import LOIGenerator from './modules/LOIGenerator';
import ValuationEngine from './modules/ValuationEngine';

// ─── Onboarding Modal ────────────────────────────────────────────────────────
const SLIDES = [
  {
    icon: '⟁',
    title: 'Welcome to Deal OS',
    body: 'Your private deal operating system. Built for PE operators, growth equity analysts, and finance professionals doing deal screening. Here\'s how it works.',
    note: null,
  },
  {
    icon: '⟁',
    title: 'Step 1 — Drop in an IM or Financials',
    body: 'Upload any PDF Information Memorandum or Financial Statements. The AI extracts every key metric, runs ECRM screening automatically, and produces a weighted deal score.',
    note: 'Start here. Everything else flows from this.',
  },
  {
    icon: '▤',
    title: 'Step 2 — Get your Decision Brief',
    body: 'Pick GO, CONDITIONAL GO, or NO-GO. The AI generates an 8-section brief — investment case, red flags, market context, who to call, and its own recommendation.',
    note: 'Investor-ready. Copy it and send it.',
  },
  {
    icon: '◈',
    title: 'Step 3 — Run your pipeline from the Digest',
    body: 'Your Daily Digest is your morning briefing. Live pipeline, overdue actions, AI 3-bullet focus summary. Open it every morning.',
    note: 'Workflow: IM → Score → Valuation → Decision → Call Prep → LOI',
    noteAmber: true,
  },
];

function OnboardingModal({ onClose }) {
  const [slide, setSlide] = useState(0);
  const isLast = slide === SLIDES.length - 1;
  const s = SLIDES[slide];
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--navy2)', border: '1px solid var(--border2)',
        borderRadius: '4px', padding: '36px', maxWidth: '560px', width: '90%',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)',
        }}>Skip</button>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '32px', color: 'var(--amber)', marginBottom: '16px' }}>{s.icon}</div>
          <div style={{ fontFamily: 'Libre Baskerville, serif', fontSize: '18px', marginBottom: '14px' }}>{s.title}</div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)', maxWidth: '420px', margin: '0 auto' }}>{s.body}</div>
          {s.note && (
            <div style={{
              marginTop: '14px', fontFamily: 'DM Mono, monospace', fontSize: '11px',
              color: s.noteAmber ? 'var(--amber)' : 'var(--muted)',
            }}>{s.note}</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '24px' }}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: i === slide ? 'var(--amber)' : 'var(--border)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          {slide > 0 && (
            <button className="btn btn-outline" onClick={() => setSlide(s => s - 1)}>← Back</button>
          )}
          {isLast ? (
            <button className="btn btn-primary" onClick={onClose}>Get Started →</button>
          ) : (
            <button className="btn btn-primary" onClick={() => setSlide(s => s + 1)}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Geo Confirmation Modal ───────────────────────────────────────────────────
function GeoConfirmModal({ pendingGeo, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{
        background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px',
        padding: '28px', maxWidth: '400px', width: '90%',
      }}>
        <div style={{ fontFamily: 'Libre Baskerville, serif', fontSize: '14px', marginBottom: '12px' }}>Change Market?</div>
        <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', color: 'var(--muted)', marginBottom: '20px', lineHeight: 1.6 }}>
          Changing market to <strong style={{ color: 'var(--text)' }}>{pendingGeo}</strong> will update benchmarks, LOI templates, and ECRM flag categories. Continue?
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={onConfirm}>Yes, change market</button>
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MainApp({ session }) {
  const [active, setActive] = useState('digest');
  const [currentDeal, setCurrentDeal] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [geography, setGeography] = useState('UK');
  const [pendingGeo, setPendingGeo] = useState(null);

  useEffect(() => {
    setCurrentDeal(null);
    const key = `onboarding_${session.user.id}`;
    if (!localStorage.getItem(key)) setShowOnboarding(true);

    // Load geography from Supabase
    supabase.from('user_settings')
      .select('geography')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => { if (data?.geography) setGeography(data.geography); });
  }, [session.user.id]);

  const handleDismissOnboarding = () => {
    localStorage.setItem(`onboarding_${session.user.id}`, 'true');
    setShowOnboarding(false);
  };

  const handleGeoChange = (newGeo) => setPendingGeo(newGeo);

  const confirmGeoChange = async () => {
    setGeography(pendingGeo);
    await supabase.from('user_settings').upsert({
      user_id: session.user.id,
      geography: pendingGeo,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setPendingGeo(null);
  };

  const handleSignOut = () => supabase.auth.signOut();

  const moduleProps = { setActive, currentDeal, setCurrentDeal, session, geography };

  const modules = {
    digest:    <Digest    {...moduleProps} />,
    pipeline:  <Pipeline  {...moduleProps} />,
    im:        <IMAnalyzer {...moduleProps} />,
    scorer:    <DealScorer {...moduleProps} />,
    memo:      <Memo      {...moduleProps} />,
    valuation: <ValuationEngine {...moduleProps} />,
    returns:   <ReturnsCalculator {...moduleProps} />,
    loi:       <LOIGenerator     {...moduleProps} />,
    prep:      <CallPrep  {...moduleProps} />,
    crm:       <CRM       {...moduleProps} />,
  };

  return (
    <div className="app">
      {showOnboarding && <OnboardingModal onClose={handleDismissOnboarding} />}
      {pendingGeo && (
        <GeoConfirmModal
          pendingGeo={pendingGeo}
          onConfirm={confirmGeoChange}
          onCancel={() => setPendingGeo(null)}
        />
      )}
      <Sidebar
        active={active}
        setActive={setActive}
        onSignOut={handleSignOut}
        session={session}
        geography={geography}
        onGeoChange={handleGeoChange}
      />
      <div className="main">
        <Topbar active={active} geography={geography} />
        <div className="content">
          {modules[active]}
        </div>
      </div>
    </div>
  );
}
