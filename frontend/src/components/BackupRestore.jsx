import React, { useRef, useState } from "react";
import { backupApi } from "../api.js";

export default function BackupRestore() {
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  function handleFile(file) {
    setError(null);
    setDone(false);
    setPendingFile(null);
    setPendingData(null);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setPendingFile(file);
        setPendingData(parsed);
      } catch {
        setError("That file isn't valid JSON.");
      }
    };
    reader.readAsText(file);
  }

  async function confirmRestore() {
    setRestoring(true);
    setError(null);
    try {
      await backupApi.importBackup(pendingData);
      setDone(true);
      setPendingFile(null);
      setPendingData(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoring(false);
    }
  }

  function cancel() {
    setPendingFile(null);
    setPendingData(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="card">
      <h2>Backup &amp; restore</h2>
      <p className="muted">
        Download a copy of everything you've logged — profile, food diary, progress, plans, all of
        it — so you don't lose it when you switch phones. Save the file anywhere you like
        (Google Drive, email it to yourself, a cloud drive, a USB stick); restoring just needs the
        file back, from wherever you put it.
      </p>

      <a href={backupApi.exportUrl} download>
        <button className="primary" type="button">Download backup</button>
      </a>

      <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: "0.95rem" }}>Restore from a backup file</h3>

      {!pendingFile && !done && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/json"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}

      {error && <div className="error-banner">{error}</div>}

      {pendingFile && (
        <div className="error-banner" style={{ background: "rgba(250,178,25,0.1)", borderColor: "rgba(250,178,25,0.4)", color: "#a06a00" }}>
          This will replace <strong>all</strong> data currently on this device with the contents of
          "{pendingFile.name}"
          {pendingData?.exportedAt && ` (backed up ${new Date(pendingData.exportedAt).toLocaleString()})`}.
          This can't be undone. Continue?
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="primary" onClick={confirmRestore} disabled={restoring}>
              {restoring ? "Restoring..." : "Yes, restore this backup"}
            </button>
            <button className="secondary" onClick={cancel} disabled={restoring}>Cancel</button>
          </div>
        </div>
      )}

      {done && (
        <div>
          <p className="muted">Restored. Reload the app to see your restored data everywhere.</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload now</button>
        </div>
      )}
    </div>
  );
}
