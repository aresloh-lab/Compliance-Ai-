import React, { useEffect, useState } from "react";
import { startRegistration, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { Lock } from "lucide-react";
import { authApi } from "../api.js";

export default function SecuritySettings() {
  const [status, setStatus] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [mode, setMode] = useState(null); // null | 'enable' | 'change' | 'disable' | 'recoveryCode'
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState(null);

  function load() {
    authApi.getStatus().then(setStatus);
  }

  useEffect(() => {
    load();
    if (typeof PublicKeyCredential !== "undefined") {
      platformAuthenticatorIsAvailable().then(setBiometricAvailable).catch(() => setBiometricAvailable(false));
    }
  }, []);

  function resetForm() {
    setMode(null);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setNewRecoveryCode(null);
    setError(null);
  }

  async function submitEnable(e) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) return setError("Choose a username.");
    if (password.length < 4) return setError("Use at least 4 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await authApi.setPassword(password, undefined, username.trim());
      setNotice("Login set up.");
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitChange(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 4) return setError("Use at least 4 characters.");
    if (password !== confirmPassword) return setError("New passwords don't match.");
    setBusy(true);
    try {
      await authApi.setPassword(password, currentPassword);
      setNotice("Password changed.");
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRegenerateRecoveryCode(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await authApi.regenerateRecoveryCode(currentPassword);
      setNewRecoveryCode(result.recoveryCode);
      setCurrentPassword("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDisable(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authApi.disable(currentPassword);
      setNotice("Login credentials reset — you'll set up a new username and password next time you open the app.");
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function enableBiometric() {
    setError(null);
    setBusy(true);
    try {
      const options = await authApi.getRegistrationOptions();
      const response = await startRegistration({ optionsJSON: options });
      await authApi.verifyRegistration(response);
      setNotice("Biometric unlock enabled.");
      load();
    } catch (err) {
      setError("Couldn't set up biometric unlock on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBiometric() {
    setBusy(true);
    try {
      await authApi.removeBiometric();
      setNotice("Biometric unlock removed.");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="card">
      <h2>Account & login</h2>
      <p className="muted">
        Your username and password (set at registration) plus optional Face ID/fingerprint/Windows
        Hello, where supported. A login is required to use this app — this is where you change your
        password, add biometric unlock, or reset your login if you ever need to.
      </p>

      {notice && <p className="muted">{notice}</p>}
      {error && <div className="error-banner">{error}</div>}

      {!status.enabled && mode !== "enable" && (
        <button className="secondary" onClick={() => setMode("enable")}>Set up login</button>
      )}

      {mode === "enable" && (
        <form onSubmit={submitEnable}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" type="submit" disabled={busy}>Save</button>
            <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {status.enabled && (
        <>
          <p>
            <span className="tag normal">Logged in as {status.username}</span>
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {mode !== "change" && <button className="secondary" onClick={() => setMode("change")}>Change password</button>}
            {biometricAvailable && !status.biometricRegistered && (
              <button className="secondary" onClick={enableBiometric} disabled={busy}>Enable Face ID/fingerprint</button>
            )}
            {status.biometricRegistered && (
              <button className="secondary" onClick={removeBiometric} disabled={busy}>Remove biometric unlock</button>
            )}
            {mode !== "recoveryCode" && (
              <button className="secondary" onClick={() => setMode("recoveryCode")}>
                {status.hasRecoveryCode ? "Get a new recovery code" : "Set up a recovery code"}
              </button>
            )}
            {mode !== "disable" && <button className="secondary" onClick={() => setMode("disable")}>Reset login</button>}
          </div>

          <button
            className="secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={async () => {
              await authApi.logout().catch(() => {});
              sessionStorage.removeItem("weightCoachUnlocked");
              window.location.reload();
            }}
          >
            <Lock size={14} strokeWidth={2.25} /> Lock now
          </button>

          {mode === "change" && (
            <form onSubmit={submitChange}>
              <div className="field">
                <label>Current password</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" type="submit" disabled={busy}>Save</button>
                <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          )}

          {mode === "recoveryCode" && (
            newRecoveryCode ? (
              <div>
                <p className="muted" style={{ fontSize: "0.8rem" }}>
                  Save this somewhere safe — it won't be shown again, and any old recovery code no
                  longer works.
                </p>
                <div
                  style={{
                    fontFamily: "monospace", fontSize: "1.2rem", fontWeight: 700, letterSpacing: 2,
                    textAlign: "center", padding: "12px 10px", background: "var(--page)",
                    border: "1px solid var(--gridline)", borderRadius: 8, margin: "8px 0",
                  }}
                >
                  {newRecoveryCode}
                </div>
                <button className="primary" onClick={resetForm}>Done</button>
              </div>
            ) : (
              <form onSubmit={submitRegenerateRecoveryCode}>
                <div className="field">
                  <label>Confirm your password to generate a new recovery code</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary" type="submit" disabled={busy}>Generate</button>
                  <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
                </div>
              </form>
            )
          )}

          {mode === "disable" && (
            <form onSubmit={submitDisable}>
              <div className="field">
                <label>Confirm your password to reset your login</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
              </div>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                This clears your username, password, and biometric unlock — your profile and logged
                data are untouched. You'll be asked to set up a new login next time.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" type="submit" disabled={busy}>Reset login</button>
                <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
