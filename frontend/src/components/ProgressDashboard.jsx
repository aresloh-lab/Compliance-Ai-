import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import WeightChart from "./charts/WeightChart.jsx";
import PlateauAlert from "./PlateauAlert.jsx";

const TYPE_LABELS = {
  weight: "Weight",
  bloodPressure: "Blood pressure",
  glucose: "Blood glucose",
  uricAcid: "Uric acid",
};

export default function ProgressDashboard({ profile }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("weight");
  const [value, setValue] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [source, setSource] = useState("manual");
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    api
      .getProgress()
      .then(setEntries)
      .finally(() => setLoading(false));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const body =
        type === "bloodPressure"
          ? { type, systolic: Number(systolic), diastolic: Number(diastolic), source }
          : { type, value: Number(value), source };
      const entry = await api.addProgress(body);
      setEntries((es) => [...es, entry]);
      setValue("");
      setSystolic("");
      setDiastolic("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await api.deleteProgress(id);
    setEntries((es) => es.filter((e) => e.id !== id));
  }

  const weightEntries = entries.filter((e) => e.type === "weight");

  return (
    <>
      <PlateauAlert />

      <div className="card">
        <h2>Weight trend</h2>
        {loading ? <p className="muted">Loading...</p> : <WeightChart entries={weightEntries} goalWeightKg={profile?.goalWeightKg} />}
      </div>

      <div className="card">
        <h2>Log a reading</h2>
        <p className="muted">
          Log readings from any kit — a smart scale, blood pressure monitor, glucose meter, or
          uric acid meter. Mark the source as "Device" if you're transcribing it from a connected
          kit's own app; automatic syncing isn't wired up in this build.
        </p>
        <form onSubmit={submit}>
          <div className="row">
            <div className="field">
              <label>Measurement</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Source</label>
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="manual">Manual entry</option>
                <option value="device">Device / kit reading</option>
              </select>
            </div>
          </div>

          {type === "bloodPressure" ? (
            <div className="row">
              <div className="field">
                <label>Systolic (mmHg)</label>
                <input type="number" value={systolic} onChange={(e) => setSystolic(e.target.value)} required />
              </div>
              <div className="field">
                <label>Diastolic (mmHg)</label>
                <input type="number" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} required />
              </div>
            </div>
          ) : (
            <div className="field">
              <label>
                Value ({type === "weight" ? "kg" : "mg/dL"})
              </label>
              <input type="number" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} required />
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}
          <button className="primary" type="submit">Add reading</button>
        </form>
      </div>

      <div className="card">
        <h2>History</h2>
        {entries.length === 0 && <p className="muted">No readings logged yet.</p>}
        <ul className="progress-list">
          {[...entries].reverse().map((e) => (
            <li key={e.id}>
              <span>
                <strong>{TYPE_LABELS[e.type]}</strong>{" "}
                {e.type === "bloodPressure" ? `${e.systolic}/${e.diastolic} mmHg` : `${e.value} ${e.unit}`}
                {" — "}
                <span className="muted">{new Date(e.date).toLocaleDateString()}</span>
                {e.source === "device" && <span className="tag normal" style={{ marginLeft: 6 }}>device</span>}
              </span>
              <button onClick={() => remove(e.id)}>Remove</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
