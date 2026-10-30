import React, { useId } from "react";

export default function LoadingAnimation({
  size = "md",
  label = "Syncing...",
  variant = "orbit", // 'orbit' | 'dots' | 'inline'
  className = "",
}) {
  const gradientId = `${useId().replace(/:/g, "")}-reload-grad`;
  if (variant === "inline") {
    return (
      <span className={`reload-spinner-inline ${className}`} aria-label={label} role="status">
        <svg className="spin-svg" viewBox="0 0 24 24" width="16" height="16" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
          <path
            d="M12 3a9 9 0 0 1 9 9"
            stroke={`url(#${gradientId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFE1B9" />
              <stop offset="100%" stopColor="#FF7D0C" />
            </linearGradient>
          </defs>
        </svg>
        {label && <span className="reload-label">{label}</span>}
      </span>
    );
  }

  return (
    <div className={`cool-reloader ${size} ${className}`} role="status" aria-label={label}>
      <div className="reloader-visual">
        {/* Outer glowing orbit */}
        <div className="orbit-ring" />
        {/* Segmented rotating ring */}
        <div className="orbit-comet" />
        {/* Glowing pulsing core */}
        <div className="orbit-core">
          <span className="core-pulse" />
        </div>
      </div>
      {label && <p className="reloader-text">{label}</p>}
    </div>
  );
}
