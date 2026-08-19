export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = "healthy-weight-coach-backup";

// Fields that must never leave this device: a WebAuthn credential is bound
// to this specific device's secure enclave/authenticator and is dead weight
// (or actively confusing) anywhere else. Password hash and Google Fit tokens
// aren't device-bound, so those travel with the backup.
export function exportableStore(store) {
  const { security, ...rest } = store;
  return {
    ...rest,
    security: {
      passwordHash: security.passwordHash,
      passwordSalt: security.passwordSalt,
      webauthnCredential: null,
      webauthnUserID: null,
      currentChallenge: null,
    },
  };
}

export function buildBackupPayload(store) {
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: exportableStore(store),
  };
}

export function backupFilename(date = new Date()) {
  return `${BACKUP_FILENAME_PREFIX}-${date.toISOString().slice(0, 10)}.json`;
}

export function validateBackupPayload(body) {
  if (!body || typeof body !== "object" || !body.data || typeof body.data !== "object") {
    return "That doesn't look like a valid backup file.";
  }
  if (!("profile" in body.data) || !("foodLog" in body.data)) {
    return "That doesn't look like a Healthy Weight Coach backup file.";
  }
  return null;
}

// Replaces the store contents in place with imported data, preserving this
// device's own WebAuthn credential (never overwritten by — or leaked into —
// a backup file; see exportableStore above).
export function applyImportedData(s, importedData) {
  const currentWebauthn = s.security?.webauthnCredential ?? null;
  const currentWebauthnUserID = s.security?.webauthnUserID ?? null;

  for (const key of Object.keys(s)) delete s[key];
  Object.assign(s, importedData);

  s.security = {
    ...s.security,
    webauthnCredential: currentWebauthn,
    webauthnUserID: currentWebauthnUserID,
    currentChallenge: null,
  };
}
