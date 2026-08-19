import React, { useRef, useState } from "react";
import { FileText, Send } from "lucide-react";
import { api } from "../api.js";

const CONDITION_LABELS = {
  hypertension: "High blood pressure",
  highCholesterol: "High cholesterol",
  highBloodSugar: "High blood sugar",
  highUricAcid: "High uric acid / gout",
};

export default function HealthReportAnalyzer({ profile, onApplyConditions }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState(false);
  const inputRef = useRef(null);

  function handleFile(e) {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setApplied(false);
  }

  async function analyze() {
    if (!file) {
      setError("Choose a PDF or image of your health/lab report.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const analysis = await api.analyzeHealthReport(file);
      setResult(analysis);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function applyConditions() {
    const existing = profile?.conditions || [];
    const merged = Array.from(new Set([...existing, ...(result?.detectedConditions || [])]));
    await onApplyConditions({ ...profile, conditions: merged });
    setApplied(true);
  }

  const newConditions = (result?.detectedConditions || []).filter(
    (c) => !(profile?.conditions || []).includes(c)
  );

  return (
    <div className="card">
      <h2>Health report analyzer</h2>
      <p className="muted">
        Upload a lab report or biometric screening (PDF, photo, or a spreadsheet export) — the
        coach will read out the key markers and flag anything relevant to your diet plan.
      </p>

      <div className="meal-search">
        <button
          type="button"
          className="meal-search-icon"
          onClick={() => inputRef.current?.click()}
          title="Choose file"
          aria-label="Choose file"
        >
          <FileText size={18} strokeWidth={2.25} />
        </button>
        <span className="meal-search-input" style={{ color: file ? "var(--text-primary)" : "var(--text-secondary)" }}>
          {file ? file.name : "Choose a PDF, photo, or spreadsheet of your report..."}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,image/*,.xlsx,.csv"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <button type="button" className="meal-search-submit" onClick={analyze} disabled={loading}>
          <Send size={16} strokeWidth={2.25} color="#fff" />
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 18 }}>
          {result.reportDate && <p className="muted">Report date: {result.reportDate}</p>}
          <p>{result.summary}</p>

          {result.markers?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Markers found</h3>
              <ul className="list-plain">
                {result.markers.map((m, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {m.name}: {m.value}
                    {m.referenceRange ? ` (ref: ${m.referenceRange})` : ""}{" "}
                    <span className={`tag ${m.status}`}>{m.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {result.detectedConditions?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Conditions detected</h3>
              <ul className="list-plain">
                {result.detectedConditions.map((c) => (
                  <li key={c}>{CONDITION_LABELS[c] || c}</li>
                ))}
              </ul>
              {newConditions.length > 0 ? (
                <button className="secondary" onClick={applyConditions} disabled={applied}>
                  {applied ? "Applied to profile" : "Apply to my profile"}
                </button>
              ) : (
                <p className="muted">Already reflected in your profile.</p>
              )}
            </>
          )}

          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
