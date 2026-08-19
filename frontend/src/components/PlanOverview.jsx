import React, { useEffect, useState } from "react";
import { Target, CalendarDays, Pill, Stethoscope } from "lucide-react";
import { api } from "../api.js";

function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

// A glance-able strip at the top of the Plan tab — the five cards below it
// (health report, program, today's plan, supplements, insights) each need
// their own click-to-generate/scroll to actually see, so this exists purely
// to answer "what's my plan, right now" without opening any of them.
export default function PlanOverview({ profile }) {
  const [program, setProgram] = useState(null);
  const [plan, setPlan] = useState(null);
  const [supplements, setSupplements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getWeightLossProgram().catch(() => null),
      api.getPlan().catch(() => null),
      api.getSupplements().catch(() => []),
    ]).then(([p, d, s]) => {
      setProgram(p);
      setPlan(d);
      setSupplements(s || []);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  const supplementsToday = supplements.filter((e) => isToday(e.at)).length;
  const conditionCount = profile?.conditions?.length ?? 0;

  return (
    <section className="stats-grid" style={{ marginBottom: 16 }}>
      <article className="card stat-card highlight-blue">
        <div className="stat-top">
          <Target className="stat-icon" size={20} strokeWidth={2.25} />
          <span className="stat-label">Program pace</span>
        </div>
        {program ? (
          <>
            <div className="stat-number">{program.effectiveRateKgPerWeek} kg/wk</div>
            <div className="stat-foot muted">~{program.estimatedWeeks} weeks to goal</div>
          </>
        ) : (
          <div className="stat-foot muted" style={{ marginTop: 16 }}>Not built yet</div>
        )}
      </article>

      <article className="card stat-card highlight-green">
        <div className="stat-top">
          <CalendarDays className="stat-icon" size={20} strokeWidth={2.25} />
          <span className="stat-label">Today's target</span>
        </div>
        {plan && isToday(plan.generatedAt) ? (
          <>
            <div className="stat-number">{plan.estimatedCalorieTarget} kcal</div>
            <div className="stat-foot muted">{plan.meals?.[0]?.name ?? "Plan ready"}</div>
          </>
        ) : (
          <div className="stat-foot muted" style={{ marginTop: 16 }}>
            {plan ? "From an earlier day" : "Not generated yet"}
          </div>
        )}
      </article>

      <article className="card stat-card highlight-orange">
        <div className="stat-top">
          <Pill className="stat-icon" size={20} strokeWidth={2.25} />
          <span className="stat-label">Supplements</span>
        </div>
        <div className="stat-number">{supplementsToday}</div>
        <div className="stat-foot muted">logged today</div>
      </article>

      <article className="card stat-card highlight-red">
        <div className="stat-top">
          <Stethoscope className="stat-icon" size={20} strokeWidth={2.25} />
          <span className="stat-label">Conditions on file</span>
        </div>
        <div className="stat-number">{conditionCount}</div>
        <div className="stat-foot muted">{conditionCount > 0 ? "factored into every plan" : "none reported"}</div>
      </article>
    </section>
  );
}
