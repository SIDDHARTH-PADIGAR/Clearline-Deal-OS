import geoConfig from '../data/geography_config.json';

export default function Topbar({ active, geography }) {
  const titles = {
    digest:    'Daily Digest',
    pipeline:  'Deal Pipeline',
    im:        'Analyse a Deal',
    scorer:    'Deal Score',
    memo:      'Decision Brief',
    valuation: 'Valuation',
    returns:   'Returns Calculator',
    loi:       'Draft LOI',
    prep:      'Call Prep',
    crm:       'Contacts',
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
