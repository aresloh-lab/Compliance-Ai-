import React, { useEffect, useState } from "react";
import { COUNTRIES } from "../countries.js";
import { getRaceOptionsForCountry } from "../raceOptions.js";

const CONDITIONS = [
  { id: "hypertension", label: "High blood pressure" },
  { id: "highCholesterol", label: "High cholesterol" },
  { id: "highBloodSugar", label: "High blood sugar" },
  { id: "highUricAcid", label: "High uric acid / gout" },
];

// Asked directly, never inferred from name/nationality/anything else -- see
// the comment on buildProfileSummary in backend/src/prompts.js for why.
const DIETARY_PREFERENCES = [
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "noPork", label: "No pork" },
  { id: "noBeef", label: "No beef" },
  { id: "noAlcohol", label: "No alcohol" },
];

const EMPTY = {
  name: "",
  dob: "",
  gender: "",
  heightCm: "",
  weightKg: "",
  nationality: "",
  race: "",
  goalWeightKg: "",
  activityLevel: "sedentary",
  conditions: [],
  dietaryPreferences: [],
  dietaryPreferencesOther: "",
};

const TODAY = new Date().toISOString().slice(0, 10);

export default function Onboarding({ profile, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (profile) setForm({ ...EMPTY, ...profile });
  }, [profile]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  function toggleCondition(id) {
    setForm((f) => {
      const has = f.conditions.includes(id);
      return {
        ...f,
        conditions: has ? f.conditions.filter((c) => c !== id) : [...f.conditions, id],
      };
    });
    setSaved(false);
  }

  function toggleDietaryPreference(id) {
    setForm((f) => {
      const has = f.dietaryPreferences.includes(id);
      return {
        ...f,
        dietaryPreferences: has ? f.dietaryPreferences.filter((c) => c !== id) : [...f.dietaryPreferences, id],
      };
    });
    setSaved(false);
  }

  const isComplete =
    form.name.trim() && form.dob && form.gender && form.heightCm && form.weightKg && form.nationality.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!isComplete) {
      setError("Name, date of birth, gender, height, weight, and nationality are required to register.");
      return;
    }
    setSaving(true);
    const numeric = {
      ...form,
      name: form.name.trim(),
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      goalWeightKg: form.goalWeightKg ? Number(form.goalWeightKg) : null,
    };
    try {
      await onSave(numeric);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{profile ? "Your profile" : "Register to get started"}</h2>
      <p className="muted">
        Name, date of birth, gender, height, and weight are required so the coach can tailor
        calorie targets, portions, and advice to you specifically — including physiological
        factors that genuinely differ by age and gender.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label>Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />
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
          <label>Current weight (kg) *</label>
          <input type="number" min="1" value={form.weightKg} onChange={(e) => update("weightKg", e.target.value)} required />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Nationality *</label>
          <input
            list="profile-nationality-options"
            value={form.nationality}
            onChange={(e) => update("nationality", e.target.value)}
            placeholder="Type to search or select..."
            required
          />
          <datalist id="profile-nationality-options">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label>Race/ethnicity (optional)</label>
          <input
            list="profile-race-options"
            value={form.race}
            onChange={(e) => update("race", e.target.value)}
            placeholder="Prefer not to say"
          />
          <datalist id="profile-race-options">
            {getRaceOptionsForCountry(form.nationality).map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Goal weight (kg)</label>
          <input type="number" min="1" value={form.goalWeightKg} onChange={(e) => update("goalWeightKg", e.target.value)} />
        </div>
        <div className="field">
          <label>Activity level</label>
          <select value={form.activityLevel} onChange={(e) => update("activityLevel", e.target.value)}>
            <option value="sedentary">Sedentary (little to no exercise)</option>
            <option value="light">Light (1-2 days/week)</option>
            <option value="moderate">Moderate (3-4 days/week)</option>
            <option value="active">Active (5+ days/week)</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Health conditions (affects diet guidance)</label>
        <div className="checkbox-grid">
          {CONDITIONS.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={form.conditions.includes(c.id)}
                onChange={() => toggleCondition(c.id)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Dietary preferences/restrictions (optional — the coach always honors these)</label>
        <div className="checkbox-grid">
          {DIETARY_PREFERENCES.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={form.dietaryPreferences.includes(d.id)}
                onChange={() => toggleDietaryPreference(d.id)}
              />
              {d.label}
            </label>
          ))}
        </div>
        <input
          type="text"
          placeholder="Anything else? e.g. no shellfish, Jain diet..."
          value={form.dietaryPreferencesOther}
          onChange={(e) => update("dietaryPreferencesOther", e.target.value)}
          style={{ marginTop: 8 }}
        />
      </div>

      <button className="primary" type="submit" disabled={saving || !isComplete}>
        {saving ? "Saving..." : profile ? "Save profile" : "Register"}
      </button>
      {saved && <span className="muted" style={{ marginLeft: 10 }}>Saved.</span>}
    </form>
  );
}
