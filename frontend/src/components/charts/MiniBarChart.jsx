import React from "react";

// A small daily-aggregate bar chart: one bar per day, single hue, optional
// dashed goal reference line. Used for calories/activity/water/steps/junk
// trends — each as its own chart rather than combined on one axis.
export default function MiniBarChart({ data, color = "var(--series-1)", unit = "", goal = null, emptyLabel }) {
  const width = 640;
  const height = 160;
  const padding = { top: 14, right: 12, bottom: 22, left: 36 };

  const hasData = data.some((d) => d.value > 0);
  if (!hasData) {
    return <p className="muted">{emptyLabel || "No data logged in this window yet."}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), goal || 0) * 1.15 || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const barGap = 4;
  const barWidth = data.length ? innerWidth / data.length - barGap : 10;

  const y = (v) => height - padding.bottom - (v / max) * innerHeight;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
      {[0.5, 1].map((f) => (
        <line
          key={f}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + (1 - f) * innerHeight}
          y2={padding.top + (1 - f) * innerHeight}
          stroke="var(--gridline)"
          strokeWidth="1"
        />
      ))}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={height - padding.bottom}
        y2={height - padding.bottom}
        stroke="var(--baseline)"
        strokeWidth="1"
      />
      {goal != null && (
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={y(goal)}
          y2={y(goal)}
          stroke="var(--series-3)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      )}
      {data.map((d, i) => {
        const barHeight = height - padding.bottom - y(d.value);
        const bx = padding.left + i * (barWidth + barGap);
        return (
          <g key={i}>
            <rect
              x={bx}
              y={y(d.value)}
              width={Math.max(barWidth, 2)}
              height={Math.max(barHeight, 0)}
              rx="2"
              fill={color}
            >
              <title>
                {d.label}: {d.value}
                {unit}
              </title>
            </rect>
            <text
              x={bx + barWidth / 2}
              y={height - padding.bottom + 13}
              fontSize="9"
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {d.shortLabel ?? d.label}
            </text>
          </g>
        );
      })}
      <text x={padding.left} y={11} fontSize="11" fill="var(--text-muted)">
        {Math.round(max / 1.15)}
        {unit}
      </text>
    </svg>
  );
}
