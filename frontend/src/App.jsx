import React, { useEffect, useRef, useState } from "react";
import { api } from "./api/client.js";
import MessageBubble from "./components/MessageBubble.jsx";
import PlanDashboard from "./components/PlanDashboard.jsx";
import Logo from "./components/Logo.jsx";
import LoadingAnimation from "./components/LoadingAnimation.jsx";
import { SunIcon, MoonIcon, SparkIcon } from "./components/Icons.jsx";

const SUGGESTIONS = [
  "How should I start investing?",
  "Is SIP better than a fixed deposit?",
  "The market is falling, should I sell?",
  "Help me plan for retirement",
];

// Stable, unique message ids for React keys.
let _msgSeq = 0;
const nextMsgId = () => `m${++_msgSeq}`;

export default function App({ user, theme = "dark", onToggleTheme, onLogout }) {
  const [conversationId, setConversationId] = useState(
    () => localStorage.getItem(`nm_conversation_${user?.email}`) || null,
  );
  const [conversations, setConversations] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [banner, setBanner] = useState(null);
  const [mock, setMock] = useState(false);
  const [thinkMode, setThinkMode] = useState(
    () => localStorage.getItem("nm_think") === "1",
  );
  const [dashOpen, setDashOpen] = useState(false);
  const [hasNewPlan, setHasNewPlan] = useState(false);
  const [retryText, setRetryText] = useState("");
  const [dashWidth, setDashWidth] = useState(() => {
    const saved = Number(localStorage.getItem("nm_dashw"));
    return saved >= 300 ? saved : 440;
  });
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef(null);
  const layoutRef = useRef(null);

  // Draggable splitter between chat and dashboard.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const rect = layoutRef.current?.getBoundingClientRect();
      if (!rect) return;
      let w = rect.right - e.clientX - 18; // account for right padding
      const max = Math.min(780, rect.width - 380);
      w = Math.max(300, Math.min(w, max));
      setDashWidth(w);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  useEffect(() => {
    localStorage.setItem("nm_dashw", String(Math.round(dashWidth)));
  }, [dashWidth]);

  useEffect(() => {
    localStorage.setItem("nm_think", thinkMode ? "1" : "0");
  }, [thinkMode]);

  useEffect(() => {
    api
      .health()
      .then((h) => setMock(h.mockLLM))
      .catch(() => {});
  }, [user?.email]);

  const refreshConversations = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await api.getConversations();
      setConversations(result.conversations || []);
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    refreshConversations();
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;
    if (!conversationId || !user?.email) return undefined;
    Promise.all([
      api.getHistory(conversationId, user.email),
      api.getProfile(conversationId, user.email),
      api.getPlan(conversationId, user.email).catch(() => null),
    ])
      .then(([history, profileResult, planResult]) => {
        if (cancelled) return;
        setMessages(
          (history.messages || []).map((message) => ({
            ...message,
            id: nextMsgId(),
          })),
        );
        setProfile(profileResult.profile);
        if (planResult?.plan) setPlan(planResult.plan);
      })
      .catch(() => {
        if (!cancelled) {
          setConversationId(null);
          localStorage.removeItem(`nm_conversation_${user.email}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, user?.email]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(maybeText, isRetry = false) {
    const text = (typeof maybeText === "string" ? maybeText : input).trim();
    if (!text || loading) return;
    setInput("");
    if (!isRetry) {
      setMessages((m) => [...m, { id: nextMsgId(), role: "user", content: text }]);
    }
    setLoading(true);
    setBanner(null);
    try {
      const res = await api.sendMessage({
        email: user.email,
        conversationId,
        message: text,
        thinkMode,
      });
      setConversationId(res.conversationId);
      localStorage.setItem(`nm_conversation_${user.email}`, res.conversationId);
      refreshConversations();
      setMessages((m) => [
        ...m,
        {
          id: nextMsgId(),
          role: "assistant",
          content: res.reply,
          panicMode: res.emotion?.panicMode,
          emotion: {
            detected: res.emotion?.detected,
            confidence: res.emotion?.confidence,
            triggeredBy: res.emotion?.triggeredBy,
            fomo: res.emotion?.fomo,
          },
        },
      ]);
      setRetryText("");
      setProfile(res.profile);
      if (res.emotion?.panicMode) {
        setBanner({
          type: "calm",
          text: "We noticed you might be experiencing market stress. Take a breath: avoid rushed portfolio decisions.",
        });
      } else if (res.emotion?.fomo) {
        setBanner({
          type: "fomo",
          text: "Excitement can make urgency feel like certainty. Compare with your goal-based allocation before committing capital.",
        });
      } else if (res.checkIn) {
        setBanner({
          type: "checkin",
          text: "Periodic check-in: how are you feeling about your progress so far?",
        });
      }
      if (res.planBuilt || res.phase === "advisor") {
        const p = await api.getPlan(res.conversationId, user.email).catch(() => null);
        if (p?.plan) setPlan(p.plan);
        if (res.planBuilt) {
          setHasNewPlan(true);
          setBanner({
            type: "success",
            text: "Your personalized plan is ready: click “View plan” to open it.",
          });
        }
      }
    } catch (err) {
      setRetryText(text);
      setBanner({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function startOver() {
    setConversationId(null);
    setMessages([]);
    setProfile(null);
    setPlan(null);
    setBanner(null);
    setHasNewPlan(false);
    localStorage.removeItem(`nm_conversation_${user.email}`);
  }

  function selectConversation(id) {
    if (id === conversationId) return;
    setMessages([]);
    setProfile(null);
    setPlan(null);
    setBanner(null);
    setHasNewPlan(false);
    setConversationId(id);
    localStorage.setItem(`nm_conversation_${user.email}`, id);
  }

  const hasStarted = messages.some((m) => m.role === "user");

  const composer = (
    <div className="composer">
      <button
        type="button"
        className={`think-toggle ${thinkMode ? "on" : ""}`}
        onClick={() => setThinkMode((v) => !v)}
        title={
          thinkMode
            ? "Think mode ON: deeper reasoning, richer answers"
            : "Think mode OFF: fast, concise answers"
        }
        aria-pressed={thinkMode}
      >
        <span className="think-icon"><SparkIcon /></span>
        <span className="think-label">Think</span>
      </button>
      <textarea
        aria-label="Message to NiveshMitra"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        placeholder="Tell me about your goals, or how you're feeling about the market…"
        rows={1}
      />
      <button
        onClick={send}
        disabled={loading || !input.trim()}
        aria-label="Send message"
      >
        <span className="send-icon">➤</span>
      </button>
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <Logo showTagline />
        <div className="topbar-right">
          {mock && <span className="mock-pill">MOCK LLM</span>}
          {plan && (
            <button
              className={`ghost dash-toggle ${dashOpen ? "active" : ""} ${
                hasNewPlan && !dashOpen ? "pulse" : ""
              }`}
              onClick={() => {
                setDashOpen((o) => !o);
                setHasNewPlan(false);
              }}
            >
              {dashOpen ? "Hide plan" : "View plan"}
              {hasNewPlan && !dashOpen && <span className="new-dot" />}
            </button>
          )}
          <button
            className="ghost icon-btn"
            onClick={onToggleTheme}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="ghost" onClick={startOver}>
            Start over
          </button>
          {user && (
            <div className="user-chip" title={user.email || user.name}>
              <span className="user-avatar">
                {(user.name || "U").trim().charAt(0).toUpperCase()}
              </span>
              <button className="ghost logout-btn" onClick={onLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main
        className={`layout ${dragging ? "dragging" : ""} ${
          dashOpen ? "" : "chat-only"
        }`}
        ref={layoutRef}
      >
        <aside className="history-panel">
          <div className="history-head">
            <div>
              <span className="history-eyebrow">YOUR CHATS</span>
              <h2>Conversation history</h2>
            </div>
            <div className="history-head-actions">
              <button
                type="button"
                className={`history-reload-btn ${historyLoading ? "spinning" : ""}`}
                onClick={refreshConversations}
                title="Reload conversations"
                aria-label="Reload conversations"
              >
                ↻
              </button>
              <button className="history-new" onClick={startOver}>
                + New
              </button>
            </div>
          </div>
          {historyLoading && (
            <div className="history-loading-wrap">
              <LoadingAnimation size="sm" label="Reloading chats..." />
            </div>
          )}
          {!historyLoading && historyError && (
            <p className="history-status error">{historyError}</p>
          )}
          {!historyLoading && !historyError && conversations.length === 0 && (
            <p className="history-status">Your saved chats will appear here.</p>
          )}
          {!historyLoading && (
            <div className="history-list">
              {conversations.map((conversation) => (
                <button
                  type="button"
                  className={`history-item ${
                    conversation._id === conversationId ? "active" : ""
                  }`}
                  key={conversation._id}
                  onClick={() => selectConversation(conversation._id)}
                >
                  <strong>{conversation.title || "New chat"}</strong>
                  <span>
                    {conversation.messageCount || 0} messages ·{" "}
                    {formatConversationDate(conversation.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className={`chat-panel ${hasStarted ? "" : "empty"}`}>
          {banner && (
            <div className={`banner ${banner.type}`} role={banner.type === "error" ? "alert" : "status"}>
              <span>{banner.text}</span>
              {banner.type === "error" && retryText && (
                <button type="button" className="banner-retry" onClick={() => send(retryText, true)} disabled={loading}>
                  Try again
                </button>
              )}
            </div>
          )}

          {hasStarted ? (
            <>
              <div className="messages" ref={scrollRef}>
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                {loading && (
                  <div className="bubble-row left">
                    <div className="bubble ai typing" role="status" aria-label="NiveshMitra is reflecting">
                      <LoadingAnimation variant="inline" label="Reflecting..." />
                    </div>
                  </div>
                )}
              </div>
              {composer}
              <p className="foot-note">
                Educational only · not registered financial advice. Try: “the
                market is crashing, should I sell everything?”
              </p>
            </>
          ) : (
            <div className="empty-hero">
              <Logo size="lg" className="empty-logo-wrap" />
              <h2 className="empty-title">
                {user?.name && user.name !== "Friend"
                  ? `Hi ${user.name}, `
                  : "Hi, "}
                I'm NiveshMitra
              </h2>
              <p className="empty-sub">
                Your empathetic money companion. No jargon, no judgement: ask
                me anything about your money, or just tell me what's on your
                mind.
              </p>
              {composer}
              <div className="empty-suggests">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="suggest-chip"
                    onClick={() => send(s)}
                    disabled={loading}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="foot-note">
                Educational only · not registered financial advice.
              </p>
            </div>
          )}
        </section>

        {dashOpen && (
          <div
            className="resizer"
            onMouseDown={() => setDragging(true)}
            onDoubleClick={() => setDashWidth(440)}
            title="Drag to resize · double-click to reset"
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
          >
            <span className="resizer-grip" />
          </div>
        )}

        {dashOpen && (
          <aside className="dash-panel" style={{ width: dashWidth }}>
            <div className="dash-bar">
              <span className="dash-bar-title">Your dashboard</span>
              <button
                className="dash-close"
                onClick={() => setDashOpen(false)}
                title="Close dashboard"
                aria-label="Close dashboard"
              >
                ✕
              </button>
            </div>
            <PlanDashboard plan={plan} profile={profile} />
          </aside>
        )}
      </main>
    </div>
  );
}

function formatConversationDate(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
