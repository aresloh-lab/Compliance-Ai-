import React, { useRef, useState } from "react";
import { api } from "../api.js";

export default function DailyActivityCheckin() {
  const [status, setStatus] = useState("idle"); // idle | reading | done | error
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setStatus("reading");
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    try {
      const { extracted, recorded } = await api.activityCheckin(file);
      setResult({ extracted, recorded });
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="card">
      <h2>End-of-day check-in</h2>
      <p className="muted">
        No connected tracker? Take a screenshot of your phone's step counter, fitness app summary,
        or smartwatch face at the end of the day — Claude reads the numbers off it and logs them
        for you. Works for iPhone (Health app) too, since this is just a photo, not a live sync.
      </p>

      {status !== "done" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button className="secondary" onClick={() => inputRef.current?.click()} disabled={status === "reading"}>
            {status === "reading" ? "Reading screenshot..." : "Upload screenshot"}
          </button>
          {preview && status === "reading" && (
            <img src={preview} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
          )}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginTop: 10 }}>
          {error}
          <button className="secondary" style={{ marginLeft: 10 }} onClick={reset}>Try again</button>
        </div>
      )}

      {status === "done" && result && (
        <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
          {preview && (
            <img src={preview} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
          )}
          <div>
            <p style={{ margin: 0 }}>
              {result.extracted.confidence === "low" && (
                <span className="tag borderline" style={{ marginRight: 6 }}>low confidence — double check</span>
              )}
              {result.extracted.summary}
            </p>
            <p className="muted" style={{ margin: "4px 0" }}>
              {result.recorded.stepsLogged != null && `Logged ${result.recorded.stepsLogged} steps today. `}
              {result.recorded.activitiesLogged > 0 &&
                `Added ${result.recorded.activitiesLogged} activit${result.recorded.activitiesLogged === 1 ? "y" : "ies"} to your log.`}
              {result.recorded.stepsLogged == null && result.recorded.activitiesLogged === 0 && "Nothing usable found in that image."}
            </p>
            <button className="secondary" onClick={reset}>Check in again</button>
          </div>
        </div>
      )}
    </div>
  );
}
