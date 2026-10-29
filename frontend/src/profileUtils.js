// Shared between AuthGate.jsx (decides whether registration is needed) and
// App.jsx (decides whether to show the registration-required banner) so the
// two checks can't drift apart.
export function isProfileComplete(profile) {
  return Boolean(
    profile && profile.name && profile.dob && profile.gender && profile.heightCm && profile.weightKg && profile.nationality
  );
}
