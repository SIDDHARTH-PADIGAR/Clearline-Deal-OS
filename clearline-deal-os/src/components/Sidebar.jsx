import { supabase } from '../supabaseClient';
import geoConfig from '../data/geography_config.json';

const GEO_OPTIONS = Object.keys(geoConfig);

export default function Sidebar({ active, setActive, onSignOut, session, geography, onGeoChange }) {
  const navItems = [
    { id: 'digest',    icon: '◈', label: 'Daily Digest',          section: null },
    { id: 'pipeline',  icon: '⊞', label: 'Deal Pipeline',         section: null },
    { id: 'im',        icon: '⟁', label: 'IM Analyzer',           section: 'ANALYSIS' },
    { id: 'scorer',    icon: '◎', label: 'Deal Scorer',           section: null },
    { id: 'memo',      icon: '▤', label: 'Deal Decision Brief',   section: null },
    { id: 'valuation', icon: '◈', label: 'Valuation Engine',      section: null },
    { id: 'returns',   icon: '⟳', label: 'Returns Calculator',    section: null },
    { id: 'loi',       icon: '📄', label: 'LOI Generator',         section: null },
    { id: 'prep',      icon: '◷', label: 'Seller Call Prep',      section: 'OPS' },
    { id: 'crm',       icon: '◉', label: 'Relationships',         section: null },
  ];

  const currentGeo = geoConfig[geography] || geoConfig['UK'];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="wordmark">Deal OS</div>
        <div className="sub">Deal Operating System</div>
      </div>
      <div className="nav">
        {navItems.map((item) => (
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
        ))}
      </div>

      {/* Geography selector */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '6px' }}>MARKET</div>
        <select
          value={geography}
          onChange={e => onGeoChange(e.target.value)}
          style={{
            background: 'var(--navy3)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontFamily: 'DM Mono, monospace',
            fontSize: '11px',
            borderRadius: '3px',
            padding: '6px 8px',
            width: '100%',
            cursor: 'pointer',
          }}
        >
          {GEO_OPTIONS.map(geo => (
            <option key={geo} value={geo}>
              {geoConfig[geo].flag} {geo} ({geoConfig[geo].currency_symbol})
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar-footer">
        <div className="name">{session?.user?.email?.split('@')[0] || 'User'}</div>
        <div className="role">Deal OS · {geography}</div>
        <button className="signout-btn" onClick={onSignOut}>[Sign out]</button>
      </div>
    </div>
  );
}
