import React from "react";

// A simplified version of the balanced-plate motif from HeroIllustration,
// small enough for the header — same shapes, no separate asset to maintain.
export default function Logomark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="17" cy="17" r="17" fill="rgba(255,255,255,0.16)" />
      <circle cx="17" cy="17" r="12.5" fill="rgba(255,255,255,0.94)" />
      <g transform="translate(17 17)">
        <path d="M0 0 L0 -9.5 A9.5 9.5 0 0 1 8.2 4.75 Z" fill="#1c8f68" />
        <path d="M0 0 L8.2 4.75 A9.5 9.5 0 0 1 -8.2 4.75 Z" fill="#d97b34" />
        <path d="M0 0 L-8.2 4.75 A9.5 9.5 0 0 1 0 -9.5 Z" fill="#2864c4" />
        <circle cx="0" cy="0" r="3.6" fill="#ffffff" />
      </g>
    </svg>
  );
}
