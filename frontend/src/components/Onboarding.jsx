import { useState } from "react";

const QUESTIONS = [
  {
    key: "goal", title: "What are you investing for?", sub: "Pick the closest one. You can add more later in chat.",
    options: [
      { v: "emergency", l: "Emergency fund" },
      { v: "purchase", l: "A big purchase", s: "Bike, laptop, home down payment" },
      { v: "wealth", l: "Long-term wealth" },
      { v: "retirement", l: "Retirement" },
    ],
  },
  {
    key: "income", title: "Roughly how much can you invest each month?", sub: "An honest number beats an ambitious one.",
    options: [
      { v: "lt5k", l: "Under ₹5,000" },
      { v: "5k-15k", l: "₹5,000 – ₹15,000" },
      { v: "15k-50k", l: "₹15,000 – ₹50,000" },
      { v: "gt50k", l: "Over ₹50,000" },
    ],
  },
  {
    key: "horizon", title: "When will you need this money?", sub: "Time is the biggest factor in how much risk makes sense.",
    options: [
      { v: "lt2", l: "Within 2 years" },
      { v: "2-5", l: "2 – 5 years" },
      { v: "5-10", l: "5 – 10 years" },
      { v: "gt10", l: "More than 10 years" },
    ],
  },
  {
    key: "reaction", title: "Your investment drops 15% in a month. What do you do?", sub: "There's no right answer. This tells us your comfort level.",
    options: [
      { v: "sell", l: "Sell to stop the loss" },
      { v: "wait", l: "Feel uneasy but wait" },
      { v: "hold", l: "Hold and stay calm" },
      { v: "buy", l: "Buy more while it's cheap" },
    ],
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const q = QUESTIONS[step];
  const last = step === QUESTIONS.length - 1;

  async function next() {
    if (!last) return setStep(step + 1);
    setSaving(true);
    setError("");
    try {
      await onDone?.(answers);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="center-page">
      <div className="card wide">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={step + 1}>
          <i style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="muted">Question {step + 1} of {QUESTIONS.length}</p>
        <h2 style={{ marginTop: 6 }}>{q.title}</h2>
        <p className="muted">{q.sub}</p>

        <div className="options">
          {q.options.map((o) => (
            <button
              key={o.v}
              className={`option ${answers[q.key] === o.v ? "selected" : ""}`}
              onClick={() => setAnswers({ ...answers, [q.key]: o.v })}
            >
              {o.l}
              {o.s && <small>{o.s}</small>}
            </button>
          ))}
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="row-between">
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
          <button className="btn btn-primary" onClick={next} disabled={!answers[q.key] || saving}>
            {last ? (saving ? "Building your plan…" : "See my plan") : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
