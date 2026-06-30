import React from 'react';

const STEPS = [
  { id: 'upload', label: 'Upload', routes: ['im'] },
  { id: 'extract', label: 'Extract', routes: ['im'] },
  { id: 'score', label: 'Score', routes: ['scorer'] },
  { id: 'value', label: 'Value', routes: ['valuation', 'returns'] },
  { id: 'screen', label: 'Screen', routes: ['prep', 'crm'] },
  { id: 'brief', label: 'Brief', routes: ['memo'] },
  { id: 'loi', label: 'LOI', routes: ['loi'] },
];

export default function ProgressStrip({ active, currentDeal, setActive }) {
  if (!currentDeal) return null;

  // Determine current step index based on active route
  let currentIndex = STEPS.findIndex(s => s.routes.includes(active));
  if (currentIndex === -1) currentIndex = 0; // fallback

  // If a deal is loaded, upload and extract are inherently done unless we are explicitly re-uploading
  if (currentDeal && currentIndex < 2 && active !== 'im') {
    currentIndex = 2; // Default to score if deal loaded but route doesn't match
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--navy2)',
      overflowX: 'auto'
    }}>
      {STEPS.map((step, idx) => {
        const isCompleted = currentDeal ? idx <= currentIndex : false;
        const isCurrent = idx === currentIndex;
        
        let bgColor = 'var(--navy3)';
        let color = 'var(--muted)';
        let borderColor = 'transparent';

        if (isCurrent) {
          bgColor = 'rgba(201, 168, 76, 0.1)';
          color = 'var(--amber)';
          borderColor = 'var(--amber)';
        } else if (isCompleted) {
          bgColor = 'var(--amber)';
          color = 'var(--navy)';
        }

        return (
          <React.Fragment key={step.id}>
            <div
              onClick={() => {
                if (isCompleted || isCurrent) {
                  setActive(step.routes[0]);
                }
              }}
              style={{
                padding: '4px 12px',
                borderRadius: '12px',
                background: bgColor,
                color: color,
                border: `1px solid ${borderColor}`,
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                fontWeight: isCompleted || isCurrent ? 600 : 400,
                cursor: (isCompleted || isCurrent) ? 'pointer' : 'default',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {step.label}
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{ width: '16px', height: '1px', background: 'var(--border)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
