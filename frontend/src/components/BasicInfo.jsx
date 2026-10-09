import React, { useState } from "react";
import { api } from "../api/client.js";
import Logo from "./Logo.jsx";
import { SunIcon, MoonIcon } from "./Icons.jsx";

const GOALS = [
  "Retirement",
  "Buy a house",
  "Child's education",
  "Wealth building",
  "Emergency fund",
  "Travel",
  "Start a business",
  "Other",
];

export default function BasicInfo({ theme, onToggleTheme, user, onDone }) {
  const [name, setName] = useState(
    user?.name && user.name !== "Friend" ? user.name : "",
  );
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [occupation, setOccupation] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const steps = ["About you", "Money basics", "Your goal"];

  function nextStep() {
    setError("");
    if (step === 0 && (!name.trim() || !age || !city.trim() || !occupation.trim())) {
      setError("Please complete the required details before continuing.");
      return;
    }
    if (step === 1 && !monthlyIncome) {
      setError("Please add your monthly income before continuing.");
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit(e) {
    e.preventDefault();
    if (!goal) {
      setError("Pick your main goal so we can tailor things.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.saveBasicInfo(user.email, {
        name: name.trim(),
        age,
        city: city.trim(),
        occupation: occupation.trim(),
        phone: phone.trim(),
        monthlyIncome,
        goal,
      });
      onDone(res.user);
    } catch (err) {
      setError(err.message || "Could not save your details.");
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <button
        className="ghost icon-btn auth-theme"
        onClick={onToggleTheme}
        title={
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      <form className="auth-card info-card" onSubmit={submit} aria-busy={busy}>
        <Logo size="lg" className="auth-brand" />
        <h2 className="auth-title">A few quick details</h2>
        <p className="auth-sub">
          This helps NiveshMitra understand you before we chat. Takes 20 seconds,
          and we'll learn the rest naturally in conversation.
        </p>
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-label={`Onboarding step ${step + 1} of ${steps.length}`}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={step + 1}
        >
          <div className="onboarding-progress-track">
            <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <span>Step {step + 1} of {steps.length}: {steps[step]}</span>
        </div>

        {step === 0 && <div className="info-grid">
          <label className="auth-label" htmlFor="basic-name">
            Full name
            <input
              id="basic-name"
              type="text"
              value={name}
              autoFocus
              placeholder="e.g. Aarav Sharma"
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </label>

          <label className="auth-label" htmlFor="basic-age">
            Age
            <input
              id="basic-age"
              type="number"
              min="10"
              max="100"
              value={age}
              placeholder="e.g. 28"
              required
              onChange={(e) => setAge(e.target.value)}
            />
          </label>

          <label className="auth-label" htmlFor="basic-city">
            City
            <input
              id="basic-city"
              type="text"
              value={city}
              placeholder="e.g. Pune"
              required
              onChange={(e) => setCity(e.target.value)}
            />
          </label>

          <label className="auth-label" htmlFor="basic-occupation">
            Occupation
            <input
              id="basic-occupation"
              type="text"
              value={occupation}
              placeholder="e.g. Software engineer"
              required
              onChange={(e) => setOccupation(e.target.value)}
            />
          </label>

        </div>}

        {step === 1 && <div className="info-grid">
          <label className="auth-label info-full" htmlFor="basic-phone">
            Phone <span className="optional">(optional)</span>
            <input
              id="basic-phone"
              type="tel"
              value={phone}
              placeholder="e.g. 98765 43210"
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="auth-label info-full" htmlFor="basic-income">
            Monthly income (₹)
            <input
              id="basic-income"
              type="number"
              min="0"
              value={monthlyIncome}
              placeholder="e.g. 60000"
              required
              onChange={(e) => setMonthlyIncome(e.target.value)}
            />
          </label>
        </div>}

        {step === 2 && <div className="info-grid">
          <label className="auth-label info-full" htmlFor="basic-goal">
            Primary financial goal
            <select
              id="basic-goal"
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                setError("");
              }}
            >
              <option value="">Select a goal…</option>
              {GOALS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>}

        {error && <div className="auth-error" role="alert">{error}</div>}

        <div className="onboarding-actions">
          <button
            type="button"
            className="auth-back"
            onClick={() => {
              setError("");
              setStep((current) => Math.max(current - 1, 0));
            }}
            disabled={step === 0 || busy}
          >
            ← Back
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="cta-btn btn-asym" onClick={nextStep}>
              Continue ↗
            </button>
          ) : (
            <button type="submit" className="cta-btn btn-asym" disabled={busy}>
              {busy ? "Saving…" : "Start chatting ↗"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
