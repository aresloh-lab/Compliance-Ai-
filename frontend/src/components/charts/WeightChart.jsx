import React from "react";

export default function WeightChart({ entries, goalWeightKg }) {
  const width = 640;
  const height = 200;
  const padding = { top: 16, right: 16, bottom: 24, left: 40 };

  if (entries.length < 2) {
    return <p className="muted">Log at least two weight readings to see a trend line.</p>;
  }

  const values = entries.map((e) => e.value);
  if (goalWeightKg) values.push(goalWeightKg);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;

  const times = entries.map((e) => new Date(e.date).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times) || minT + 1;

  const x = (t) =>
    padding.left + ((t - minT) / (maxT - minT || 1)) * (width - padding.left - padding.right);
  const y = (v) =>
    height - padding.bottom - ((v - min) / (max - min || 1)) * (height - padding.top - padding.bottom);

  const points = entries.map((e) => `${x(new Date(e.date).getTime())},${y(e.value)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weight trend chart">
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + f * (height - padding.top - padding.bottom)}
          y2={padding.top + f * (height - padding.top - padding.bottom)}
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
      {goalWeightKg && (
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={y(goalWeightKg)}
          y2={y(goalWeightKg)}
          stroke="var(--series-3)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      )}
      <polyline points={points} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
      {entries.map((e, i) => (
        <circle
          key={i}
          cx={x(new Date(e.date).getTime())}
          cy={y(e.value)}
          r="4"
          fill="var(--surface-1)"
          stroke="var(--series-1)"
          strokeWidth="2"
        >
          <title>
            {new Date(e.date).toLocaleDateString()}: {e.value} kg
          </title>
        </circle>
      ))}
      <text x={padding.left} y={12} fontSize="11" fill="var(--text-muted)">
        {max.toFixed(0)} kg
      </text>
      <text x={padding.left} y={height - padding.bottom + 16} fontSize="11" fill="var(--text-muted)">
        {min.toFixed(0)} kg
      </text>
    </svg>
  );
}
