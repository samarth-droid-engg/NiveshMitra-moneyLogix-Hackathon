import React, { useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import Landing from "./components/Landing.jsx";
import Login from "./components/Login.jsx";
import BasicInfo from "./components/BasicInfo.jsx";
import { api } from "./api/client.js";

// Where a logged-in user should land: chat if basics are done, else the form.
function homeView(user) {
  if (!user) return "landing";
  return user.basicInfoComplete ? "chat" : "basicinfo";
}

export default function Root() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("nm_theme") || "dark",
  );
  const [user, setUser] = useState(null);
  const [view, setView] = useState("landing");
  const [booting, setBooting] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const restoreSession = useCallback(async () => {
    setBooting(true);
    setSessionError("");
    localStorage.removeItem("nm_token");
    localStorage.removeItem("nm_user");
    try {
      const result = await api.session();
      setUser(result.user);
      setView(homeView(result.user));
    } catch (error) {
      if (error.status && error.status !== 401) {
        setSessionError(error.message);
      } else {
        setUser(null);
        setView("landing");
      }
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("nm_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  function handleLogin(u) {
    setUser(u);
    setView(u.basicInfoComplete ? "chat" : "basicinfo");
  }

  function handleBasicInfoDone(u) {
    const merged = { ...u, basicInfoComplete: true };
    setUser(merged);
    setView("chat");
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch (error) {
      setSessionError(`Could not sign out securely: ${error.message}`);
      return;
    }
    if (user?.email) localStorage.removeItem(`nm_conversation_${user.email}`);
    setUser(null);
    setView("landing");
  }

  if (booting || sessionError) {
    return (
      <div className="auth">
        <div className="auth-card" role={sessionError ? "alert" : "status"}>
          <h1 className="auth-title">
            {sessionError ? "Could not restore your session" : "Opening NiveshMitra…"}
          </h1>
          {sessionError && <p className="auth-sub">{sessionError}</p>}
          {sessionError && (
            <button className="cta-btn full btn-asym" onClick={restoreSession}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === "chat" && user) {
    return (
      <App
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />
    );
  }

  if (view === "basicinfo" && user) {
    return (
      <BasicInfo
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onDone={handleBasicInfoDone}
      />
    );
  }

  if (view === "login") {
    return (
      <Login
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => setView("landing")}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <Landing
      theme={theme}
      onToggleTheme={toggleTheme}
      onStart={() => setView(user ? homeView(user) : "login")}
    />
  );
}
