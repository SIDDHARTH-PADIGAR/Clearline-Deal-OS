export default function Topbar({ active }) {
  const titles = {
    digest: 'Daily Digest',
    pipeline: 'Deal Pipeline',
    im: 'IM Analyzer',
    scorer: 'Deal Scorer',
    memo: 'Deal Decision Brief',
    returns: 'Returns Calculator',
    loi: 'LOI Generator',
    prep: 'Seller Call Prep',
    crm: 'Relationships'
  };

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="topbar">
      <div className="topbar-title">{titles[active]}</div>
      <div className="topbar-right">
        {today}
      </div>
    </div>
  );
}
