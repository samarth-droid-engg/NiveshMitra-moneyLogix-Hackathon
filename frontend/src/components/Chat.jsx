import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const QUICK = [
  "I can invest ₹5,000 a month. Where do I start?",
  "The market is crashing. Should I sell?",
  "Explain SIP in simple words",
  "Everyone is buying a hot stock. Should I?",
];

const EMOTION_LABEL = { panic: "Panic check", fomo: "FOMO check", calm: "Calm" };

export default function Chat() {
  const [messages, setMessages] = useState([]); // { role: "user" | "bot", text, emotion? }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const result = await api.sendMessage({
        conversationId,
        message,
        requestId: crypto.randomUUID(),
      });
      setConversationId(result.conversationId);
      const { reply, emotion } = result;
      setMessages((m) => [...m, { role: "bot", text: reply, emotion }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "bot", text: `Couldn't reach the assistant: ${err.message}. Try again.` }]);
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <section className="chat" aria-label="Chat">
      <div className="messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty">
            <h2>What's on your mind?</h2>
            <p className="muted">Ask about a goal, a worry or a term you don't understand.</p>
            <div className="quick">
              {QUICK.map((q) => (
                <button key={q} onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.emotion && m.emotion !== "calm" && (
              <span className={`chip ${m.emotion}`}>{EMOTION_LABEL[m.emotion] ?? m.emotion}</span>
            )}
            <div className="bubble">{m.text}</div>
          </div>
        ))}

        {busy && (
          <div className="msg bot">
            <div className="bubble typing" aria-label="NiveshMitra is typing"><i /><i /><i /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type your message…"
          aria-label="Message"
        />
        <button className="btn btn-primary" onClick={() => send(input)} disabled={busy || !input.trim()}>Send</button>
      </div>
    </section>
  );
}
