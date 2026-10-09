import React from "react";
import { AlertIcon, HeartIcon } from "./Icons.jsx";

export default function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const emotionLabel = msg.emotion?.fomo
    ? "FOMO check"
    : msg.panicMode
      ? "Calm check"
      : null;
  return (
    <div
      className={`bubble-row ${isUser ? "right" : "left"}`}
      aria-label={isUser ? "Your message" : "NiveshMitra response"}
    >
      <div
        className={`bubble ${isUser ? "user" : "ai"} ${msg.panicMode ? "calm" : ""}`}
      >
        {!isUser && emotionLabel && (
          <div className={`calm-badge ${msg.emotion?.fomo ? "fomo-badge" : ""}`}>
            {msg.emotion?.fomo ? <AlertIcon className="badge-icon" /> : <HeartIcon className="badge-icon" />}
            <span>{emotionLabel}</span>
          </div>
        )}
        <div className="bubble-text">{msg.content}</div>
      </div>
    </div>
  );
}
