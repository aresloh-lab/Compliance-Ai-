const BASE = "/api";
const AUTH_BASE = "/api/auth";

function fetchWithCredentials(input, init = {}) {
  return fetch(input, {
    credentials: "include",
    ...init,
  });
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const authApi = {
  getStatus: () => fetchWithCredentials(`${AUTH_BASE}/status`).then(handle),
  setPassword: (password, currentPassword, username) =>
    fetchWithCredentials(`${AUTH_BASE}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, currentPassword, username }),
    }).then(handle),
  verifyPassword: (username, password) =>
    fetchWithCredentials(`${AUTH_BASE}/verify-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(handle),
  disable: (password) =>
    fetchWithCredentials(`${AUTH_BASE}/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(handle),
  recoverPassword: ({ username, recoveryCode, newPassword }) =>
    fetchWithCredentials(`${AUTH_BASE}/recover-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, recoveryCode, newPassword }),
    }).then(handle),
  regenerateRecoveryCode: (password) =>
    fetchWithCredentials(`${AUTH_BASE}/recovery-code/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(handle),
  logout: () => fetchWithCredentials(`${AUTH_BASE}/logout`, { method: "POST" }).then(handle),
  removeBiometric: () => fetchWithCredentials(`${AUTH_BASE}/webauthn/remove`, { method: "POST" }).then(handle),
  getRegistrationOptions: () => fetchWithCredentials(`${AUTH_BASE}/webauthn/registration-options`).then(handle),
  verifyRegistration: (response) =>
    fetchWithCredentials(`${AUTH_BASE}/webauthn/registration-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    }).then(handle),
  getAuthenticationOptions: () => fetchWithCredentials(`${AUTH_BASE}/webauthn/authentication-options`).then(handle),
  verifyAuthentication: (response) =>
    fetchWithCredentials(`${AUTH_BASE}/webauthn/authentication-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    }).then(handle),
};

export const googleDriveApi = {
  getStatus: () => fetchWithCredentials(`${BASE}/google-drive/status`).then(handle),
  connect: () => {
    window.location.href = `${BASE}/google-drive/connect`;
  },
  backupNow: () => fetchWithCredentials(`${BASE}/google-drive/backup`, { method: "POST" }).then(handle),
  restorePreview: () => fetchWithCredentials(`${BASE}/google-drive/restore-preview`).then(handle),
  restore: () => fetchWithCredentials(`${BASE}/google-drive/restore`, { method: "POST" }).then(handle),
  disconnect: () => fetchWithCredentials(`${BASE}/google-drive/disconnect`, { method: "POST" }).then(handle),
};

export const companionApi = {
  getStatus: () => fetchWithCredentials(`${BASE}/companion/status`).then(handle),
  enable: (partnerLabel = "") =>
    fetchWithCredentials(`${BASE}/companion/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerLabel }),
    }).then(handle),
  regenerate: () => fetchWithCredentials(`${BASE}/companion/regenerate`, { method: "POST" }).then(handle),
  disable: () => fetchWithCredentials(`${BASE}/companion/disable`, { method: "POST" }).then(handle),
  setLabel: (partnerLabel) =>
    fetchWithCredentials(`${BASE}/companion/label`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerLabel }),
    }).then(handle),
};

export const aiApi = {
  getStatus: () => fetchWithCredentials(`${BASE}/ai/status`).then(handle),
  setProvider: (provider) =>
    fetchWithCredentials(`${BASE}/ai/provider`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    }).then(handle),
};

