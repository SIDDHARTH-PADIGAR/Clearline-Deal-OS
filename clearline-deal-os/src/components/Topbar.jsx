import geoConfig from '../data/geography_config.json';

export default function Topbar({ active, geography }) {
  const titles = {
    digest:    'Daily Digest',
    pipeline:  'Deal Pipeline',
    im:        'IM Analyzer',
    scorer:    'Deal Scorer',
    memo:      'Deal Decision Brief',
    valuation: 'Valuation Engine',
    returns:   'Returns Calculator',
    loi:       'LOI Generator',
    prep:      'Seller Call Prep',
    crm:       'Relationships',
  };

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const geo = geoConfig[geography] || geoConfig['UK'];

  return (
    <div className="topbar">
      <div className="topbar-title">{titles[active]}</div>
      <div className="topbar-right">
        <span style={{ color: 'var(--amber)', fontSize: '10px' }}>{geo.flag} {geography}</span>
        <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
        {today}
      </div>
    </div>
  );
}
