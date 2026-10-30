import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api/client.js";
import MessageBubble from "./components/MessageBubble.jsx";
import PlanDashboard from "./components/PlanDashboard.jsx";
import Logo from "./components/Logo.jsx";
import LoadingAnimation from "./components/LoadingAnimation.jsx";
import { SunIcon, MoonIcon, SparkIcon } from "./components/Icons.jsx";
import {
  shouldApplyConversationResult,
  upsertConversation,
} from "./state/conversations.js";

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
  const [conversationLoading, setConversationLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [banner, setBanner] = useState(null);
  const [mock, setMock] = useState(false);
  const [thinkMode, setThinkMode] = useState(
    () => localStorage.getItem("nm_think") === "1",
  );
  const [dashOpen, setDashOpen] = useState(false);
  const [hasNewPlan, setHasNewPlan] = useState(false);
  const [retryRequest, setRetryRequest] = useState(null);
  const [dashWidth, setDashWidth] = useState(() => {
    const saved = Number(localStorage.getItem("nm_dashw"));
    return saved >= 300 ? saved : 440;
  });
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef(null);
  const layoutRef = useRef(null);
  const sendLockRef = useRef(false);
  const activeConversationRef = useRef(conversationId);
  const loadedConversationRef = useRef(null);
  const skipConversationLoadRef = useRef(null);

  useEffect(() => {
    activeConversationRef.current = conversationId;
  }, [conversationId]);

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

  const refreshConversations = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations, user?.email]);

  useEffect(() => {
    let cancelled = false;
    if (!conversationId || !user?.email) {
      setConversationLoading(false);
      return undefined;
    }
    if (skipConversationLoadRef.current === conversationId) {
      skipConversationLoadRef.current = null;
      loadedConversationRef.current = conversationId;
      setConversationLoading(false);
      return undefined;
    }
    const requestedConversationId = conversationId;
    setConversationLoading(true);
    Promise.all([
      api.getHistory(requestedConversationId),
      api.getProfile(requestedConversationId),
      api.getPlan(requestedConversationId).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      }),
    ])
      .then(([history, profileResult, planResult]) => {
        if (
          cancelled ||
          !shouldApplyConversationResult(
            requestedConversationId,
            activeConversationRef.current,
          )
        ) return;
        setMessages(
          (history.messages || []).map((message) => ({
            ...message,
            id: nextMsgId(),
          })),
        );
        setProfile(profileResult.profile);
        setPlan(planResult?.plan || null);
        setBanner(null);
        setRetryRequest(null);
        loadedConversationRef.current = requestedConversationId;
      })
      .catch((error) => {
        if (cancelled) return;
        setBanner({ type: "error", text: error.message });
        const previousId = loadedConversationRef.current;
        if (previousId && previousId !== requestedConversationId) {
          setConversationId(previousId);
          localStorage.setItem(`nm_conversation_${user.email}`, previousId);
        } else if (!previousId && error.status === 404) {
          setConversationId(null);
          localStorage.removeItem(`nm_conversation_${user.email}`);
        }
      })
      .finally(() => {
        if (!cancelled) setConversationLoading(false);
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
    if (!text || sendLockRef.current || conversationLoading) return;
    sendLockRef.current = true;
    const requestId = isRetry && retryRequest?.requestId
      ? retryRequest.requestId
      : crypto.randomUUID();
    setInput("");
    if (!isRetry) {
      setMessages((m) => [...m, { id: nextMsgId(), role: "user", content: text }]);
    }
    setLoading(true);
    setBanner(null);
    try {
      const res = await api.sendMessage({
        conversationId,
        message: text,
        thinkMode,
        requestId,
      });
      if (!conversationId) skipConversationLoadRef.current = res.conversationId;
      setConversationId(res.conversationId);
      localStorage.setItem(`nm_conversation_${user.email}`, res.conversationId);
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
      setRetryRequest(null);
      setProfile(res.profile);
      if (res.conversation) {
        setConversations((current) => upsertConversation(current, res.conversation));
      }
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
        if (res.plan) setPlan(res.plan);
        if (res.planBuilt) {
          setHasNewPlan(true);
          setBanner({
            type: "success",
            text: "Your personalized plan is ready: click “View plan” to open it.",
          });
        }
      }
    } catch (err) {
      setRetryRequest({ text, requestId });
      if (!conversationId && err.body?.conversationId) {
        skipConversationLoadRef.current = err.body.conversationId;
        setConversationId(err.body.conversationId);
        localStorage.setItem(
          `nm_conversation_${user.email}`,
          err.body.conversationId,
        );
      }
      setBanner({ type: "error", text: err.message });
    } finally {
      sendLockRef.current = false;
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function startOver() {
    if (loading || conversationLoading) return;
    setConversationId(null);
    setMessages([]);
    setProfile(null);
    setPlan(null);
    setBanner(null);
    setRetryRequest(null);
    setHasNewPlan(false);
    loadedConversationRef.current = null;
    localStorage.removeItem(`nm_conversation_${user.email}`);
  }

  function selectConversation(id) {
    if (id === conversationId || loading || conversationLoading) return;
    setBanner(null);
    setRetryRequest(null);
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
        disabled={loading || conversationLoading || !input.trim()}
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
          <button className="ghost" onClick={startOver} disabled={loading || conversationLoading}>
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
                disabled={historyLoading}
                title="Reload conversations"
                aria-label="Reload conversations"
              >
                ↻
              </button>
              <button className="history-new" onClick={startOver} disabled={loading || conversationLoading}>
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
                  disabled={loading || conversationLoading}
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
          <label className="mobile-history">
            <span>Conversation</span>
            <select
              value={conversationId || ""}
              disabled={loading || conversationLoading}
              onChange={(event) => {
                if (event.target.value) selectConversation(event.target.value);
                else startOver();
              }}
            >
              <option value="">New conversation</option>
              {conversations.map((conversation) => (
                <option value={conversation._id} key={conversation._id}>
                  {conversation.title || "New chat"}
                </option>
              ))}
            </select>
          </label>
          {banner && (
            <div className={`banner ${banner.type}`} role={banner.type === "error" ? "alert" : "status"}>
              <span>{banner.text}</span>
              {banner.type === "error" && retryRequest && (
                <button type="button" className="banner-retry" onClick={() => send(retryRequest.text, true)} disabled={loading || conversationLoading}>
                  Try again
                </button>
              )}
            </div>
          )}

          {hasStarted ? (
            <>
              <div className="messages" ref={scrollRef} role="log" aria-live="polite" aria-busy={loading || conversationLoading}>
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                {loading && (
                  <div className="bubble-row left">
                    <div className="bubble ai reflecting">
                      <LoadingAnimation variant="inline" label="Reflecting..." />
                    </div>
                  </div>
                )}
                {conversationLoading && (
                  <div className="bubble-row left">
                    <div className="bubble ai reflecting">
                      <LoadingAnimation variant="inline" label="Loading conversation..." />
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
                    disabled={loading || conversationLoading}
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
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
              event.preventDefault();
              if (event.key === "Home") return setDashWidth(440);
              const max = Math.min(780, (layoutRef.current?.clientWidth || 820) - 380);
              const delta = event.key === "ArrowLeft" ? 20 : -20;
              setDashWidth((width) => Math.max(300, Math.min(width + delta, max)));
            }}
            title="Drag to resize · double-click to reset"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={300}
            aria-valuemax={780}
            aria-valuenow={Math.round(dashWidth)}
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
