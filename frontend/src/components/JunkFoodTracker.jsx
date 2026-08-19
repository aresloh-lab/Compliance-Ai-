import React, { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { api } from "../api.js";

function daysAgo(iso) {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function RewardsBalance() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState(null);
  const [justRedeemed, setJustRedeemed] = useState(false);

  useEffect(() => {
    api.getRewards().then(setSummary).finally(() => setLoading(false));
  }, []);

  async function redeem() {
    setRedeeming(true);
    setError(null);
    try {
      const updated = await api.redeemReward();
      setSummary(updated);
      setJustRedeemed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setRedeeming(false);
    }
  }

  if (loading || !summary) return null;

  const { junkCount, activityMinutes, outstandingDebtMinutes, availableCredits, rules } = summary;

  return (
    <div className="card">
      <h2>Balance &amp; rewards</h2>
      <p className="muted">
        Extra activity you log banks treat credits; junk food/drinks suggest a bit of extra light
        activity to balance them out. Rolling 7-day window — nothing is ever blocked, this is just
        a nudge to keep things even.
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "10px 0" }}>
        <div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{junkCount}</div>
          <div className="muted">junk items (7d)</div>
        </div>
        <div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{activityMinutes}</div>
          <div className="muted">extra activity min (7d)</div>
        </div>
      </div>

      {outstandingDebtMinutes > 0 && (
        <p>
          You're about <strong>{outstandingDebtMinutes} minutes</strong> of light activity behind
          to balance out this week's junk food/drinks — a couple of brisk walks would cover it.
          No rush, just something to work back toward.
        </p>
      )}

      {availableCredits > 0 && (
        <>
          <p style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <PartyPopper size={16} strokeWidth={2.25} style={{ flexShrink: 0, marginTop: 2 }} color="var(--series-1)" />
            <span>
              You've earned <strong>{availableCredits}</strong> treat credit{availableCredits > 1 ? "s" : ""} from
              extra activity! Redeem one for {rules.treatPortionNote} — sized to not derail your
              progress.
            </span>
          </p>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary" onClick={redeem} disabled={redeeming}>
            {redeeming ? "Redeeming..." : "Redeem a treat credit"}
          </button>
          {justRedeemed && (
            <p className="muted" style={{ marginTop: 6 }}>
              Enjoy it — then log it in the Meal Analyzer as usual, no guilt needed.
            </p>
          )}
        </>
      )}

      {outstandingDebtMinutes === 0 && availableCredits === 0 && (
        <p className="muted">You're even — no debt, no banked credits right now.</p>
      )}

      <p className="muted" style={{ marginTop: 10, fontSize: "0.78rem" }}>
        Rules: {rules.creditMinutes} min of logged extra activity = 1 credit (max {rules.maxBankedCredits}
        {" "}banked) · each junk item suggests {rules.junkDebtMinutes} min of extra light activity.
      </p>
    </div>
  );
}

export default function JunkFoodTracker() {
  const [foodLog, setFoodLog] = useState([]);
  const [plan, setPlan] = useState(null);
  const [baseline, setBaseline] = useState(5);
  const [quickNote, setQuickNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getFoodLog(), api.getJunkFoodPlan()])
      .then(([log, p]) => {
        setFoodLog(log);
        setPlan(p);
      })
      .finally(() => setLoading(false));
  }, []);

  const weeklyCount = foodLog.filter((e) => e.isJunkFood && daysAgo(e.at) <= 7).length;
  const currentWeek =
    plan?.weeks?.find((w) => {
      const weeksSinceGenerated = plan.generatedAt
        ? Math.floor(daysAgo(plan.generatedAt) / 7) + 1
        : 1;
      return w.weekNumber === weeksSinceGenerated;
    }) || plan?.weeks?.[0];

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const p = await api.generateJunkFoodPlan(Number(baseline));
      setPlan(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function quickLog() {
    if (!quickNote.trim()) return;
    const entry = await api.addFoodLog({
      mealType: "snack",
      summary: quickNote.trim(),
      isJunkFood: true,
      junkFoodItems: [quickNote.trim()],
    });
    setFoodLog((l) => [...l, entry]);
    setQuickNote("");
  }

  if (loading) return <div className="card"><p className="muted">Loading...</p></div>;

  return (
    <>
      <RewardsBalance />

      <div className="card">
        <h2>Cut back on junk food &amp; sugary drinks</h2>
        <p className="muted">
          A gradual step-down plan works better than quitting cold turkey — small, steady
          reductions with the goal of eventually cutting junk food and sugary drinks out
          entirely.
        </p>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "10px 0" }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{weeklyCount}</div>
          <div className="muted">junk food / sugary drink instances in the last 7 days</div>
        </div>

        <div className="field">
          <label>Quick-log an instance (soda, fast food, candy, etc.)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={quickNote}
              placeholder="e.g. can of soda"
              onChange={(e) => setQuickNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickLog()}
            />
            <button className="secondary" onClick={quickLog}>Log it</button>
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Meals analyzed in the Meal Analyzer are flagged automatically and counted here too.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Your reduction plan</h2>
        {!plan && (
          <>
            <div className="field">
              <label>About how many times per week do you currently have junk food or a sugary drink?</label>
              <input
                type="number"
                min="0"
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                style={{ maxWidth: 120 }}
              />
            </div>
            {error && <div className="error-banner">{error}</div>}
            <button className="primary" onClick={generate} disabled={generating}>
              {generating ? "Building your plan..." : "Build my step-down plan"}
            </button>
          </>
        )}

        {plan && (
          <>
            <p>
              Starting point: <strong>{plan.baselinePerWeek}/week</strong> → Goal:{" "}
              <strong>{plan.finalGoal}</strong>
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--gridline)" }}>
                  <th style={{ padding: "6px 4px" }}>Week</th>
                  <th style={{ padding: "6px 4px" }}>Target</th>
                  <th style={{ padding: "6px 4px" }}>Focus</th>
                  <th style={{ padding: "6px 4px" }}>Swap idea</th>
                </tr>
              </thead>
              <tbody>
                {plan.weeks?.map((w) => (
                  <tr
                    key={w.weekNumber}
                    style={{
                      borderBottom: "1px solid var(--gridline)",
                      background: currentWeek?.weekNumber === w.weekNumber ? "rgba(42,120,214,0.06)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "6px 4px" }}>
                      {w.weekNumber}
                      {currentWeek?.weekNumber === w.weekNumber && (
                        <span className="tag normal" style={{ marginLeft: 6 }}>now</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 4px" }}>{w.targetPerWeek}/week</td>
                    <td style={{ padding: "6px 4px" }}>{w.focus}</td>
                    <td style={{ padding: "6px 4px" }}>{w.swapIdea}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {currentWeek && (
              <p className="muted" style={{ marginTop: 10 }}>
                Craving hits? {currentWeek.cravingTip}
              </p>
            )}
            <p style={{ marginTop: 10 }}>{plan.encouragement}</p>

            <button className="secondary" style={{ marginTop: 6 }} onClick={() => setPlan(null)}>
              Rebuild plan
            </button>
          </>
        )}
      </div>
    </>
  );
}
