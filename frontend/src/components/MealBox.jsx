import React, { useRef, useState } from "react";
import { Camera, Send, FileText } from "lucide-react";
import { api } from "../api.js";

const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
];

function inferMealType() {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  return "dinner";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// One box for logging food, in the spirit of a search bar: type a
// description, attach a photo, or both, and submit. What happens next is
// inferred rather than picked from separate cards —
//   - just a photo, no text            -> quick snap, analyzed and auto-logged
//   - any text (with or without photo) -> full breakdown, reviewed before logging
//   - "family / shared meal" checked   -> dishes are split into a portion for you
// This replaces the old QuickSnapBox + MealAnalyzer + FamilyMealAnalyzer cards.
export default function MealBox() {
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [familyMode, setFamilyMode] = useState(false);
  const [partySize, setPartySize] = useState(4);
  const [mealType, setMealType] = useState(inferMealType());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultKind, setResultKind] = useState(null); // "quick" | "detailed" | "family"
  const [result, setResult] = useState(null);
  const [loggedEntry, setLoggedEntry] = useState(null); // quick-snap entry, for undo
  const [logged, setLogged] = useState(false);
  const [logging, setLogging] = useState(false);
  const [eatingPace, setEatingPace] = useState(null);
  const [fullnessLevel, setFullnessLevel] = useState(null);

  const inputRef = useRef(null);

  function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    const limited = familyMode ? files.slice(0, 6) : files.slice(0, 1);
    setPhotos(limited);
    setPreviews(limited.map((f) => (f.type?.startsWith("image/") ? URL.createObjectURL(f) : null)));
  }

  function toggleFamilyMode(next) {
    setFamilyMode(next);
    setPhotos([]);
    setPreviews([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function resetAfterQuickUndo() {
    setDescription("");
    setPhotos([]);
    setPreviews([]);
    setResultKind(null);
    setResult(null);
    setLoggedEntry(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!description.trim() && photos.length === 0) {
      setError(familyMode ? "List the dishes, or add a photo of the table." : "Add a description or a photo of your meal.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    setResultKind(null);
    setLogged(false);
    setLoggedEntry(null);
    setEatingPace(null);
    setFullnessLevel(null);

    try {
      if (familyMode) {
        const analysis = await api.analyzeFamilyMeal({ dishesText: description.trim(), partySize, photos });
        setResult(analysis);
        setResultKind("family");
      } else if (!description.trim() && photos.length === 1) {
        const [analysis, photoDataUrl] = await Promise.all([
          api.analyzeMeal({ photo: photos[0] }),
          fileToDataUrl(photos[0]),
        ]);
        const guessedType = inferMealType();
        const summary = analysis.items?.map((i) => `${i.name} (${i.portion})`).join(", ") || "Snapped meal";
        const entry = await api.addFoodLog({
          mealType: guessedType,
          summary,
          calories: analysis.totalCalories ?? null,
          macroBalance: analysis.macroBalance ?? null,
          photoDataUrl,
          isJunkFood: Boolean(analysis.containsJunkFood),
          junkFoodItems: analysis.junkFoodItems ?? [],
        });
        setMealType(guessedType);
        setResult({ ...analysis, mealType: guessedType });
        setResultKind("quick");
        setLoggedEntry(entry);
      } else {
        const analysis = await api.analyzeMeal({ description: description.trim(), photo: photos[0] || null });
        setResult(analysis);
        setResultKind("detailed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function undoQuick() {
    if (!loggedEntry) return;
    await api.deleteFoodLog(loggedEntry.id);
    resetAfterQuickUndo();
  }

  async function logDetailed() {
    if (!result) return;
    setLogging(true);
    setError(null);
    try {
      const photoDataUrl = photos[0]?.type?.startsWith("image/") ? await fileToDataUrl(photos[0]) : null;
      const summary =
        description.trim() ||
        result.items?.map((i) => `${i.name} (${i.portion})`).join(", ") ||
        "Logged meal";
      await api.addFoodLog({
        mealType,
        summary,
        calories: result.totalCalories ?? null,
        macroBalance: result.macroBalance ?? null,
        photoDataUrl,
        isJunkFood: Boolean(result.containsJunkFood),
        junkFoodItems: result.junkFoodItems ?? [],
        portionAssessment: result.portionAssessment ?? null,
        eatingPace,
        fullnessLevel,
      });
      setLogged(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLogging(false);
    }
  }

  async function logFamily() {
    if (!result) return;
    setLogging(true);
    setError(null);
    try {
      const summary = `Shared family dinner (${result.partySize} people): ${result.dishes
        ?.map((d) => `${d.name} — your portion: ${d.recommendedPortionForUser}`)
        .join("; ")}. ${result.riceOrCarbRecommendation}`;
      await api.addFoodLog({ mealType: "dinner", summary, calories: result.estimatedTotalCalories ?? null });
      setLogged(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="card">
      <h2>Log a meal</h2>
      <p className="muted">
        {familyMode
          ? "List what's on the table (or snap it) and get a fair portion just for you."
          : "Snap a photo to auto-log it, or describe your meal for a full breakdown first."}
      </p>

      <div className="meal-search">
        <button
          type="button"
          className="meal-search-icon"
          onClick={() => inputRef.current?.click()}
          title="Attach photo"
          aria-label="Attach photo"
        >
          <Camera size={18} strokeWidth={2.25} />
        </button>
        <input
          className="meal-search-input"
          type="text"
          placeholder={
            familyMode
              ? "e.g. steamed fish, kailan, sweet & sour pork..."
              : "Describe your meal, or just attach a photo..."
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.xlsx,.csv"
          capture="environment"
          multiple={familyMode}
          style={{ display: "none" }}
          onChange={handleFiles}
        />
        <button type="button" className="meal-search-submit" onClick={submit} disabled={loading}>
          <Send size={16} strokeWidth={2.25} color="#fff" />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer" }}>
          <input type="checkbox" checked={familyMode} onChange={(e) => toggleFamilyMode(e.target.checked)} />
          Family / shared meal
        </label>
        {familyMode ? (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
            People sharing
            <input
              type="number"
              min="1"
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              style={{ width: 56 }}
            />
          </label>
        ) : (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
            Meal type
            <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
              {MEAL_TYPES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {previews.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {previews.map((src, i) =>
            src ? (
              <img key={i} src={src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
            ) : (
              <span key={i} className="tag normal" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <FileText size={12} strokeWidth={2.25} /> {photos[i]?.name}
              </span>
            )
          )}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {resultKind === "quick" && result && (
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {previews[0] && (
            <img src={previews[0]} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0 }}>
              <span className="tag normal">Auto-logged as {result.mealType}</span>
              {result.containsJunkFood && <span className="tag high" style={{ marginLeft: 6 }}>junk food</span>}
            </p>
            <p className="muted" style={{ margin: "4px 0" }}>
              {result.items?.map((i) => i.name).join(", ")} — ~{result.totalCalories} kcal
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" onClick={resetAfterQuickUndo}>Snap another</button>
              <button
                onClick={undoQuick}
                style={{ background: "none", border: "none", color: "var(--critical)", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {resultKind === "detailed" && result && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 6 }}>Estimated items</h3>
          <ul className="list-plain">
            {result.items?.map((item, i) => (
              <li key={i}>
                {item.name} — {item.portion} ({item.calories} kcal)
              </li>
            ))}
          </ul>
          <p style={{ fontWeight: 600 }}>Total: ~{result.totalCalories} kcal</p>

          <h3 style={{ marginBottom: 6 }}>Plate balance</h3>
          <div className="macro-legend">
            <span><span className="dot" style={{ background: "var(--series-3)" }} />Vegetables {result.macroBalance?.vegetablesPct}%</span>
            <span><span className="dot" style={{ background: "var(--series-2)" }} />Protein {result.macroBalance?.proteinPct}%</span>
            <span><span className="dot" style={{ background: "var(--series-1)" }} />Carbs {result.macroBalance?.carbsPct}%</span>
          </div>
          <div className="macro-bar">
            <div className="seg-veg" style={{ width: `${result.macroBalance?.vegetablesPct || 0}%` }} />
            <div className="seg-protein" style={{ width: `${result.macroBalance?.proteinPct || 0}%` }} />
            <div className="seg-carbs" style={{ width: `${result.macroBalance?.carbsPct || 0}%` }} />
          </div>
          <p>{result.balanceAssessment}</p>

          {result.containsJunkFood && (
            <p>
              <span className="tag high">junk food / sugary drink</span>{" "}
              <span className="muted">{result.junkFoodItems?.join(", ")}</span>
            </p>
          )}

          {result.portionAssessment?.largerThanTypical && (
            <p>
              <span className="tag borderline">larger than a typical serving</span>{" "}
              <span className="muted">{result.portionAssessment.note}</span>
            </p>
          )}

          {result.conditionWarnings?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Condition warnings</h3>
              <ul className="list-plain">
                {result.conditionWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}

          {result.suggestions?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Suggestions</h3>
              <ul className="list-plain">
                {result.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {!logged && (
            <div style={{ marginTop: 14, padding: 10, background: "var(--page)", borderRadius: 8 }}>
              <p className="muted" style={{ margin: "0 0 6px" }}>
                Optional — how did this meal go? Helps spot patterns worth knowing about (totally skippable).
              </p>
              <div style={{ marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: "0.8rem", marginRight: 6 }}>Eating pace:</span>
                {[["quick", "Quick"], ["normal", "Normal"], ["slow", "Slow"]].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={eatingPace === id ? "primary" : "secondary"}
                    style={{ padding: "3px 10px", fontSize: "0.78rem", marginRight: 6 }}
                    onClick={() => setEatingPace(eatingPace === id ? null : id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <span className="muted" style={{ fontSize: "0.8rem", marginRight: 6 }}>Fullness:</span>
                {[
                  ["stopped_satisfied", "Stopped when satisfied"],
                  ["ate_until_full", "Ate until full"],
                  ["ate_past_full", "Ate past full"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={fullnessLevel === id ? "primary" : "secondary"}
                    style={{ padding: "3px 10px", fontSize: "0.78rem", marginRight: 6, marginTop: 4 }}
                    onClick={() => setFullnessLevel(fullnessLevel === id ? null : id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="secondary" style={{ marginTop: 12 }} onClick={logDetailed} disabled={logging || logged}>
            {logged ? "Saved to food diary" : logging ? "Saving..." : `Log as ${mealType}`}
          </button>
        </div>
      )}

      {resultKind === "family" && result && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 6 }}>Your portion per dish</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--gridline)" }}>
                <th style={{ padding: "6px 4px" }}>Dish</th>
                <th style={{ padding: "6px 4px" }}>Your portion</th>
                <th style={{ padding: "6px 4px" }}>~kcal</th>
              </tr>
            </thead>
            <tbody>
              {result.dishes?.map((d, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--gridline)" }}>
                  <td style={{ padding: "6px 4px" }}>
                    {d.name}
                    {d.note && <div className="muted">{d.note}</div>}
                  </td>
                  <td style={{ padding: "6px 4px" }}>{d.recommendedPortionForUser}</td>
                  <td style={{ padding: "6px 4px" }}>{d.estimatedCalories}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: 10 }}>
            <strong>Rice/carbs:</strong> {result.riceOrCarbRecommendation}
          </p>
          <p style={{ fontWeight: 600 }}>Estimated total for you: ~{result.estimatedTotalCalories} kcal</p>
          <p>{result.balanceAssessment}</p>

          {result.conditionWarnings?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Condition warnings</h3>
              <ul className="list-plain">
                {result.conditionWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}

          {result.overeatingTips?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Tips for the table</h3>
              <ul className="list-plain">
                {result.overeatingTips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          <button className="secondary" style={{ marginTop: 12 }} onClick={logFamily} disabled={logging || logged}>
            {logged ? "Saved to food diary" : logging ? "Saving..." : "Log this dinner"}
          </button>
        </div>
      )}
    </div>
  );
}
