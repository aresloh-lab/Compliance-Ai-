import React from "react";

// A hand-drawn SVG, not a stock photo or AI-generated image — deliberately.
// It's built around the app's actual "balanced plate" nutrition model
// (roughly 50% vegetables / 25% protein / 25% carbs, same ratios the coach
// prompts use) rather than generic clipart, and deliberately has no human
// figure at all: a weight-loss app illustrating a specific body is exactly
// the kind of thing that can read as a comparison target rather than as
// welcoming, so a plate/leaf motif carries the "healthy" idea without that.
export default function HeroIllustration({ size = 220 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A balanced plate illustration"
    >
      <circle cx="110" cy="110" r="108" fill="var(--page)" />
      <circle cx="110" cy="110" r="86" fill="var(--surface-1)" stroke="var(--gridline)" strokeWidth="2" />

      {/* The plate, split into balanced-plate segments — gently "breathes" */}
      <g className="hero-plate-breathe" transform="translate(110 110)">
        <path d="M0 0 L0 -62 A62 62 0 0 1 53.7 31 Z" fill="var(--series-1)" opacity="0.88" />
        <path d="M0 0 L53.7 31 A62 62 0 0 1 -53.7 31 Z" fill="var(--series-2)" opacity="0.88" />
        <path d="M0 0 L-53.7 31 A62 62 0 0 1 0 -62 Z" fill="var(--series-3)" opacity="0.88" />
        <circle cx="0" cy="0" r="24" fill="var(--surface-1)" />
        <circle cx="0" cy="0" r="24" fill="none" stroke="var(--border)" strokeWidth="1.5" />
      </g>

      {/* Fork, laid across the bottom edge */}
      <g transform="translate(46 158) rotate(-18)">
        <rect x="0" y="0" width="4" height="34" rx="2" fill="var(--text-secondary)" />
        <path d="M-4 -14 L-4 -2 M0 -16 L0 -2 M4 -14 L4 -2" stroke="var(--text-secondary)" strokeWidth="3" strokeLinecap="round" />
        <path d="M-4 -2 Q0 4 4 -2" stroke="var(--text-secondary)" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      {/* Leaf accents — sway gently, out of phase with each other */}
      <g className="hero-leaf-sway" transform="translate(170 55) rotate(18)">
        <path d="M0 0 C 16 -4, 24 10, 14 22 C 4 10, -4 4, 0 0 Z" fill="var(--series-1)" opacity="0.7" />
        <path d="M2 2 C 8 4, 10 10, 12 16" stroke="var(--surface-1)" strokeWidth="1.2" fill="none" opacity="0.6" />
      </g>
      <g className="hero-leaf-sway hero-leaf-sway-delay" transform="translate(184 88) rotate(50) scale(0.6)">
        <path d="M0 0 C 16 -4, 24 10, 14 22 C 4 10, -4 4, 0 0 Z" fill="var(--series-1)" opacity="0.45" />
      </g>

      {/* Small heartbeat/pulse accent, bottom-right — vitality without a body,
          continuously draws itself left to right like a monitor sweep */}
      <g transform="translate(140 178)">
        <path
          className="hero-pulse-line"
          d="M0 6 H10 L15 -6 L22 16 L27 6 H40"
          stroke="var(--series-3)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.75"
        />
      </g>
    </svg>
  );
}