export const backupApi = {
  exportUrl: `${BASE}/backup/export`,
  importBackup: (parsedJson) =>
    fetchWithCredentials(`${BASE}/backup/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedJson),
    }).then(handle),
};

export const api = {
  getHealth: () => fetchWithCredentials(`${BASE}/health`).then(handle),
  getProfile: () => fetchWithCredentials(`${BASE}/profile`).then(handle),
  saveProfile: (profile) =>
    fetchWithCredentials(`${BASE}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }).then(handle),

  getChatHistory: () => fetchWithCredentials(`${BASE}/chat`).then(handle),
  sendChatMessage: (message) =>
    fetchWithCredentials(`${BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }).then(handle),
  clearChat: () => fetchWithCredentials(`${BASE}/chat`, { method: "DELETE" }).then(handle),

  foodCheck: ({ description, photo }) => {
    const form = new FormData();
    if (description) form.append("description", description);
    if (photo) form.append("photo", photo);
    return fetchWithCredentials(`${BASE}/food-check`, { method: "POST", body: form }).then(handle);
  },

  analyzeMeal: ({ description, photo }) => {
    const form = new FormData();
    if (description) form.append("description", description);
    if (photo) form.append("photo", photo);
    return fetchWithCredentials(`${BASE}/meal-analysis`, { method: "POST", body: form }).then(handle);
  },

  analyzeFamilyMeal: ({ dishesText, partySize, photos = [] }) => {
    const form = new FormData();
    if (dishesText) form.append("dishesText", dishesText);
    form.append("partySize", String(partySize));
    for (const photo of photos) form.append("photos", photo);
    return fetchWithCredentials(`${BASE}/family-meal`, { method: "POST", body: form }).then(handle);
  },

  getPlan: () => fetchWithCredentials(`${BASE}/plan`).then(handle),
  generatePlan: () => fetchWithCredentials(`${BASE}/plan`, { method: "POST" }).then(handle),

  analyzeHealthReport: (file) => {
    const form = new FormData();
    form.append("report", file);
    return fetchWithCredentials(`${BASE}/health-report`, { method: "POST", body: form }).then(handle);
  },

  getFoodLog: () => fetchWithCredentials(`${BASE}/food-log`).then(handle),
  addFoodLog: (entry) =>
    fetchWithCredentials(`${BASE}/food-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then(handle),
  deleteFoodLog: (id) => fetchWithCredentials(`${BASE}/food-log/${id}`, { method: "DELETE" }).then(handle),

  getWaterSettings: () => fetchWithCredentials(`${BASE}/water/settings`).then(handle),
  saveWaterSettings: (settings) =>
    fetchWithCredentials(`${BASE}/water/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then(handle),
  getWaterLog: () => fetchWithCredentials(`${BASE}/water`).then(handle),
  logWater: (cups = 1) =>
    fetchWithCredentials(`${BASE}/water`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cups }),
    }).then(handle),

  getJunkFoodPlan: () => fetchWithCredentials(`${BASE}/junk-food-plan`).then(handle),
  generateJunkFoodPlan: (baselinePerWeek) =>
    fetchWithCredentials(`${BASE}/junk-food-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselinePerWeek }),
    }).then(handle),

  getActivityLog: () => fetchWithCredentials(`${BASE}/activity`).then(handle),
  logActivity: (entry) =>
    fetchWithCredentials(`${BASE}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then(handle),
  deleteActivity: (id) => fetchWithCredentials(`${BASE}/activity/${id}`, { method: "DELETE" }).then(handle),

  getStepGoal: () => fetchWithCredentials(`${BASE}/steps/goal`).then(handle),
  setStepGoal: (goal) =>
    fetchWithCredentials(`${BASE}/steps/goal`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
    }).then(handle),
  getStepLog: () => fetchWithCredentials(`${BASE}/steps`).then(handle),
  logSteps: (steps) =>
    fetchWithCredentials(`${BASE}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    }).then(handle),

  getSupplements: () => fetchWithCredentials(`${BASE}/supplements`).then(handle),
  addSupplement: (entry) =>
    fetchWithCredentials(`${BASE}/supplements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then(handle),
  deleteSupplement: (id) => fetchWithCredentials(`${BASE}/supplements/${id}`, { method: "DELETE" }).then(handle),

  getRewards: () => fetchWithCredentials(`${BASE}/rewards`).then(handle),
  redeemReward: () => fetchWithCredentials(`${BASE}/rewards/redeem`, { method: "POST" }).then(handle),

  getGoogleFitStatus: () => fetchWithCredentials(`${BASE}/google-fit/status`).then(handle),
  connectGoogleFit: () => {
    window.location.href = `${BASE}/google-fit/connect`;
  },
  syncGoogleFit: () => fetchWithCredentials(`${BASE}/google-fit/sync`, { method: "POST" }).then(handle),
  disconnectGoogleFit: () => fetchWithCredentials(`${BASE}/google-fit/disconnect`, { method: "POST" }).then(handle),

  activityCheckin: (photo) => {
    const form = new FormData();
    form.append("photo", photo);
    return fetchWithCredentials(`${BASE}/activity-checkin`, { method: "POST", body: form }).then(handle);
  },

  getPlateauStatus: () => fetchWithCredentials(`${BASE}/plateau`).then(handle),
  getAlternativePlan: () => fetchWithCredentials(`${BASE}/plateau/plan`).then(handle),
  generateAlternativePlan: () => fetchWithCredentials(`${BASE}/plateau/plan`, { method: "POST" }).then(handle),

  getWeightLossProgram: () => fetchWithCredentials(`${BASE}/weight-loss-program`).then(handle),
  generateWeightLossProgram: ({ difficulty, targetDays }) =>
    fetchWithCredentials(`${BASE}/weight-loss-program`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ difficulty, targetDays }),
    }).then(handle),

  getRepSet: (exerciseType) =>
    fetchWithCredentials(`${BASE}/rep-counter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseType }),
    }).then(handle),

  getTabataMusic: () => fetchWithCredentials(`${BASE}/tabata-music`, { method: "POST" }).then(handle),

  getProgress: () => fetchWithCredentials(`${BASE}/progress`).then(handle),
  addProgress: (entry) =>
    fetchWithCredentials(`${BASE}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then(handle),
  deleteProgress: (id) => fetchWithCredentials(`${BASE}/progress/${id}`, { method: "DELETE" }).then(handle),
};
