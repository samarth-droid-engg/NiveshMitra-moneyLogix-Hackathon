import React, { useCallback, useEffect, useMemo, useState } from "react";
import { inr, compact } from "../utils/formatters.js";
import {
  allocateMonthlyAmounts,
  sipFutureValue,
} from "../utils/finance.js";

const COLORS = [
  "#8ab4f8",
  "#81c995",
  "#fdd663",
  "#9b72cb",
  "#f28b82",
  "#78d9ec",
];

// Uses assumptions supplied by the backend; the fallback preserves old plans.
function assetAnnualReturn(asset = "", assumptions = {}) {
  const a = asset.toLowerCase();
  if (a.includes("small")) return assumptions.smallCap ?? 0.14;
  if (a.includes("mid")) return assumptions.midCap ?? 0.13;
  if (a.includes("flexi") || a.includes("multi")) return assumptions.flexiCap ?? 0.12;
  if (a.includes("international") || a.includes("us ") || a.includes("global"))
    return assumptions.international ?? 0.12;
  if (a.includes("large") || a.includes("index") || a.includes("equity"))
    return assumptions.equity ?? 0.11;
  if (a.includes("reit") || a.includes("real")) return assumptions.realEstate ?? 0.09;
  if (a.includes("gold")) return assumptions.gold ?? 0.08;
  if (a.includes("debt") || a.includes("bond") || a.includes("fixed"))
    return assumptions.debt ?? 0.07;
  if (a.includes("liquid") || a.includes("cash")) return assumptions.liquid ?? 0.055;
  return assumptions.default ?? 0.1;
}

