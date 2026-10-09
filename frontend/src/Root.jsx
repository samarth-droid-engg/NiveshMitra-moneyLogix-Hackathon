import React, { useEffect, useState } from "react";
import App from "./App.jsx";
import Landing from "./components/Landing.jsx";
import Login from "./components/Login.jsx";
import BasicInfo from "./components/BasicInfo.jsx";
import { api } from "./api/client.js";

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("nm_user") || "null");
  } catch {
    return null;
  }
}

// Where a logged-in user should land: chat if basics are done, else the form.
function homeView(user) {
  if (!user) return "landing";
  return user.basicInfoComplete ? "chat" : "basicinfo";
}

export default function Root() {
  const initialUser = readUser();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("nm_theme") || "dark",
  );
  const [user, setUser] = useState(initialUser);
  const [view, setView] = useState(() =>
    initialUser ? homeView(initialUser) : "landing",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("nm_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  function handleLogin(u) {
    localStorage.setItem("nm_user", JSON.stringify(u));
    setUser(u);
    setView(u.basicInfoComplete ? "chat" : "basicinfo");
  }

  function handleBasicInfoDone(u) {
    const merged = { ...u, basicInfoComplete: true };
    localStorage.setItem("nm_user", JSON.stringify(merged));
    setUser(merged);
    setView("chat");
  }

  function handleLogout() {
    localStorage.removeItem("nm_user");
    localStorage.removeItem("nm_token");
    api.logout().catch(() => {});
    if (user?.email) localStorage.removeItem(`nm_conversation_${user.email}`);
    setUser(null);
    setView("landing");
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
