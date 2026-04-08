export default function Sidebar({ active, setActive, onSignOut, session }) {
  const navItems = [
    { id: 'digest', icon: '◈', label: 'Daily Digest', section: null },
    { id: 'pipeline', icon: '⊞', label: 'Deal Pipeline', section: null },
    { id: 'im', icon: '⟁', label: 'IM Analyzer', section: 'ANALYSIS' },
    { id: 'scorer', icon: '◎', label: 'Deal Scorer', section: null },
    { id: 'memo', icon: '▤', label: 'Deal Decision Brief', section: null },
    { id: 'returns', icon: '⟳', label: 'Returns Calculator', section: null },
    { id: 'loi', icon: '📄', label: 'LOI Generator', section: null },
    { id: 'prep', icon: '◷', label: 'Seller Call Prep', section: 'OPS' },
    { id: 'crm', icon: '◉', label: 'Relationships', section: null },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="wordmark">Clearline Capital</div>
        <div className="sub">Deal Operating System</div>
      </div>
      <div className="nav">
        {navItems.map((item, index) => {
          return (
            <div key={item.id}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <div 
                className={`nav-item ${active === item.id ? 'active' : ''}`}
                onClick={() => setActive(item.id)}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <div className="name">Oscar Lindhardt</div>
        <div className="role">Founder · Clearline</div>
        <button className="signout-btn" onClick={onSignOut}>[Sign out]</button>
      </div>
    </div>
  );
}
