import { Router } from "express";
import { randomBytes } from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { getStore, updateStore } from "../db.js";
import { hashPassword, verifyPassword, webauthnRPConfig, generateRecoveryCode } from "../auth.js";
import {
  createSession,
  clearAllSessions,
  setSessionCookie,
  clearSessionCookie,
  requireSession,
  endCurrentSession,
} from "../session.js";

const router = Router();

router.get("/status", async (req, res) => {
  const store = await getStore();
  const sec = store.security;
  res.json({
    enabled: Boolean(sec.passwordHash),
    username: sec.username ?? null,
    biometricRegistered: Boolean(sec.webauthnCredential),
    biometricSupportable: true, // real support is a client-side capability check
    hasRecoveryCode: Boolean(sec.recoveryCodeHash),
  });
});

// Sets the password if none exists yet (registration — requires a username
// too, set once and not changeable here); requires currentPassword to change
// an existing one. This is the one required step before biometric can be added.
router.post("/password", async (req, res) => {
  const { password, currentPassword, username } = req.body;
  if (!password || typeof password !== "string" || password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters." });
  }
  const store = await getStore();
  const isFirstTimeSetup = !store.security.passwordHash;
  if (isFirstTimeSetup) {
    if (!username || typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "Username is required." });
    }
  } else {
    const ok = await verifyPassword(currentPassword || "", store.security.passwordHash, store.security.passwordSalt);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect." });
  }
  const { hash, salt } = await hashPassword(password);
  // A recovery code is only issued at registration, when there's nothing yet
  // to lose by generating one — a plain password change leaves the existing
  // code (and its ability to recover the account) untouched.
  const recoveryCode = isFirstTimeSetup ? generateRecoveryCode() : null;
  const recovery = recoveryCode ? await hashPassword(recoveryCode) : null;
  const updated = await updateStore((s) => {
    s.security.passwordHash = hash;
    s.security.passwordSalt = salt;
    if (isFirstTimeSetup) {
      s.security.username = username.trim();
      s.security.recoveryCodeHash = recovery.hash;
      s.security.recoveryCodeSalt = recovery.salt;
    }
  });
  setSessionCookie(res, createSession());
  res.status(201).json({ ok: true, username: updated.security.username, recoveryCode });
});

// Resets the password using the one-time recovery code from registration —
// the only way back in if the password itself is forgotten, short of wiping
// the account. The code is single-use: a successful recovery immediately
// rotates in a new one, returned here so it can be shown and saved again.
router.post("/recover-password", async (req, res) => {
  const { username, recoveryCode, newPassword } = req.body;
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
    return res.status(400).json({ error: "New password must be at least 4 characters." });
  }
  const store = await getStore();
  if (!store.security.recoveryCodeHash) {
    return res.status(400).json({ error: "No recovery code was ever set up for this account." });
  }
  if (store.security.username && (username ?? "").trim().toLowerCase() !== store.security.username.toLowerCase()) {
    return res.status(401).json({ error: "Incorrect username or recovery code." });
  }
  const ok = await verifyPassword(
    (recoveryCode || "").trim().toUpperCase(),
    store.security.recoveryCodeHash,
    store.security.recoveryCodeSalt
  );
  if (!ok) return res.status(401).json({ error: "Incorrect username or recovery code." });

  const { hash, salt } = await hashPassword(newPassword);
  const newRecoveryCode = generateRecoveryCode();
  const recovery = await hashPassword(newRecoveryCode);
  await updateStore((s) => {
    s.security.passwordHash = hash;
    s.security.passwordSalt = salt;
    s.security.recoveryCodeHash = recovery.hash;
    s.security.recoveryCodeSalt = recovery.salt;
  });
  clearAllSessions();
  setSessionCookie(res, createSession());
  res.json({ ok: true, recoveryCode: newRecoveryCode });
});

// Lets a logged-in user get a fresh recovery code (e.g. they lost the one
// from registration) without changing their password — still requires the
// current password so a hijacked-but-unlocked session can't silently mint
// itself a standing recovery credential.
router.post("/recovery-code/regenerate", requireSession, async (req, res) => {
  const { password } = req.body;
  const store = await getStore();
  const ok = await verifyPassword(password || "", store.security.passwordHash, store.security.passwordSalt);
  if (!ok) return res.status(401).json({ error: "Incorrect password." });

  const recoveryCode = generateRecoveryCode();
  const recovery = await hashPassword(recoveryCode);
  await updateStore((s) => {
    s.security.recoveryCodeHash = recovery.hash;
    s.security.recoveryCodeSalt = recovery.salt;
  });
  res.json({ ok: true, recoveryCode });
});

