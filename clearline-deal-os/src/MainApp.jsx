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

// ─── Onboarding Modal ────────────────────────────────────────────────────────
const SLIDES = [
  {
    icon: '⟁',
    title: 'Welcome to Clearline Deal OS',
    body: 'This is your private deal operating system. Built for one operator, one thesis, one platform. Here\'s how it works in 3 steps.',
    note: null,
  },
  {
    icon: '⟁',
    title: 'Step 1 — Drop in an IM',
    body: 'Go to IM Analyzer and upload any PDF Information Memorandum. The AI reads it in seconds and extracts every key metric — financials, risks, strengths, owner profile, and a weighted deal score. No manual data entry.',
    note: 'Start here. Everything else flows from this.',
  },
  {
    icon: '▤',
    title: 'Step 2 — Get your Decision Brief',
    body: 'Go to Deal Decision Brief. Pick GO, CONDITIONAL GO, or NO-GO. The AI generates an 8-section brief covering investment case, red flags, market context, who to call and what to ask — and its own recommendation. Read it. Make your call.',
    note: 'This brief is investor-ready. Copy it and send it.',
  },
  {
    icon: '◈',
    title: 'Step 3 — Run your pipeline from the Digest',
    body: 'Your Daily Digest is your morning briefing. It shows active deals, overdue actions, and generates a 3-bullet focus summary from your live data. Open it every morning before your email.',
    note: 'The workflow: IM → Score → Decision → Call Prep → LOI',
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
        {/* Skip */}
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--muted)',
        }}>Skip</button>

        {/* Slide content */}
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

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '24px' }}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: i === slide ? 'var(--amber)' : 'var(--border)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        {/* Nav buttons */}
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MainApp({ session }) {
  const [active, setActive] = useState('digest');
  const [currentDeal, setCurrentDeal] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const key = `onboarding_${session.user.id}`;
    if (!localStorage.getItem(key)) {
      setShowOnboarding(true);
    }
  }, [session.user.id]);

  const handleDismissOnboarding = () => {
    localStorage.setItem(`onboarding_${session.user.id}`, 'true');
    setShowOnboarding(false);
  };

  const handleSignOut = () => supabase.auth.signOut();

  const moduleProps = { setActive, currentDeal, setCurrentDeal, session };

  const modules = {
    digest:   <Digest   {...moduleProps} />,
    pipeline: <Pipeline {...moduleProps} />,
    im:       <IMAnalyzer {...moduleProps} />,
    scorer:   <DealScorer {...moduleProps} />,
    memo:     <Memo     {...moduleProps} />,
    returns:  <ReturnsCalculator {...moduleProps} />,
    loi:      <LOIGenerator     {...moduleProps} />,
    prep:     <CallPrep {...moduleProps} />,
    crm:      <CRM      {...moduleProps} />,
  };

  return (
    <div className="app">
      {showOnboarding && <OnboardingModal onClose={handleDismissOnboarding} />}
      <Sidebar active={active} setActive={setActive} onSignOut={handleSignOut} session={session} />
      <div className="main">
        <Topbar active={active} />
        <div className="content">
          {modules[active]}
        </div>
      </div>
    </div>
  );
}
