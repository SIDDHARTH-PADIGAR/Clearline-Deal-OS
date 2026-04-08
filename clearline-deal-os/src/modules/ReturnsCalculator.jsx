import { useState, useEffect, useCallback } from 'react';

function parseNum(val) {
  const n = parseFloat(String(val).replace(/[£,Mm]/gi, '').trim());
  return isNaN(n) ? 0 : n;
}

function simpleIRR(equityIn, exitEquity, annualCashFlows, years) {
  if (equityIn <= 0) return 0;
  let rate = 0.15;
  for (let i = 0; i < 200; i++) {
    let npv = -equityIn;
    annualCashFlows.forEach((cf, t) => { npv += cf / Math.pow(1 + rate, t + 1); });
    npv += exitEquity / Math.pow(1 + rate, years);
    if (Math.abs(npv) < 0.0001) break;
    rate += npv > 0 ? 0.001 : -0.001;
    if (rate > 10 || rate < -0.99) break;
  }
  return rate;
}

function calcScenario(entryPrice, entryEBITDA, seniorDebt, interestRate, growthRate, holdPeriod, exitMultiple, mgmtFeeK) {
  const equityIn = entryPrice - seniorDebt;
  if (equityIn <= 0) return null;
  const annualDebtRepayment = seniorDebt / holdPeriod;
  const mgmtFee = mgmtFeeK / 1000;
  const annualCashFlows = [];
  let remainingDebt = seniorDebt;
  let currentEBITDA = entryEBITDA;
  for (let y = 0; y < holdPeriod; y++) {
    currentEBITDA = currentEBITDA * (1 + growthRate / 100);
    const interest = remainingDebt * (interestRate / 100);
    remainingDebt = Math.max(0, remainingDebt - annualDebtRepayment);
    const fcf = currentEBITDA - annualDebtRepayment - interest - mgmtFee;
    annualCashFlows.push(Math.max(fcf, 0));
  }
  const exitEBITDA = entryEBITDA * Math.pow(1 + growthRate / 100, holdPeriod);
  const exitEV = exitEBITDA * exitMultiple;
  const debtAtExit = Math.max(0, seniorDebt - annualDebtRepayment * holdPeriod);
  const exitEquity = exitEV - debtAtExit;
  const cashOnCash = exitEquity / equityIn;
  const irr = simpleIRR(equityIn, exitEquity, annualCashFlows, holdPeriod);
  return { irr, cashOnCash, exitEquity, exitEV, equityIn };
}

function irrColor(irr) {
  if (irr >= 0.20) return 'var(--green)';
  if (irr >= 0.15) return 'var(--amber)';
  return 'var(--red)';
}

const EXIT_MULTIPLES = [4.0, 5.0, 6.0, 7.0];
const HOLD_PERIODS   = [3, 4, 5, 6, 7];