// Future value of a monthly SIP compounded monthly.
export default function PlanDashboard({ plan, profile }) {
  const horizon = Math.max(1, Math.min(60, Number(profile?.horizonYears) || 10));
  const baseSIP = Number(plan?.monthlySIP) || 10000;
  const assumptions = plan?.returnAssumptions || {};

  // Editable per-asset monthly amounts so the user can simulate "what if".
  const [amounts, setAmounts] = useState({});

  useEffect(() => {
    if (!plan?.allocation) return;
    setAmounts(allocateMonthlyAmounts(plan.allocation, baseSIP));
  }, [plan?.allocation, plan?.templateId, baseSIP]);

  const pieData = useMemo(
    () =>
      (plan?.allocation || []).map((a) => ({
        name: a.asset,
        value: a.percent,
      })),
    [plan?.allocation],
  );

  const totalMonthly = useMemo(
    () =>
      (plan?.allocation || []).reduce((s, a) => s + (amounts[a.asset] || 0), 0),
    [plan?.allocation, amounts],
  );

  const totalCorpus = useMemo(
    () =>
      (plan?.allocation || []).reduce(
        (s, a) =>
          s +
          sipFutureValue(
            amounts[a.asset] || 0,
            assetAnnualReturn(a.asset, assumptions),
            horizon,
          ),
        0,
      ),
    [plan?.allocation, amounts, horizon, assumptions],
  );

  const totalInvested = totalMonthly * horizon * 12;

  const resetAmounts = useCallback(() => {
    if (!plan?.allocation) return;
    setAmounts(allocateMonthlyAmounts(plan.allocation, baseSIP));
  }, [plan?.allocation, baseSIP]);

  if (!plan) {
    return (
      <div className="dash empty">
        <h3>Your plan appears here</h3>
        <p>
          Chat with NiveshMitra about your goals, horizon, income and how you
          feel about market dips. Once we know enough, a personalized plan is
          generated automatically.
        </p>
        {profile && <ProfileProgress profile={profile} />}
      </div>
    );
  }

  return (
    <div className="dash">
      <div className="plan-header">
        <span className="cat-pill">
          {plan.riskCategory || profile?.riskCategory}
        </span>
        <h2>{plan.templateName}</h2>
        <p className="tagline">{plan.tagline}</p>
        {plan.goal && <p className="plan-goal">Goal: {plan.goal}</p>}
        {plan.goalPriority && <p className="plan-goal-priority">{plan.goalPriority}</p>}
        <div className="plan-stats">
          <Stat
            label="Risk score"
            value={plan.riskScore ?? profile?.riskScore ?? "--"}
          />
          <Stat label="Target return" value={plan.expectedReturn} />
          <Stat
            label="Monthly SIP"
            value={
              plan.monthlySIP
                ? `₹${plan.monthlySIP.toLocaleString("en-IN")}`
                : "--"
            }
          />
        </div>
      </div>

      <div className="allocation-chart" aria-label="Recommended allocation">
        <div
          className="allocation-pie"
          style={{
            background: `conic-gradient(${pieData
              .map((item, index) => {
                const start = pieData
                  .slice(0, index)
                  .reduce((total, entry) => total + entry.value, 0);
                return `${COLORS[index % COLORS.length]} ${start}% ${
                  start + item.value
                }%`;
              })
              .join(", ")})`,
          }}
          role="img"
          aria-label={pieData
            .map((item) => `${item.name}: ${item.value}%`)
            .join(", ")}
        >
          <div className="allocation-pie-hole" />
        </div>
        <ul className="allocation-legend">
          {pieData.map((item, index) => (
            <li key={item.name}>
              <span
                className="legend-dot"
                style={{ background: COLORS[index % COLORS.length] }}
              />
              <span>{item.name}</span>
              <strong>{item.value}%</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="sim-head">
        <h3 className="ms-title">Adjust & simulate</h3>
        <button className="ghost tiny" onClick={resetAmounts}>
          Reset
        </button>
      </div>
      <p className="sim-sub">
        Adjust this local what-if simulation; your saved recommendation stays unchanged.
      </p>

      <div className="alloc-list">
        {plan.allocation.map((a, i) => {
          const amt = amounts[a.asset] || 0;
          const rate = assetAnnualReturn(a.asset, assumptions);
          const simulatedPercent = totalMonthly
            ? Math.round((amt / totalMonthly) * 100)
            : 0;
          const fv = sipFutureValue(amt, rate, horizon);
          const sliderMax = Math.max(
            baseSIP,
            Math.round((baseSIP * a.percent) / 100) * 3,
            5000,
          );
          return (
            <div className="alloc-item" key={a.asset}>
              <div className="alloc-top">
                <span
                  className="dot"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <strong>{a.asset}</strong>
                <span className="pct" title="Recommended allocation">
                  {simulatedPercent}% simulated · {a.percent}% recommended
                </span>
              </div>
              <div className="examples">{(a.examples || []).join(" · ")}</div>

              <input
                type="range"
                className="alloc-slider"
                min={0}
                max={sliderMax}
                step={500}
                value={amt}
                style={{ accentColor: COLORS[i % COLORS.length] }}
                onChange={(e) =>
                  setAmounts((m) => ({
                    ...m,
                    [a.asset]: Number(e.target.value),
                  }))
                }
                aria-label={`Simulate monthly amount for ${a.asset}`}
              />
              <div className="alloc-proj">
                <span className="proj-amt">{inr(amt)}/mo</span>
                <span className="proj-arrow">→</span>
                <span className="proj-fv">{compact(fv)}</span>
                <span className="proj-rate">
                  @ {(rate * 100).toFixed(1)}% p.a.
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sim-total">
        <div>
          <div className="stat-label">Total / month</div>
          <div className="sim-total-val">{inr(totalMonthly)}</div>
        </div>
        <div>
          <div className="stat-label">You invest</div>
          <div className="sim-total-val">{compact(totalInvested)}</div>
        </div>
        <div>
          <div className="stat-label">Illustrative projection in {horizon} yrs</div>
          <div className="sim-total-val accent">{compact(totalCorpus)}</div>
        </div>
      </div>
      <p className="sim-note">
        Illustrative projection only. Assumptions are not forecasts or guarantees.
      </p>

      <h3 className="ms-title">Milestones</h3>
      <ul className="milestones">
        {(plan.milestones || []).map((m) => (
          <li key={m.label}>
            <span className="ms-dot" />
            <div>
              <div>{m.label}</div>
              {m.targetYear && <small>by {m.targetYear}</small>}
            </div>
          </li>
        ))}
      </ul>

      <p className="disclaimer">{plan.disclaimer}</p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ProfileProgress({ profile }) {
  const items = [
    ["Goals", (profile.goals || []).length ? profile.goals.join(", ") : null],
    ["Horizon", profile.horizonYears ? `${profile.horizonYears} yrs` : null],
    [
      "Monthly income",
      profile.monthlyIncome ? `₹${profile.monthlyIncome}` : null,
    ],
    [
      "Investable / mo",
      profile.monthlyInvestable ? `₹${profile.monthlyInvestable}` : null,
    ],
    ["Volatility comfort", profile.fearTolerance],
  ];
  const done = items.filter(([, v]) => v).length;
  return (
    <div className="progress">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
      <ul className="progress-list">
        {items.map(([k, v]) => (
          <li key={k} className={v ? "ok" : ""}>
            <span>{v ? "✓" : "○"}</span> {k}
            {v && <em>{v}</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
