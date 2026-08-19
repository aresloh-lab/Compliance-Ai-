import React from "react";

// Decorative, ambient motion behind every screen (login included) — fixed,
// click-through, low-opacity so it never competes with content. Hand-drawn
// SVG motifs tied to real features (water, steps, activity, the balanced
// plate) rather than generic shapes, animated with pure CSS. Respects
// prefers-reduced-motion (see styles.css).
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <svg className="ambient-shape ambient-drift-a" viewBox="0 0 60 60" style={{ top: "10%", left: "6%" }}>
        <path d="M30 6 C46 12, 50 30, 34 46 C18 38, 10 20, 30 6 Z" fill="var(--series-1)" />
      </svg>

      <svg className="ambient-shape ambient-drift-b" viewBox="0 0 60 60" style={{ top: "18%", right: "8%" }}>
        <path d="M30 4 C40 4 46 16 46 26 C46 40 30 54 30 54 C30 54 14 40 14 26 C14 16 20 4 30 4 Z" fill="var(--series-3)" />
      </svg>

      <svg className="ambient-shape ambient-pulse-shape" viewBox="0 0 100 40" style={{ bottom: "22%", left: "10%" }}>
        <path
          d="M0 20 H24 L30 6 L38 34 L46 20 H100"
          stroke="var(--series-1)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <svg className="ambient-shape ambient-drift-c" viewBox="0 0 60 60" style={{ bottom: "14%", right: "12%" }}>
        <ellipse cx="30" cy="46" rx="16" ry="6" fill="var(--series-2)" />
        <path d="M14 20 L20 20 M40 20 L46 20 M17 12 L21 16 M39 12 L35 16" stroke="var(--series-2)" strokeWidth="3" strokeLinecap="round" />
        <path d="M22 20 L18 40 M38 20 L42 40" stroke="var(--series-2)" strokeWidth="3" strokeLinecap="round" />
      </svg>

      <svg className="ambient-shape ambient-drift-d" viewBox="0 0 60 60" style={{ top: "60%", left: "46%" }}>
        <circle cx="30" cy="30" r="4" fill="var(--good)" />
        <circle cx="30" cy="30" r="12" fill="none" stroke="var(--good)" strokeWidth="2" />
        <circle cx="30" cy="30" r="20" fill="none" stroke="var(--good)" strokeWidth="2" />
      </svg>
    </div>
  );
}