export default function ReturnsCalculator({ currentDeal }) {
  const initPrice   = currentDeal?.brief?.asking_price  ? parseNum(currentDeal.brief.asking_price)  : 0;
  const initEBITDA  = currentDeal?.brief?.ebitda_ttm    ? parseNum(currentDeal.brief.ebitda_ttm)    : 0;

  const [entryPrice,   setEntryPrice]   = useState(initPrice   || 5);
  const [entryEBITDA,  setEntryEBITDA]  = useState(initEBITDA  || 1);
  const [seniorDebt,   setSeniorDebt]   = useState(0);
  const [interestRate, setInterestRate] = useState(7.5);
  const [baseGrowth,   setBaseGrowth]   = useState(8);
  const [upGrowth,     setUpGrowth]     = useState(14);
  const [downGrowth,   setDownGrowth]   = useState(3);
  const [holdPeriod,   setHoldPeriod]   = useState(5);
  const [exitMultiple, setExitMultiple] = useState(0);
  const [mgmtFeeK,     setMgmtFeeK]     = useState(0);
  const [results,      setResults]      = useState(null);

  // Auto-set defaults when entryEBITDA changes
  useEffect(() => {
    setSeniorDebt(+(entryEBITDA * 3).toFixed(2));
  }, [entryEBITDA]);

  useEffect(() => {
    if (entryEBITDA > 0) {
      setExitMultiple(+(entryPrice / entryEBITDA).toFixed(1));
    }
  }, [entryPrice, entryEBITDA]);

  const entryMultiple  = entryEBITDA > 0 ? (entryPrice / entryEBITDA).toFixed(1) : '—';
  const equityInvested = Math.max(0, entryPrice - seniorDebt);

  const handleCalculate = useCallback(() => {
    const base   = calcScenario(entryPrice, entryEBITDA, seniorDebt, interestRate, baseGrowth,  holdPeriod, exitMultiple, mgmtFeeK);
    const upside = calcScenario(entryPrice, entryEBITDA, seniorDebt, interestRate, upGrowth,   holdPeriod, exitMultiple, mgmtFeeK);
    const down   = calcScenario(entryPrice, entryEBITDA, seniorDebt, interestRate, downGrowth, holdPeriod, exitMultiple, mgmtFeeK);
    setResults({ base, upside, down });
  }, [entryPrice, entryEBITDA, seniorDebt, interestRate, baseGrowth, upGrowth, downGrowth, holdPeriod, exitMultiple, mgmtFeeK]);

  // Build sensitivity table using base growth
  const sensitivityTable = EXIT_MULTIPLES.map(em =>
    HOLD_PERIODS.map(hp => {
      const r = calcScenario(entryPrice, entryEBITDA, seniorDebt, interestRate, baseGrowth, hp, em, mgmtFeeK);
      return r ? r.irr : null;
    })
  );

  const scenarios = results ? [
    { label: 'BASE',     color: 'var(--amber)', data: results.base },
    { label: 'UPSIDE',   color: 'var(--green)', data: results.upside },
    { label: 'DOWNSIDE', color: 'var(--red)',   data: results.down },
  ] : [];

  const numInput = (label, value, setter, readOnly = false, unit = '') => (
    <div className="field">
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label} {unit && <span className="muted mono" style={{ fontSize: '10px' }}>({unit})</span>}
      </label>
      {readOnly
        ? <div className="mono amber" style={{ fontSize: '16px', padding: '8px 0' }}>{value}</div>
        : <input type="number" step="0.1" value={value} onChange={e => setter(parseFloat(e.target.value) || 0)} />
      }
    </div>
  );

  const sliderRow = (label, value, setter, min, max, color = 'var(--amber)') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
      <div className="mono muted" style={{ width: '72px', fontSize: '10px' }}>{label}</div>
      <input
        type="range" min={min} max={max} step="0.5" value={value}
        onChange={e => setter(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: color }}
      />
      <div className="mono" style={{ width: '40px', textAlign: 'right', fontSize: '12px', color }}>{value}%</div>
    </div>
  );

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '42% 58%', gap: '20px', alignItems: 'start' }}>

      {/* LEFT — Inputs */}
      <div className="card" style={{ padding: '20px' }}>
        <div className="serif" style={{ fontSize: '14px', marginBottom: '4px' }}>Deal Economics</div>
        <div className="mono muted" style={{ fontSize: '10px', marginBottom: '20px' }}>Adjust assumptions to model your return scenarios</div>

        <div className="section-label" style={{ marginBottom: '10px' }}>ACQUISITION</div>
        {numInput('Entry Price', entryPrice, setEntryPrice, false, '£M')}
        {numInput('EBITDA at Entry', entryEBITDA, setEntryEBITDA, false, '£M')}
        <div className="field">
          <label>Entry Multiple</label>
          <div className="mono amber" style={{ fontSize: '16px', padding: '6px 0' }}>{entryMultiple}x</div>
        </div>

        <div className="section-label" style={{ margin: '16px 0 10px' }}>DEBT STRUCTURE</div>
        {numInput('Senior Debt', seniorDebt, setSeniorDebt, false, '£M')}
        {numInput('Interest Rate', interestRate, setInterestRate, false, '%')}
        <div className="field">
          <label>Equity Invested</label>
          <div className="mono amber" style={{ fontSize: '16px', padding: '6px 0' }}>£{equityInvested.toFixed(2)}M</div>
        </div>

        <div className="section-label" style={{ margin: '16px 0 10px' }}>GROWTH ASSUMPTIONS (EBITDA p.a.)</div>
        {sliderRow('Base', baseGrowth, setBaseGrowth, 0, 20, 'var(--amber)')}
        {sliderRow('Upside', upGrowth, setUpGrowth, 0, 30, 'var(--green)')}
        {sliderRow('Downside', downGrowth, setDownGrowth, -5, 10, 'var(--red)')}

        <div className="section-label" style={{ margin: '16px 0 10px' }}>EXIT</div>
        <div className="field">
          <label>Hold Period</label>
          <select value={holdPeriod} onChange={e => setHoldPeriod(parseInt(e.target.value))}>
            {[3,4,5,6,7].map(y => <option key={y} value={y}>{y} years</option>)}
          </select>
        </div>
        {numInput('Exit Multiple', exitMultiple, setExitMultiple, false, 'x')}
        {numInput('Annual Mgmt Fee', mgmtFeeK, setMgmtFeeK, false, '£K')}

        <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: '20px' }} onClick={handleCalculate}>
          Calculate Returns
        </button>
      </div>

      {/* RIGHT — Output */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!results ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <div className="empty-icon">⟳</div>
            <div className="empty-text">Set your assumptions and calculate</div>
          </div>
        ) : (
          <>
            {/* Scenario cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {scenarios.map(({ label, color, data }) => (
                <div key={label} style={{
                  background: 'var(--navy2)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${color}`,
                  borderRadius: '4px',
                  padding: '16px',
                }}>
                  <div className="mono muted" style={{ fontSize: '9px', letterSpacing: '0.12em', marginBottom: '12px' }}>{label}</div>
                  {data ? (
                    <>
                      <div className="mono" style={{ fontSize: '28px', color, lineHeight: 1, marginBottom: '6px' }}>
                        {(data.irr * 100).toFixed(1)}%
                      </div>
                      <div className="mono muted" style={{ fontSize: '11px', marginBottom: '4px' }}>IRR</div>
                      <div className="mono" style={{ fontSize: '16px', marginBottom: '2px' }}>{data.cashOnCash.toFixed(2)}x</div>
                      <div className="mono muted" style={{ fontSize: '10px', marginBottom: '8px' }}>Cash-on-Cash</div>
                      <div className="mono" style={{ fontSize: '12px' }}>£{data.exitEquity.toFixed(2)}M equity</div>
                      <div className="mono muted" style={{ fontSize: '10px' }}>£{data.exitEV.toFixed(2)}M EV at exit</div>
                    </>
                  ) : (
                    <div className="muted mono" style={{ fontSize: '11px' }}>Check inputs</div>
                  )}
                </div>
              ))}
            </div>

            {/* Sensitivity table */}
            <div style={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '20px', overflowX: 'auto' }}>
              <div className="section-label" style={{ marginBottom: '14px' }}>
                SENSITIVITY — IRR BY EXIT MULTIPLE & HOLD PERIOD
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Mono, monospace', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <td style={{ color: 'var(--muted)', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Exit x</td>
                    {HOLD_PERIODS.map(hp => (
                      <td key={hp} style={{ color: 'var(--muted)', padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{hp}yr</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXIT_MULTIPLES.map((em, ri) => (
                    <tr key={em}>
                      <td style={{ color: 'var(--muted)', padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{em.toFixed(1)}x</td>
                      {HOLD_PERIODS.map((hp, ci) => {
                        const irr = sensitivityTable[ri][ci];
                        const isActive = Math.abs(em - exitMultiple) < 0.26 && hp === holdPeriod;
                        const color = irr == null ? 'var(--muted)' : irrColor(irr);
                        return (
                          <td key={hp} style={{
                            padding: '5px 8px',
                            textAlign: 'center',
                            borderBottom: '1px solid var(--border)',
                            color,
                            background: isActive ? 'rgba(232,168,53,0.12)' : 'transparent',
                            borderLeft: isActive ? '1px solid var(--amber)' : 'none',
                            borderRight: isActive ? '1px solid var(--amber)' : 'none',
                            fontWeight: isActive ? 700 : 400,
                          }}>
                            {irr != null ? `${(irr * 100).toFixed(0)}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mono muted" style={{ fontSize: '10px', marginTop: '12px' }}>
                Assumes straight-line debt amortisation over hold period. Entry equity = £{equityInvested.toFixed(2)}M. Base growth scenario used in table.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
