import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { callAI } from '../lib/ai';

async function fetchWithFallback(feedUrl, count) {
  // Try rss2json first
  try {
    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=${count}`;
    const res = await fetch(rss2jsonUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && data.items && data.items.length > 0) {
        return data.items.map(item => ({
          title: item.title,
          pubDate: item.pubDate || item.pubdate || new Date().toISOString(),
          link: item.link,
        }));
      }
    }
  } catch (e) {
    console.warn(`rss2json failed for ${feedUrl}, trying allorigins fallback...`, e);
  }

  // Fallback to allorigins + DOMParser
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(feedUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      const xmlText = data.contents;
      if (xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const items = Array.from(doc.querySelectorAll('item')).slice(0, count);
        return items.map(item => {
          const title = item.querySelector('title')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || item.querySelector('pubdate')?.textContent || new Date().toISOString();
          const link = item.querySelector('link')?.textContent || '';
          return { title, pubDate, link };
        }).filter(item => item.title && item.link);
      }
    }
  } catch (e) {
    console.error(`allorigins fallback failed for ${feedUrl}`, e);
  }

  return [];
}

async function fetchRSSHeadlines(count = 8) {
  const feeds = [
    `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664`,
    `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20409666`,
    `https://news.google.com/rss?topic=b&hl=en-US&gl=US&ceid=US:en`,
    `https://news.google.com/rss?topic=tc&hl=en-US&gl=US&ceid=US:en`,
  ];
  const allItems = [];
  for (const feedUrl of feeds) {
    const items = await fetchWithFallback(feedUrl, count);
    if (items.length > 0) {
      allItems.push(...items);
    }
  }
  return allItems;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
const CACHE_KEY = 'dealos_market_intel';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch (_) { return null; }
}

function setCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Digest({ session, setActive, setCurrentDeal }) {
  const [deals, setDeals]         = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [intelLoading, setIntelLoading] = useState(false);
  const [marketIntel, setMarketIntel]   = useState(null); // { whatChanged, sectorPulse, fetchedAt }
  const [intelError, setIntelError]     = useState(null);
  const [error, setError]         = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [dealsRes, contactsRes] = await Promise.all([
          supabase.from('deals').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
          supabase.from('contacts').select('*').eq('user_id', session.user.id),
        ]);
        if (dealsRes.error) throw dealsRes.error;
        if (contactsRes.error) throw contactsRes.error;
        const d = dealsRes.data || [];
        const c = contactsRes.data || [];
        setDeals(d);
        setContacts(c);

        // Try cache first, then fetch live intel
        const cached = getCached();
        if (cached) {
          setMarketIntel(cached);
        } else {
          fetchMarketIntel(d);
        }
      } catch (err) {
        setError('Could not load data — please refresh.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [session.user.id]);

  async function fetchMarketIntel(currentDeals) {
    setIntelLoading(true);
    setIntelError(null);
    try {
      // 1. Get unique sectors from portfolio
      const sectors = [...new Set((currentDeals || deals).map(d => d.sector).filter(Boolean))];

      // 2. Fetch live headlines from RSS
      const headlines = await fetchRSSHeadlines();

      if (headlines.length === 0) {
        throw new Error('Could not reach news feeds — check your internet connection.');
      }

      // 3. Build an honest AI prompt grounded in the real headlines
      const headlineText = headlines.map((h, i) => `${i + 1}. ${h.title} (${new Date(h.pubDate).toDateString()})`).join('\n');
      const portfolioContext = sectors.length > 0
        ? `The investor's portfolio spans these sectors: ${sectors.join(', ')}.`
        : 'The investor has no deals in their pipeline yet.';

      const prompt = `You are a market intelligence analyst for a private equity investor.

${portfolioContext}

Below are REAL news headlines fetched today from Reuters and Yahoo Finance. Use ONLY these headlines — do not invent any information not present in them.

HEADLINES:
${headlineText}

Write two short sections based strictly on what these headlines say:

WHAT CHANGED:
2-3 bullet points on the most significant macroeconomic or sector-relevant developments from these headlines. Each bullet must reference a specific headline. If no headlines are relevant to the portfolio sectors, note that and pick the most broadly impactful macro headlines instead.

SECTOR PULSE:
1-2 sentences on what the overall news flow means for an investor active in ${sectors.length > 0 ? sectors.join(', ') : 'private equity in general'}. Be specific about risks or opportunities implied by these headlines. Do not pad with generic statements.

Format: Output the two section titles in CAPS followed by the content. No markdown. No bullet point symbols — use plain dashes instead.`;

      const result = await callAI(prompt, 'Generate market intelligence from real headlines.');

      // 4. Parse sections
      let whatChanged = '', sectorPulse = '';
      if (result.includes('WHAT CHANGED:')) {
        const parts = result.split('SECTOR PULSE:');
        whatChanged  = parts[0].replace('WHAT CHANGED:', '').trim();
        sectorPulse  = parts[1]?.trim() || '';
      } else {
        whatChanged = result; // fallback: show full text
      }

      const intel = {
        whatChanged,
        sectorPulse,
        fetchedAt: new Date().toISOString(),
        headlines: headlines.slice(0, 5), // store first 5 for source display
      };

      setCache(intel);
      setMarketIntel(intel);
    } catch (err) {
      setIntelError(err.message || 'Could not fetch market intelligence.');
    } finally {
      setIntelLoading(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getDaysSince = (dateStr) => {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  };

  const getScoreBadge = (score) => {
    if (score == null) return { text: '—', color: 'var(--muted)', bg: 'transparent' };
    if (score >= 75) return { text: score, color: 'var(--green)', bg: 'rgba(34,197,94,0.1)' };
    if (score >= 55) return { text: score, color: 'var(--amber)', bg: 'rgba(232,168,53,0.1)' };
    return { text: score, color: 'var(--red)', bg: 'rgba(239,68,68,0.1)' };
  };

  const handleDealClick = (deal) => {
    setCurrentDeal(deal);
    setActive(deal.brief ? 'scorer' : 'im');
  };

  // ── Section header ────────────────────────────────────────────────────────────
  const sectionHeader = (title, rightSlot) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', letterSpacing: '0.12em', color: 'var(--amber)', textTransform: 'uppercase' }}>
        {title}
      </div>
      {rightSlot}
    </div>
  );

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;
  if (error)   return <div style={{ color: 'var(--red)', padding: '24px', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{error}</div>;

  const actionContacts = contacts.filter(c => c.next_action).sort((a, b) => new Date(a.last_contact || 0) - new Date(b.last_contact || 0));
  const recentDeals    = deals.filter(d => getDaysSince(d.created_at) <= 7);
  const agingDeals     = deals.filter(d => getDaysSince(d.created_at) > 21);

  // ── Pipeline stats ────────────────────────────────────────────────────────────
  const pipelineSummaryItems = [];
  if (recentDeals.length > 0) pipelineSummaryItems.push(`${recentDeals.length} deal${recentDeals.length > 1 ? 's' : ''} added this week (${recentDeals.map(d => d.name).join(', ')})`);
  if (agingDeals.length > 0)  pipelineSummaryItems.push(`${agingDeals.length} deal${agingDeals.length > 1 ? 's' : ''} idle for 3+ weeks (${agingDeals.map(d => d.name).join(', ')})`);
  const overdueCount = contacts.filter(c => c.next_action && getDaysSince(c.last_contact) > 7).length;
  if (overdueCount > 0) pipelineSummaryItems.push(`${overdueCount} contact${overdueCount > 1 ? 's' : ''} overdue for follow-up`);
  if (pipelineSummaryItems.length === 0 && deals.length > 0) pipelineSummaryItems.push('Pipeline is stable — no significant changes this week.');

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '8px' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--amber)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Portfolio Intelligence
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 'bold', color: 'var(--text)' }}>
            Daily Console
          </div>
        </div>
        
        {marketIntel?.fetchedAt && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
            Live Briefing · {new Date(marketIntel.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            <span
              style={{ marginLeft: '8px', color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { localStorage.removeItem('dealos_market_intel'); fetchMarketIntel(deals); }}
            >
              refresh
            </span>
          </div>
        )}
      </div>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
        
        {/* LEFT COLUMN: Market Intel & Active Pipeline (Span 8) */}
        <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Market Intelligence Panel */}
          <div className="card" style={{ background: 'linear-gradient(135deg, var(--navy2) 0%, rgba(26, 34, 53, 0.4) 100%)', border: '1px solid var(--border)', padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* What Changed Column */}
              <div style={{ paddingRight: '20px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 500 }}>
                  What Changed Today
                </div>
                {intelLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
                    <span className="spinner" /> Analyzing headlines...
                  </div>
                ) : intelError ? (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)' }}>
                    {intelError}
                  </div>
                ) : marketIntel ? (
                  <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                    {marketIntel.whatChanged}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
                    No analysis loaded. <span style={{ color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => fetchMarketIntel(deals)}>Analyze now</span>
                  </div>
                )}
              </div>

              {/* Sector Pulse Column */}
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 500 }}>
                  Sector Commentary
                </div>
                {intelLoading ? (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>Loading commentaries...</div>
                ) : marketIntel?.sectorPulse ? (
                  <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', lineHeight: 1.7, color: 'var(--text)' }}>
                    {marketIntel.sectorPulse}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
                    {deals.length === 0 ? 'Add deals to pipeline to get sector commentaries.' : 'Fetching commentary...'}
                  </div>
                )}
              </div>
            </div>

            {/* Source pills */}
            {marketIntel?.headlines?.length > 0 && !intelLoading && (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Verified Real-Time Feeds
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {marketIntel.headlines.map((h, i) => (
                    <a
                      key={i}
                      href={h.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '9px',
                        color: 'var(--muted)',
                        textDecoration: 'none',
                        background: 'var(--navy3)',
                        padding: '4px 8px',
                        borderRadius: '3px',
                        border: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '200px',
                        transition: 'all 0.1s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--amber)'; e.currentTarget.style.color = 'var(--text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
                    >
                      {h.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active Deals Table Panel */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>
                Active Deals ({deals.length})
              </div>
              {deals.length > 0 && (
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => setActive('pipeline')}
                >
                  View full pipeline →
                </span>
              )}
            </div>
            
            {deals.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '12px 0' }}>
                No deals yet.{' '}
                <span style={{ color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActive('im')}>Upload your first IM →</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 70px 70px 70px', gap: '12px', padding: '0 8px 6px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <div>Company</div><div>Sector</div><div style={{ textAlign: 'center' }}>Score</div><div style={{ textAlign: 'center' }}>Age</div><div style={{ textAlign: 'right' }}>Stage</div>
                </div>
                {deals.map(deal => {
                  const badge = getScoreBadge(deal.score);
                  const days  = getDaysSince(deal.created_at);
                  const stage = deal.col || (deal.brief ? 'Screened' : 'Uploaded');
                  return (
                    <div
                      key={deal.id}
                      onClick={() => handleDealClick(deal)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1.5fr 70px 70px 70px',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--navy3)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'border-color 0.1s'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--amber)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 500 }}>{deal.name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{deal.sector || '—'}</div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: badge.color, background: badge.bg, padding: '1px 6px', borderRadius: '2px' }}>{badge.text}</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{days != null ? `${days}d` : '—'}</div>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '10px' }}>{stage}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Pipeline Alerts & Next Actions (Span 4) */}
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Pipeline Updates / Alerts */}
          {pipelineSummaryItems.length > 0 && (
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px', fontWeight: 500 }}>
                Pipeline Updates
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pipelineSummaryItems.map((item, i) => (
                  <div key={i} style={{ borderLeft: '2px solid var(--amber)', paddingLeft: '10px', paddingVertical: '4px' }}>
                    <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', lineHeight: 1.5, color: 'var(--text)' }}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CRM Next Actions */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px', fontWeight: 500 }}>
              CRM Follow-Ups
            </div>
            {actionContacts.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '8px 0' }}>
                No pending actions.{' '}
                <span style={{ color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActive('crm')}>Add contacts →</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {actionContacts.map(c => {
                  const days = getDaysSince(c.last_contact);
                  const isOverdue = days != null && days > 7;
                  const initials = c.name ? c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'C';
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px',
                        background: 'var(--navy3)',
                        border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.25)' : 'var(--border)'}`,
                        borderRadius: '4px'
                      }}
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isOverdue ? 'rgba(239, 68, 68, 0.1)' : 'rgba(232, 168, 53, 0.1)',
                          color: isOverdue ? 'var(--red)' : 'var(--amber)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          fontFamily: 'var(--mono)',
                          flexShrink: 0
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.next_action}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>
                          {c.name} {isOverdue && <span style={{ color: 'var(--red)', marginLeft: '4px' }}>[overdue]</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

