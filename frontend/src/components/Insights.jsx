import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import WeightChart from "./charts/WeightChart.jsx";
import MiniBarChart from "./charts/MiniBarChart.jsx";

const DAYS = 14;

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function shortLabel(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric" });
}

function bucketByDay(entries, dateOf, valueOf) {
  const map = {};
  for (const e of entries) {
    const key = dateOf(e);
    if (!key) continue;
    map[key] = (map[key] || 0) + valueOf(e);
  }
  return lastNDays(DAYS).map((day) => ({
    label: day,
    shortLabel: shortLabel(day),
    value: Math.round((map[day] || 0) * 10) / 10,
  }));
}

export default function Insights({ profile }) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState([]);
  const [foodLog, setFoodLog] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [waterLog, setWaterLog] = useState([]);
  const [waterSettings, setWaterSettings] = useState(null);
  const [stepLog, setStepLog] = useState([]);
  const [stepGoal, setStepGoal] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getProgress(),
      api.getFoodLog(),
      api.getActivityLog(),
      api.getWaterLog(),
      api.getWaterSettings(),
      api.getStepLog(),
      api.getStepGoal(),
    ])
      .then(([p, f, a, w, ws, s, sg]) => {
        setProgress(p);
        setFoodLog(f);
        setActivityLog(a);
        setWaterLog(w);
        setWaterSettings(ws);
        setStepLog(s);
        setStepGoal(sg);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card"><p className="muted">Crunching your data...</p></div>;

  const weightEntries = progress.filter((e) => e.type === "weight");
  const calorieData = bucketByDay(
    foodLog,
    (e) => new Date(e.at).toISOString().slice(0, 10),
    (e) => e.calories || 0
  );
  const junkData = bucketByDay(
    foodLog.filter((e) => e.isJunkFood),
    (e) => new Date(e.at).toISOString().slice(0, 10),
    () => 1
  );
  const activityData = bucketByDay(
    activityLog,
    (e) => new Date(e.at).toISOString().slice(0, 10),
    (e) => e.durationMinutes
  );
  const caloriesBurnedData = bucketByDay(
    activityLog.filter((e) => e.caloriesBurned != null),
    (e) => new Date(e.at).toISOString().slice(0, 10),
    (e) => e.caloriesBurned
  );
  const waterData = bucketByDay(
    waterLog,
    (e) => new Date(e.at).toISOString().slice(0, 10),
    (e) => e.cups
  );
  const stepsData = lastNDays(DAYS).map((day) => {
    const entry = stepLog.find((e) => e.date === day);
    return { label: day, shortLabel: shortLabel(day), value: entry?.steps ?? 0 };
  });

  return (
    <>
      <div className="card">
        <h2>Insights</h2>
        <p className="muted">
          Trends built from everything you've logged over the last {DAYS} days — weight, calories,
          activity, water, steps, and junk food/drink instances.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Weight</h3>
        <WeightChart entries={weightEntries} goalWeightKg={profile?.goalWeightKg} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Calories logged per day</h3>
        <MiniBarChart data={calorieData} color="var(--series-2)" unit=" kcal" emptyLabel="Log meals in the Meal Analyzer to see this." />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Active minutes per day</h3>
        <MiniBarChart data={activityData} color="var(--series-3)" unit=" min" emptyLabel="Log activity to see this." />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Calories burned per day</h3>
        <MiniBarChart data={caloriesBurnedData} color="var(--series-3)" unit=" kcal" emptyLabel="Log or time a workout to see this." />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Steps per day</h3>
        <MiniBarChart
          data={stepsData}
          color="var(--series-1)"
          unit=" steps"
          goal={stepGoal?.goal ?? stepGoal?.suggested}
          emptyLabel="Log steps in the Activity tab to see this."
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Water intake per day</h3>
        <MiniBarChart
          data={waterData}
          color="var(--series-1)"
          unit=" cups"
          goal={waterSettings?.dailyGoalCups ?? waterSettings?.suggested}
          emptyLabel="Log water intake to see this."
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Junk food / sugary drink instances per day</h3>
        <MiniBarChart data={junkData} color="var(--serious)" unit="" emptyLabel="Nothing logged — or nothing flagged, either way that's good." />
      </div>
    </>
  );
}
