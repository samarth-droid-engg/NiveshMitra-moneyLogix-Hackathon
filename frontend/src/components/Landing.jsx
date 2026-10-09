import React, { useState } from "react";
import Logo from "./Logo.jsx";
import InvestmentGrowthChart from "./InvestmentGrowthChart.jsx";
import { SunIcon, MoonIcon } from "./Icons.jsx";

const STEPS = [
  ["01", "Tell us your goal", "A home, a first SIP, retirement, or simply a clearer starting point."],
  ["02", "Understand your comfort", "We use your horizon, income, and reaction to market dips to shape the conversation."],
  ["03", "Get a plan you can question", "See the reasoning, allocation, milestones, and illustrative SIP projections."],
];

const FEATURES = [
  ["Conversational planning", "Ask questions in plain language instead of navigating a finance-heavy form."],
  ["Goal-based risk context", "Your plan starts with what the money is for and when you may need it."],
  ["Panic and FOMO checks", "When urgency takes over, NiveshMitra helps you pause before acting."],
  ["SIP simulations", "Adjust the monthly amount locally and see how assumptions affect the illustration."],
];

export default function Landing({ theme, onToggleTheme, onStart }) {
  const [heroTab, setHeroTab] = useState("growth");

  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <div className="landing-nav-right">
          <nav className="landing-links" aria-label="Landing page sections">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#questions">FAQ</a>
          </nav>
          <button
            className="ghost icon-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="cta-btn small btn-asym" onClick={onStart}>
            Get started ↗
          </button>
        </div>
      </header>

      <main>
        <section className="hero hero-simple">
          <div className="hero-visual-card">
            <div className="hero-tab-toggle" role="tablist" aria-label="Hero visual preview mode">
              <button
                type="button"
                role="tab"
                aria-selected={heroTab === "growth"}
                className={`hero-tab-btn ${heroTab === "growth" ? "active" : ""}`}
                onClick={() => setHeroTab("growth")}
              >
                📊 Growth chart
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={heroTab === "chat"}
                className={`hero-tab-btn ${heroTab === "chat" ? "active" : ""}`}
                onClick={() => setHeroTab("chat")}
              >
                💬 Companion preview
              </button>
            </div>

            {heroTab === "growth" ? (
              <InvestmentGrowthChart />
            ) : (
              <div className="hero-chat-window" aria-hidden="true">
                <div className="hero-chat-top">
                  <span className="hero-chat-dot" />
                  <span>NiveshMitra</span>
                  <span className="hero-chat-status">calm planning</span>
                </div>
                <div className="hero-chat-message user">The market feels uncertain. Where should I start?</div>
                <div className="hero-chat-message assistant">
                  Start with your goal and time horizon. We can make the next step clearer together.
                </div>
                <div className="hero-chat-input">Tell me about your goals…</div>
              </div>
            )}
          </div>
          <div className="hero-left">
            <span className="animated-badge">
              <span className="animated-badge-glint" aria-hidden="true" />
              <span className="animated-badge-inner">Emotion-aware investment companion</span>
            </span>
            <h1 className="hero-title">
              Start investing with a{" "}
              <span className="highlight">clearer mind.</span>
            </h1>
            <p className="hero-sub">
              Talk about your goals and worries in plain language. NiveshMitra
              helps you understand your risk and creates a calm, educational
              investment plan.
            </p>
            <div className="hero-actions">
              <button className="cta-btn btn-asym" onClick={onStart}>
                Start free ↗
              </button>
              <a href="#how-it-works" className="btn-outline btn-asym-mirror">
                See how it works ↓
              </a>
            </div>
            <p className="hero-note">
              Free · educational only · no trading or guaranteed returns
            </p>
          </div>
        </section>

        <section className="section landing-section" id="how-it-works">
          <p className="section-eyebrow">A calmer way to begin</p>
          <h2 className="section-title">
            From an initial idea to a plan{" "}
            <span className="highlight">you understand</span>.
          </h2>
          <ol className="steps">
            {STEPS.map(([number, title, text]) => (
              <li className="step-card" key={title}>
                <span className="step-n">{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section landing-section" id="features">
          <p className="section-eyebrow">Built around real investor emotions</p>
          <h2 className="section-title">
            Useful when you are curious, unsure, or{" "}
            <span className="highlight">overwhelmed</span>.
          </h2>
          <div className="feature-grid">
            {FEATURES.map(([title, text]) => (
              <article className="feature-card" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section landing-section landing-example">
          <div className="compare">
            <div className="compare-col bad">
              <h4>When investing feels noisy</h4>
              <ul>
                <li>Too much jargon and too many opinions</li>
                <li>Buying because everyone else is buying</li>
                <li>Selling before checking the goal or time horizon</li>
              </ul>
            </div>
            <div className="compare-col good">
              <h4>What NiveshMitra helps with</h4>
              <ul>
                <li>Plain-language explanations without hype</li>
                <li>A pause when panic or FOMO shows up</li>
                <li>A goal-based plan you can review and question</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section landing-section" id="questions">
          <p className="section-eyebrow">Good to know</p>
          <h2 className="section-title">Questions people ask</h2>
          <div className="faq">
            <details className="faq-item">
              <summary className="faq-q">Is this financial advice?<span className="faq-sign">+</span></summary>
              <p className="faq-a">No. NiveshMitra provides educational guidance and illustrative planning only. It is not a registered financial adviser.</p>
            </details>
            <details className="faq-item">
              <summary className="faq-q">Does it place trades or hold my money?<span className="faq-sign">+</span></summary>
              <p className="faq-a">No. It does not connect to a broker, place orders, or hold funds.</p>
            </details>
            <details className="faq-item">
              <summary className="faq-q">Are the returns guaranteed?<span className="faq-sign">+</span></summary>
              <p className="faq-a">No. Any projection uses illustrative assumptions. Real markets rise and fall, and results can be lower.</p>
            </details>
          </div>
        </section>

        <section className="cta-band landing-cta">
          <h2>Ready to understand your money better?</h2>
          <p className="hero-note">Start with a conversation. There is nothing to buy.</p>
          <button className="cta-btn btn-asym" onClick={onStart}>
            Start conversation ↗
          </button>
        </section>
      </main>

      <footer className="landing-foot">
        Educational guidance only · not registered financial advice. Mutual fund
        investments are subject to market risks.
      </footer>
    </div>
  );
}