router.post("/verify-password", async (req, res) => {
  const { username, password } = req.body;
  const store = await getStore();
  if (!store.security.passwordHash) {
    return res.status(400).json({ error: 'No account yet — tap "Register now" to create one.' });
  }
  if (store.security.username && (username ?? "").trim().toLowerCase() !== store.security.username.toLowerCase()) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  const ok = await verifyPassword(password || "", store.security.passwordHash, store.security.passwordSalt);
  if (!ok) return res.status(401).json({ error: "Incorrect username or password." });
  setSessionCookie(res, createSession());
  res.json({ ok: true });
});

// "Lock now" — ends this session only, without touching the account itself
// (unlike /disable below, which wipes the credentials entirely).
router.post("/logout", (req, res) => {
  endCurrentSession(req, res);
  res.status(204).end();
});

// Clears the account's login credentials (username, password, biometric) so
// registration can be redone from scratch — profile data is untouched.
// Requires the current password so a locked-out session can't wave this away.
router.post("/disable", async (req, res) => {
  const { password } = req.body;
  const store = await getStore();
  if (store.security.passwordHash) {
    const ok = await verifyPassword(password || "", store.security.passwordHash, store.security.passwordSalt);
    if (!ok) return res.status(401).json({ error: "Incorrect password." });
  }
  await updateStore((s) => {
    s.security = {
      username: null,
      passwordHash: null,
      passwordSalt: null,
      recoveryCodeHash: null,
      recoveryCodeSalt: null,
      webauthnCredential: null,
      webauthnUserID: null,
      currentChallenge: null,
    };
  });
  clearAllSessions();
  clearSessionCookie(res);
  res.status(204).end();
});

router.post("/webauthn/remove", requireSession, async (req, res) => {
  await updateStore((s) => {
    s.security.webauthnCredential = null;
  });
  res.status(204).end();
});

// Requires an existing session — enrolling a new biometric credential must
// only be possible for someone already logged in with the password,
// otherwise anyone could add their own fingerprint as a bypass.
router.get("/webauthn/registration-options", requireSession, async (req, res) => {
  const store = await getStore();
  if (!store.security.passwordHash) {
    return res.status(400).json({ error: "Set a password before enabling Face ID / fingerprint unlock." });
  }
  const { rpID, rpName } = webauthnRPConfig();

  let userID = store.security.webauthnUserID;
  if (!userID) {
    userID = isoBase64URL.fromBuffer(randomBytes(16));
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: "You",
    userID: isoBase64URL.toBuffer(userID),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required", // this is what forces the actual biometric/PIN prompt
      authenticatorAttachment: "platform", // built-in sensor (Face ID/Touch ID/Windows Hello/Android fingerprint), not a security key
    },
    excludeCredentials: store.security.webauthnCredential
      ? [{ id: store.security.webauthnCredential.id, transports: store.security.webauthnCredential.transports }]
      : [],
  });

  await updateStore((s) => {
    s.security.webauthnUserID = userID;
    s.security.currentChallenge = options.challenge;
  });
  res.json(options);
});

router.post("/webauthn/registration-verify", requireSession, async (req, res) => {
  const store = await getStore();
  const { rpID, origin } = webauthnRPConfig();
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: store.security.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Could not verify that registration." });
    }
    const { credential } = verification.registrationInfo;
    await updateStore((s) => {
      s.security.webauthnCredential = {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
      };
      s.security.currentChallenge = null;
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

router.get("/webauthn/authentication-options", async (req, res) => {
  const store = await getStore();
  const cred = store.security.webauthnCredential;
  if (!cred) return res.status(400).json({ error: "No Face ID / fingerprint credential registered." });
  const { rpID } = webauthnRPConfig();

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{ id: cred.id, transports: cred.transports }],
    userVerification: "required",
  });

  await updateStore((s) => {
    s.security.currentChallenge = options.challenge;
  });
  res.json(options);
});

router.post("/webauthn/authentication-verify", async (req, res) => {
  const store = await getStore();
  const cred = store.security.webauthnCredential;
  if (!cred) return res.status(400).json({ error: "No Face ID / fingerprint credential registered." });
  const { rpID, origin } = webauthnRPConfig();

  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: store.security.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
      },
    });
    if (!verification.verified) {
      return res.status(401).json({ error: "Verification failed." });
    }
    await updateStore((s) => {
      s.security.webauthnCredential.counter = verification.authenticationInfo.newCounter;
      s.security.currentChallenge = null;
    });
    setSessionCookie(res, createSession());
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
