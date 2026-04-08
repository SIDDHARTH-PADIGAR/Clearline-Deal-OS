import { useState } from 'react';
import Tooltip from '../components/shared/Tooltip';

export default function DealScorer({ currentDeal, setActive }) {
  if (!currentDeal || !currentDeal.brief) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◎</div>
        <div className="empty-text mb-20">Analyze an IM first</div>
        <button className="btn btn-primary" onClick={() => setActive('im')}>Go to IM Analyzer</button>
      </div>
    );
  }

  const { brief, score } = currentDeal;
  const s = brief.scores;

  const criteria = [
    { label: 'Sector fit (UK B2B Services)', val: s.sector_fit, weight: '20%' },
    { label: 'EBITDA quality & margins', val: s.ebitda_quality, weight: '20%' },
    { label: 'Revenue durability', val: s.revenue_durability, weight: '15%' },
    { label: 'Low owner-dependency', val: s.management_dependency, weight: '15%' },
    { label: 'Roll-up synergy potential', val: s.rollup_potential, weight: '15%' },
    { label: 'Valuation (asking multiple)', val: s.asking_multiple_score, weight: '15%' },
  ];

  const getScoreColor = (val) => val >= 75 ? 'var(--green)' : val >= 55 ? 'var(--amber)' : 'var(--red)';
  const badgeClass = score >= 75 ? 'badge-green' : score >= 55 ? 'badge-amber' : 'badge-red';
  const badgeText = score >= 75 ? 'Strong Fit' : score >= 55 ? 'Conditional Fit' : 'Poor Fit';

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="flex justify-between items-center mb-20" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
        <div>
          <div className="serif" style={{ fontSize: '18px', marginBottom: '8px' }}>{currentDeal.name}</div>
          <span className={`badge ${badgeClass}`}>{badgeText}</span>
        </div>
        <div className="mono amber" style={{ fontSize: '40px', fontWeight: '500', lineHeight: 1 }}>{score}</div>
      </div>

      <div className="flex-col gap-16 mb-20">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-center gap-16">
            <div style={{ width: '240px', fontSize: '13px' }}>{c.label}</div>
            <div style={{ flex: 1, height: '6px', background: 'var(--navy4)', borderRadius: '3px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: '3px', width: `${c.val}%`, backgroundColor: getScoreColor(c.val) }} />
            </div>
            <div className="mono" style={{ width: '60px', textAlign: 'right', fontSize: '14px' }}>{c.val}<span className="muted" style={{fontSize:'10px'}}>/100</span></div>
            <div className="mono muted" style={{ width: '40px', textAlign: 'right', fontSize: '10px' }}>{c.weight}</div>
          </div>
        ))}
      </div>

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center' }}>Analyst Notes<Tooltip text="Pre-filled from the IM. Edit to add your own read." /></label>
        <textarea defaultValue={brief.fit_summary} />
      </div>

      <div className="mt-20">
        <button className="btn btn-primary" onClick={() => setActive('memo')}>Generate Go/No-Go Memo →</button>
      </div>
    </div>
  );
}
