import React, { useState, useMemo } from "react";

const HORIZONS = [5, 10, 15, 20];
const MONTHLY_PRESETS = [5000, 10000, 20000, 50000];
const ASSUMED_ANNUAL_RETURN = 0.12; // 12% illustrative annual return

function calculateSIP(monthly, years) {
  const r = ASSUMED_ANNUAL_RETURN / 12;
  const n = years * 12;
  const invested = monthly * n;
  const total = monthly * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
  const returns = Math.max(0, total - invested);
  return { invested, returns, total };
}

function formatINR(val) {
  if (val >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)} Cr`;
  }
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(1)} L`;
  }
  return `₹${Math.round(val).toLocaleString("en-IN")}`;
}

export default function InvestmentGrowthChart({ className = "" }) {
  const [monthly, setMonthly] = useState(10000);
  const [selectedYears, setSelectedYears] = useState(15);

  // Calculate milestones for 1, 5, 10, 15, 20 years
  const milestones = useMemo(() => {
    const yearsList = [1, 5, 10, 15, 20];
    const data = yearsList.map((y) => {
      const { invested, returns, total } = calculateSIP(monthly, y);
      return { years: y, invested, returns, total };
    });
    // Find max for bar height scaling (max height 160px)
    const maxTotal = data[data.length - 1].total;
    return data.map((item) => ({
      ...item,
      heightPercent: Math.max(12, Math.round((item.total / maxTotal) * 100)),
      investedPercent: Math.round((item.invested / item.total) * 100),
      growthPercent: Math.round((item.returns / item.total) * 100),
    }));
  }, [monthly]);

  const currentResult = useMemo(
    () => calculateSIP(monthly, selectedYears),
    [monthly, selectedYears]
  );

  const multiplier = (currentResult.total / currentResult.invested).toFixed(1);

  return (
    <div className={`growth-chart-card ${className}`}>
      {/* Card Header with Compounding Stats */}
      <div className="growth-card-top">
        <div className="growth-badge-row">
          <span className="growth-pill">Compounding illustration</span>
          <span className="growth-multiplier">{multiplier}x growth</span>
        </div>

        <div className="growth-value-display">
          <div className="growth-val-left">
            <span className="growth-label">Projected wealth in {selectedYears} years</span>
            <span className="growth-main-figure highlight">
              {formatINR(currentResult.total)}
            </span>
          </div>
          <div className="growth-val-right">
            <div className="growth-stat-chip">
              <span className="chip-dot invested" />
              <span>Invested: {formatINR(currentResult.invested)}</span>
            </div>
            <div className="growth-stat-chip">
              <span className="chip-dot returns" />
              <span>Growth: +{formatINR(currentResult.returns)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Chart with Rising Height Bars */}
      <div className="growth-bars-container" aria-label="Investment growth visual bars">
        <div className="growth-bars-grid">
          {milestones.map((m) => {
            const isSelected = m.years === selectedYears;
            return (
              <button
                type="button"
                key={m.years}
                className={`growth-bar-column ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedYears(m.years)}
                title={`Year ${m.years}: ${formatINR(m.total)}`}
                aria-pressed={isSelected}
              >
                <div className="bar-val-tooltip">{formatINR(m.total)}</div>

                {/* Outer Bar Shell whose height dynamically grows */}
                <div
                  className="growth-bar-track"
                  style={{ height: `${m.heightPercent}%` }}
                >
                  {/* Top segment: Returns / Growth (Orange-amber gradient) */}
                  <div
                    className="growth-bar-returns"
                    style={{ height: `${m.growthPercent}%` }}
                  />
                  {/* Bottom segment: Principal Invested */}
                  <div
                    className="growth-bar-invested"
                    style={{ height: `${m.investedPercent}%` }}
                  />
                </div>

                <span className="growth-bar-label">Yr {m.years}</span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="growth-legend">
          <div className="legend-item">
            <span className="legend-color returns" />
            <span>Wealth growth (12% p.a.)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color invested" />
            <span>Amount you put in</span>
          </div>
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="growth-controls">
        <div className="growth-control-group">
          <span className="ctrl-title">Monthly SIP</span>
          <div className="preset-chips">
            {MONTHLY_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                className={`preset-btn ${monthly === amt ? "active" : ""}`}
                onClick={() => setMonthly(amt)}
              >
                {formatINR(amt)}
              </button>
            ))}
          </div>
        </div>

        <div className="growth-control-group">
          <span className="ctrl-title">Horizon</span>
          <div className="preset-chips">
            {HORIZONS.map((yr) => (
              <button
                key={yr}
                type="button"
                className={`preset-btn ${selectedYears === yr ? "active" : ""}`}
                onClick={() => setSelectedYears(yr)}
              >
                {yr} yrs
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
