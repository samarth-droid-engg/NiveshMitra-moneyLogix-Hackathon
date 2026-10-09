import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import Logo from "./Logo.jsx";
import { SunIcon, MoonIcon } from "./Icons.jsx";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function Login({ theme, onToggleTheme, onBack, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButtonRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled) return;
      const google = window.google;
      if (!google?.accounts?.id || !googleButtonRef.current) {
        window.setTimeout(renderGoogleButton, 200);
        return;
      }

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: theme === "dark" ? "filled_black" : "outline",
        size: "large",
        width: 320,
        text: "continue_with",
        shape: "pill",
      });
    };

    renderGoogleButton();
    return () => {
      cancelled = true;
    };
  }, [theme]);

  async function handleGoogleCredential(response) {
    if (!response?.credential) {
      setError("Google sign-in was cancelled.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await api.googleLogin(response.credential);
      onLogin(result.user);
    } catch (err) {
      setError(err.message || "Google sign-in failed.");
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) {
      setError("Please enter your email.");
      return;
    }
    if (!password || (mode === "register" && password.length < 8)) {
      setError(mode === "register" ? "Use a password with at least 8 characters." : "Please enter your password.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = mode === "register"
        ? await api.register(mail, password)
        : await api.login(mail, password);
      onLogin(res.user);
    } catch (err) {
      setError(err.message || "Could not sign you in.");
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

      <form className="auth-card" onSubmit={submit} aria-busy={busy}>
        <Logo size="lg" className="auth-brand" />
        <h2 className="auth-title">
          {mode === "register" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="auth-sub">
          {mode === "register"
            ? "Create an account with your email and a password to get started."
            : "Sign in with your email and password to continue."}
        </p>

        {GOOGLE_CLIENT_ID && (
          <>
            <div
              className="google-btn-wrap"
              ref={googleButtonRef}
              aria-label="Continue with Google"
            />
            <div className="auth-divider">
              <span>or</span>
            </div>
          </>
        )}

        <label className="auth-label" htmlFor="login-email">
          Email
          <input
            id="login-email"
            type="email"
            value={email}
            autoFocus
            placeholder="you@example.com"
            autoComplete="email"
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
          />
        </label>

        {mode === "register" && (
          <label className="auth-label" htmlFor="login-confirm-password">
            Confirm password
            <input
              id="login-confirm-password"
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
        )}

        <label className="auth-label" htmlFor="login-password">
          Password
          <input
            id="login-password"
            type="password"
            value={password}
            placeholder="••••••••"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
        </label>

        {error && <div className="auth-error" role="alert" aria-live="assertive">{error}</div>}

        <button type="submit" className="cta-btn full btn-asym" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "register"
              ? "Create account ↗"
              : "Sign in ↗"}
        </button>
        <button
          type="button"
          className="auth-back"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
        <button type="button" className="auth-back" onClick={onBack}>
          ← Back to home
        </button>
      </form>
    </div>
  );
}
