import React, { useId } from "react";

export default function Logo({ size = "md", showTagline = false, className = "" }) {
  const isLarge = size === "lg";
  const iconSize = isLarge ? 40 : 30;
  const id = useId().replace(/:/g, "");
  const borderId = `${id}-border`;
  const surfaceId = `${id}-surface`;
  const symbolId = `${id}-symbol`;
  const glowId = `${id}-glow`;

  return (
    <div className={`logo-brand ${isLarge ? "large" : ""} ${className}`.trim()}>
      <div className="logo-icon-wrap" style={{ width: iconSize, height: iconSize }}>
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="logo-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={borderId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF7D0C" />
              <stop offset="50%" stopColor="#FFA43B" />
              <stop offset="100%" stopColor="#FFE1B9" />
            </linearGradient>
            <linearGradient id={surfaceId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1c1611" />
              <stop offset="100%" stopColor="#0d0d0d" />
            </linearGradient>
            <linearGradient id={symbolId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFE8D1" />
              <stop offset="45%" stopColor="#FFA642" />
              <stop offset="100%" stopColor="#FF7D0C" />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#FF7D0C" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Outer Pod */}
          <rect
            x="1.5"
            y="1.5"
            width="37"
            height="37"
            rx="11"
            fill={`url(#${surfaceId})`}
            stroke={`url(#${borderId})`}
            strokeWidth="1.5"
          />

          {/* Compass / Rupee Stems */}
          <g filter={`url(#${glowId})`}>
            {/* Dynamic Compass / N geometric flow */}
            <path
              d="M13 28V12L23 24V12"
              stroke={`url(#${symbolId})`}
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* North-east growth needle glint */}
            <circle cx="27" cy="12" r="2.25" fill="#FFE8D1" />
          </g>
        </svg>
      </div>

      <div className="logo-text-group">
        <span className="logo-title">
          Nivesh<span className="logo-accent">Mitra</span>
          <span className="logo-dot" />
        </span>
        {showTagline && <small className="logo-tagline">your empathetic money companion</small>}
      </div>
    </div>
  );
}
