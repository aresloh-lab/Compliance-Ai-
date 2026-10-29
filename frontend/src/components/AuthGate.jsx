import React, { useEffect, useState } from "react";
import { startRegistration, startAuthentication, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { Lock } from "lucide-react";
import { api, authApi, inviteApi } from "../api.js";
import HeroIllustration from "./HeroIllustration.jsx";
import { COUNTRIES } from "../countries.js";

const SESSION_KEY = "weightCoachUnlocked";
const LANDING_TAB_KEY = "weightCoachLandingTab";
const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  name: "",
  dob: "",
  gender: "",
  heightCm: "",
  weightKg: "",
  nationality: "",
  username: "",
  password: "",
  confirmPassword: "",
};

// Step 1: a login page — just ID and password, with "Register now" below.
// Step 2: tapping Register now goes to the registration page (profile info
// + create a login). Step 3: once that's saved, it lands straight in the
// coach chat. Returning users always land back on the login page (step 1)
// until they enter their credentials.
export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState(null);
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem(SESSION_KEY) === "true");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [view, setView] = useState("login"); // "login" | "register"

  const [form, setForm] = useState(EMPTY_FORM);
  const [offerBiometric, setOfferBiometric] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Shown once, right after it's issued (at registration, or after a
  // successful recovery which rotates in a new one) — never retrievable again.
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [afterRecoveryCode, setAfterRecoveryCode] = useState("unlock"); // "biometric" | "unlock"

  const [recoverUsername, setRecoverUsername] = useState("");
  const [recoverCode, setRecoverCode] = useState("");
  const [recoverNewPassword, setRecoverNewPassword] = useState("");
  const [recoverConfirmPassword, setRecoverConfirmPassword] = useState("");

  // A partner arrives via a ?invite=CODE link — the code is pre-filled, and
  // claimNeedsProfile only flips on once the server tells us this code
  // hasn't been claimed yet (a *returning* partner just needs the code).
  const [inviteCode, setInviteCode] = useState("");
  const [claimNeedsProfile, setClaimNeedsProfile] = useState(false);

  useEffect(() => {
    authApi
      .getStatus()
      .then(setAuthStatus)
      .catch(() => setAuthStatus(null));

    api
      .getProfile()
      .then(() => {
        sessionStorage.setItem(SESSION_KEY, "true");
        setUnlocked(true);
      })
      .catch(() => {
        sessionStorage.removeItem(SESSION_KEY);
        setUnlocked(false);
      })
      .finally(() => setLoading(false));

    if (typeof PublicKeyCredential !== "undefined") {
      platformAuthenticatorIsAvailable().then(setBiometricAvailable).catch(() => setBiometricAvailable(false));
    }

    const codeFromUrl = new URLSearchParams(window.location.search).get("invite");
    if (codeFromUrl) {
      setInviteCode(codeFromUrl.trim());
      setView("claim");
    }
  }, []);

  function markUnlocked() {
    sessionStorage.setItem(SESSION_KEY, "true");
    setUnlocked(true);
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function goToRegister() {
    setError(null);
    setView("register");
  }

  function goToLogin() {
    setError(null);
    setView("login");
  }

  function goToRecover() {
    setError(null);
    setView("recover");
  }

  function continueAfterRecoveryCode() {
    setShowRecoveryCode(false);
    if (afterRecoveryCode === "biometric") {
      setOfferBiometric(true);
    } else {
      markUnlocked();
    }
  }

  async function submitRegister(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.dob || !form.gender || !form.heightCm || !form.weightKg || !form.nationality.trim()) {
      return setError("All fields are required to register.");
    }
    if (!form.username.trim()) return setError("Choose a login ID.");
    if (form.password.length < 4) return setError("Password must be at least 4 characters.");
    if (form.password !== form.confirmPassword) return setError("Passwords don't match.");

    setBusy(true);
    try {
      // Account first — PUT /api/profile requires a valid session, so the
      // login has to exist before the profile write (the session cookie is
      // set automatically by the browser from the response).
      const authResult = await authApi.setPassword(form.password, undefined, form.username.trim());

      // A login reset (credentials cleared but profile data left alone)
      // lands here too, since this is the only way back in. Don't let the
      // freshly-typed form clobber a profile that's already on record.
      const existingProfile = await api.getProfile().catch(() => null);
      if (!existingProfile) {
        await api.saveProfile({
          name: form.name.trim(),
          dob: form.dob,
          gender: form.gender,
          heightCm: Number(form.heightCm),
          weightKg: Number(form.weightKg),
          nationality: form.nationality.trim(),
          goalWeightKg: null,
          activityLevel: "sedentary",
          conditions: [],
        });
      }
      setAuthStatus((s) => ({ ...s, enabled: true, username: authResult.username }));
      sessionStorage.setItem(LANDING_TAB_KEY, "coach"); // step 3: land in the chat page once registered
      if (authResult.recoveryCode) {
        setRecoveryCode(authResult.recoveryCode);
        setShowRecoveryCode(true);
        setAfterRecoveryCode(biometricAvailable ? "biometric" : "unlock");
      } else if (biometricAvailable) {
        setOfferBiometric(true);
      } else {
        markUnlocked();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRecover(e) {
    e.preventDefault();
    setError(null);
    if (!recoverUsername.trim()) return setError("Enter your login ID.");
    if (!recoverCode.trim()) return setError("Enter your recovery code.");
    if (recoverNewPassword.length < 4) return setError("New password must be at least 4 characters.");
    if (recoverNewPassword !== recoverConfirmPassword) return setError("Passwords don't match.");

    setBusy(true);
    try {
      const result = await authApi.recoverPassword({
        username: recoverUsername.trim(),
        recoveryCode: recoverCode.trim(),
        newPassword: recoverNewPassword,
      });
      setRecoverUsername("");
      setRecoverCode("");
      setRecoverNewPassword("");
      setRecoverConfirmPassword("");
      setRecoveryCode(result.recoveryCode);
      setShowRecoveryCode(true);
      setAfterRecoveryCode("unlock");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitClaim(e) {
    e.preventDefault();
    setError(null);
    if (!inviteCode.trim()) return setError("Enter your invite code.");
    if (
      claimNeedsProfile &&
      (!form.name.trim() || !form.dob || !form.gender || !form.heightCm || !form.weightKg || !form.nationality)
    ) {
      return setError("All fields are required.");
    }

    setBusy(true);
    try {
      await inviteApi.claim({
        code: inviteCode.trim(),
        profile: claimNeedsProfile
          ? {
              name: form.name.trim(),
              dob: form.dob,
              gender: form.gender,
              heightCm: Number(form.heightCm),
              weightKg: Number(form.weightKg),
              nationality: form.nationality,
              goalWeightKg: null,
              activityLevel: "sedentary",
              conditions: [],
            }
          : undefined,
      });
      sessionStorage.setItem(LANDING_TAB_KEY, "coach");
      markUnlocked();
    } catch (err) {
      // First attempt is just the code, in case this is a *returning*
      // partner (their code alone is enough) — only ask for profile details
      // once the server confirms this code hasn't been claimed yet.
      if (!claimNeedsProfile && /Registration requires/.test(err.message)) {
        setClaimNeedsProfile(true);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function enableBiometricNow() {
    setBusy(true);
    setError(null);
    try {
      const options = await authApi.getRegistrationOptions();
      const response = await startRegistration({ optionsJSON: options });
      await authApi.verifyRegistration(response);
      markUnlocked();
    } catch (err) {
      setError(
        err.name === "InvalidStateError"
          ? "That's already registered."
          : "Couldn't set up biometric sign-in — you can try again later from the Profile tab."
      );
      markUnlocked(); // account is already created; don't block entry over a failed biometric add-on
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authApi.verifyPassword(loginUsername, loginPassword);
      markUnlocked();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setBusy(true);
    try {
      const options = await authApi.getAuthenticationOptions();
      const response = await startAuthentication({ optionsJSON: options });
      await authApi.verifyAuthentication(response);
      markUnlocked();
    } catch {
      setError("Biometric sign-in failed — use your login ID and password instead.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (unlocked) return children;

  if (showRecoveryCode) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto", padding: "0 16px" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Save your recovery code</h2>
          <p className="muted">
            If you ever forget your password, this code is the only way back into your account
            without wiping your login and starting over. Write it down or save it somewhere safe —
            it won't be shown again after you continue.
          </p>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "1.3rem",
              fontWeight: 700,
              letterSpacing: 2,
              textAlign: "center",
              padding: "14px 10px",
              background: "var(--page)",
              border: "1px solid var(--gridline)",
              borderRadius: 8,
              margin: "12px 0",
            }}
          >
            {recoveryCode}
          </div>
          <button className="primary" style={{ width: "100%" }} onClick={continueAfterRecoveryCode}>
            I've saved it — continue
          </button>
        </div>
      </div>
    );
  }

  // Forgot-password page — needs the recovery code from registration (or a
  // previous recovery) since the password itself can't be recovered, only reset.
  if (view === "recover") {
    return (
      <div style={{ maxWidth: 380, margin: "80px auto", padding: "0 16px" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Reset your password</h2>
          <p className="muted">Enter your login ID and the recovery code you saved at registration.</p>
          <form onSubmit={submitRecover}>
            <div className="field">
              <label>Login ID</label>
              <input value={recoverUsername} onChange={(e) => setRecoverUsername(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Recovery code</label>
              <input
                value={recoverCode}
                onChange={(e) => setRecoverCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                style={{ textTransform: "uppercase", fontFamily: "monospace" }}
              />
            </div>
            <div className="field">
              <label>New password</label>
              <input type="password" value={recoverNewPassword} onChange={(e) => setRecoverNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" value={recoverConfirmPassword} onChange={(e) => setRecoverConfirmPassword(e.target.value)} />
            </div>
            {error && <div className="error-banner">{error}</div>}
            <button className="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Resetting..." : "Reset password"}
            </button>
          </form>
          <button type="button" className="secondary" style={{ width: "100%", marginTop: 12 }} onClick={goToLogin} disabled={busy}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // Reached via a ?invite=CODE link — no username/password, ever. The code
  // itself is this account's permanent login, both for the first claim and
  // every time after.
  if (view === "claim") {
    return (
      <div style={{ maxWidth: 420, margin: "24px auto", padding: "0 16px" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>You've been invited</h2>
          <p className="muted">
            {claimNeedsProfile
              ? "First time here — a quick profile so your plan can be personalized. This invite code is your login from now on, no separate password."
              : "Confirm your invite code to continue."}
          </p>

          <form onSubmit={submitClaim}>
            <div className="field">
              <label>Invite code</label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="XXXX-XXXX"
                style={{ textTransform: "uppercase", fontFamily: "monospace" }}
                autoFocus
                required
              />
            </div>

            {claimNeedsProfile && (
              <>
                <div className="field">
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
                </div>
                <div className="row">
                  <div className="field">
                    <label>Date of birth *</label>
                    <input type="date" max={TODAY} value={form.dob} onChange={(e) => update("dob", e.target.value)} required />
                  </div>
                  <div className="field">
                    <label>Gender *</label>
                    <select value={form.gender} onChange={(e) => update("gender", e.target.value)} required>
                      <option value="" disabled>Select...</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Height (cm) *</label>
                    <input type="number" min="1" value={form.heightCm} onChange={(e) => update("heightCm", e.target.value)} required />
                  </div>
                  <div className="field">
                    <label>Weight (kg) *</label>
                    <input type="number" min="1" value={form.weightKg} onChange={(e) => update("weightKg", e.target.value)} required />
                  </div>
                </div>
                <div className="field">
                  <label>Nationality *</label>
                  <select value={form.nationality} onChange={(e) => update("nationality", e.target.value)} required>
                    <option value="" disabled>Select...</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && <div className="error-banner">{error}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Continuing..." : "Continue"}
              </button>
              <button type="button" className="secondary" onClick={goToLogin} disabled={busy}>
                Not you? Log in instead
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step 2/3: registration page.
  if (view === "register") {
    return (
      <div style={{ maxWidth: 420, margin: "24px auto", padding: "0 16px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
          <HeroIllustration size={140} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Register</h2>
          <p className="muted">
            Your info personalizes every recommendation, and your login keeps it private on this
            device.
          </p>

          {!offerBiometric ? (
            <form onSubmit={submitRegister}>
              <div className="field">
                <label>Name *</label>
                <input value={form.name} onChange={(e) => update("name", e.target.value)} autoFocus required />
              </div>
              <div className="row">
                <div className="field">
                  <label>Date of birth *</label>
                  <input type="date" max={TODAY} value={form.dob} onChange={(e) => update("dob", e.target.value)} required />
                </div>
                <div className="field">
                  <label>Gender *</label>
                  <select value={form.gender} onChange={(e) => update("gender", e.target.value)} required>
                    <option value="" disabled>Select...</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Height (cm) *</label>
                  <input type="number" min="1" value={form.heightCm} onChange={(e) => update("heightCm", e.target.value)} required />
                </div>
                <div className="field">
                  <label>Weight (kg) *</label>
                  <input type="number" min="1" value={form.weightKg} onChange={(e) => update("weightKg", e.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label>Nationality *</label>
                <select value={form.nationality} onChange={(e) => update("nationality", e.target.value)} required>
                  <option value="" disabled>Select...</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Login ID *</label>
                <input value={form.username} onChange={(e) => update("username", e.target.value)} required />
              </div>
              <div className="row">
                <div className="field">
                  <label>Password *</label>
                  <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
                </div>
                <div className="field">
                  <label>Confirm password *</label>
                  <input type="password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} required />
                </div>
              </div>
              {error && <div className="error-banner">{error}</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Creating account..." : "Register"}
                </button>
                <button type="button" className="secondary" onClick={goToLogin} disabled={busy}>
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            <>
              <p>Account created. Want faster sign-in with Face ID / fingerprint / Windows Hello?</p>
              {error && <div className="error-banner">{error}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" onClick={enableBiometricNow} disabled={busy}>
                  {busy ? "Setting up..." : "Enable biometric sign-in"}
                </button>
                <button className="secondary" onClick={markUnlocked}>Not now</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Step 1: login page — just ID and password, with Register now below.
  return (
    <div style={{ maxWidth: 380, margin: "48px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
        <HeroIllustration size={160} />
      </div>
      <p style={{ textAlign: "center", fontWeight: 700, fontSize: "1.15rem", margin: "0 0 18px", color: "var(--text-primary)" }}>
        Healthy Weight Coach
      </p>
      <div className="card">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={20} strokeWidth={2.25} /> Log in
        </h2>

        {authStatus?.biometricRegistered && biometricAvailable && (
          <button className="primary" style={{ width: "100%", marginBottom: 12 }} onClick={handleBiometricLogin} disabled={busy}>
            Use Face ID / Fingerprint
          </button>
        )}

        <form onSubmit={submitLogin}>
          <div className="field">
            <label>Login ID</label>
            <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary" type="submit" disabled={busy || !loginUsername || !loginPassword} style={{ width: "100%" }}>
            {busy ? "Checking..." : "Log in"}
          </button>
        </form>

        {authStatus?.enabled && (
          <button
            type="button"
            onClick={goToRecover}
            style={{
              background: "none", border: "none", color: "var(--series-1)", cursor: "pointer",
              fontSize: "0.82rem", marginTop: 10, display: "block",
            }}
          >
            Forgot password?
          </button>
        )}

        <button
          type="button"
          className="secondary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={goToRegister}
        >
          Register now
        </button>
      </div>
    </div>
  );
}
