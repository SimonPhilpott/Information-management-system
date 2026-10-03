import React, { useState } from 'react';

export default function TokenUsageMeter({ usage }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!usage) return null;

  const { percentage, status, month, today, spendCap, projectedCost } = usage;

  const fillClass = status === 'critical' || percentage >= 95 ? 'critical' : percentage >= 80 ? 'warning' : status;
  const displayCost = month?.cost?.toFixed(4) || '0.0000';
  const displayCap = spendCap?.toFixed(2) || '250.00';
  const isNearBudget = percentage >= 80;

  return (
    <div
      className={`token-meter ${isNearBudget ? 'border-amber-500/40 bg-amber-500/10' : ''}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => {
        if (window.location.pathname !== '/ims/costs') {
          window.history.pushState(null, '', '/ims/costs');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }}
      id="token-usage-meter"
      style={{ cursor: 'pointer' }}
      title="Click to view full Costs (/ims/costs)"
    >
      <span style={{ fontSize: '12px' }}>
        {percentage >= 95 ? '🚨' : percentage >= 80 ? '⚠️' : '📊'}
      </span>
      <div className="token-meter-bar">
        <div
          className={`token-meter-fill ${fillClass}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="token-meter-label">
        £{displayCost} / £{displayCap}
      </span>

      {showTooltip && (
        <div className="token-meter-tooltip">
          <h4>Token Usage — This Month</h4>

          <div className="token-meter-tooltip-row">
            <span className="label">Spend</span>
            <span className="value">£{displayCost} / £{displayCap}</span>
          </div>
          <div className="token-meter-tooltip-row">
            <span className="label">Usage</span>
            <span className="value">{percentage?.toFixed(1)}%</span>
          </div>
          <div className="token-meter-tooltip-row">
            <span className="label">Total Tokens</span>
            <span className="value">{(month?.totalTokens || 0).toLocaleString()}</span>
          </div>
          <div className="token-meter-tooltip-row">
            <span className="label">Input Tokens</span>
            <span className="value">{(month?.promptTokens || 0).toLocaleString()}</span>
          </div>
          <div className="token-meter-tooltip-row">
            <span className="label">Output Tokens</span>
            <span className="value">{(month?.completionTokens || 0).toLocaleString()}</span>
          </div>
          <div className="token-meter-tooltip-row">
            <span className="label">Requests</span>
            <span className="value">{month?.requests || 0}</span>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '8px 0' }} />

          <div className="token-meter-tooltip-row">
            <span className="label">Today</span>
            <span className="value">£{today?.cost?.toFixed(4) || '0.0000'} ({today?.requests || 0} reqs)</span>
          </div>
          <div className="token-meter-tooltip-row">
            <span className="label">Projected Monthly</span>
            <span className="value" style={{ color: projectedCost > spendCap ? 'var(--accent-rose)' : 'inherit' }}>
              £{projectedCost?.toFixed(4) || '0.0000'}
            </span>
          </div>

          {usage.modelBreakdown && usage.modelBreakdown.length > 0 && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '8px 0' }} />
              <h4>By Model</h4>
              {usage.modelBreakdown.map((m, i) => (
                <div key={i} className="token-meter-tooltip-row">
                  <span className="label">{m.model?.includes('flash') ? '⚡ Flash' : m.model?.includes('pro') ? '🧠 Pro' : m.model}</span>
                  <span className="value">£{m.cost?.toFixed(4)} ({m.requests} reqs)</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
