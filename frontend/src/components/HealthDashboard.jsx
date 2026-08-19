import React, { useEffect, useMemo, useState } from "react";
import { Flame, Droplet, Footprints, Trophy, Dumbbell } from "lucide-react";
import { api } from "../api.js";

function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function startOfTodayISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

export default function HealthDashboard({ profile, onNavigate, onPrompt }) {
  const [waterSettings, setWaterSettings] = useState(null);
  const [waterLog, setWaterLog] = useState([]);
  const [foodLog, setFoodLog] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [rewards, setRewards] = useState(null);

  useEffect(() => {
    if (!profile) return;

    Promise.all([
      api.getWaterSettings().catch(() => null),
      api.getWaterLog().catch(() => []),
      api.getFoodLog().catch(() => []),
      api.getActivityLog().catch(() => []),
      api.getRewards().catch(() => null),
    ]).then(([settings, water, food, activity, reward]) => {
      setWaterSettings(settings);
      setWaterLog(water || []);
      setFoodLog(food || []);
      setActivityLog(activity || []);
      setRewards(reward);
    });
  }, [profile]);

  if (!profile) {
    return (
      <section className="card">
        <h2>Health overview</h2>
        <p className="muted">Complete your profile to unlock your personalized weight reduction dashboard.</p>
      </section>
    );
  }

  const age = calculateAge(profile.dob);
  const weight = Number(profile.weightKg || 0);
  const heightCm = Number(profile.heightCm || 0);
  const heightM = Math.max(heightCm / 100, 0.01);
  const bmi = weight && heightM ? weight / (heightM * heightM) : null;

  const activityMap = {
    sedentary: 0.82,
    light: 1.0,
    moderate: 1.14,
    active: 1.3,
  };

  const genderFactor = profile.gender === "male" ? 1.05 : profile.gender === "female" ? 0.98 : 1.0;
  const activityFactor = activityMap[profile.activityLevel] || 1.0;
  const waterGoalCups = Number(waterSettings?.dailyGoalCups ?? waterSettings?.suggested ?? 8);
  const waterGoalLiters = Math.round((waterGoalCups * 240) / 1000 * 10) / 10;

  const dailyCalorieTarget = Math.round(1500 * activityFactor * genderFactor + Math.max(0, 40 - (age || 40)) * 4);
  const profileHealthScore = Math.max(50, Math.min(100, Math.round(82 - (profile.conditions?.length || 0) * 4 + (profile.activityLevel === "active" ? 7 : 0))));

  const today = startOfTodayISO();
  const todaysWater = waterLog
    .filter((entry) => entry.at && new Date(entry.at).toISOString().slice(0, 10) === today)
    .reduce((sum, entry) => sum + Number(entry.cups || 0), 0);

  const todaysFood = foodLog.filter((entry) => entry.at && new Date(entry.at).toISOString().slice(0, 10) === today);
  const todaysCalories = todaysFood.reduce((sum, entry) => sum + Number(entry.calories || 0), 0);
  const todaysJunk = todaysFood.filter((entry) => entry.isJunkFood).length;

  const todaysActivityMinutes = activityLog
    .filter((entry) => entry.at && new Date(entry.at).toISOString().slice(0, 10) === today)
    .reduce((sum, entry) => sum + Number(entry.durationMinutes || 0), 0);

  const waterProgress = Math.min(100, Math.round((todaysWater / Math.max(waterGoalCups, 1)) * 100));
  const rewardSummary = rewards || { availableCredits: 0, outstandingDebtMinutes: 0, junkCount: 0, activityMinutes: 0 };

  const calorieGap = Math.abs(todaysCalories - dailyCalorieTarget);
  const calorieScore = Math.max(0, 100 - Math.round((calorieGap / Math.max(dailyCalorieTarget, 1)) * 100));
  const waterScore = Math.round(Math.max(0, Math.min(100, (todaysWater / Math.max(waterGoalCups, 1)) * 100)));
  const movementGoalMinutes = 30;
  const movementScore = Math.round(Math.max(0, Math.min(100, (todaysActivityMinutes / movementGoalMinutes) * 100)));
  const junkCount = todaysJunk + (rewardSummary.junkCount ?? 0);
  const junkScore = Math.max(0, 100 - Math.min(100, junkCount * 20));
  const rewardScore = Math.max(0, Math.min(100, (rewardSummary.availableCredits ?? 0) * 25));

  const dashboardHealthScore = Math.round(
    waterScore * 0.25 +
      calorieScore * 0.3 +
      movementScore * 0.2 +
      junkScore * 0.15 +
      rewardScore * 0.1
  );

  const coachAdvice = useMemo(() => {
    const items = [];

    if (waterScore < 80) {
      items.push(`Water is ${Math.max(0, waterGoalCups - todaysWater)} cups behind today’s goal.`);
    } else {
      items.push("Hydration is on track for today.");
    }

    if (todaysCalories > dailyCalorieTarget) {
      items.push(`Food energy is ${todaysCalories - dailyCalorieTarget} kcal above the daily target.`);
    } else if (todaysCalories < dailyCalorieTarget - 80) {
      items.push("Food energy is a bit low for today’s plan.");
    } else {
      items.push("Food energy is aligned with the current target.");
    }

    if (todaysActivityMinutes < 15) {
      items.push("Add a short walk or light activity before the day ends.");
    } else {
      items.push(`Activity is ${todaysActivityMinutes} minutes logged today.`);
    }

    if (todaysJunk > 0 || (rewardSummary.junkCount ?? 0) > 0) {
      items.push("Junk-food exposure is visible—use a replacement meal or drink opportunity.");
    } else {
      items.push("No junk-food risks are visible in today’s record.");
    }

    return items;
  }, [dailyCalorieTarget, rewardSummary.junkCount, todaysActivityMinutes, todaysCalories, todaysJunk, todaysWater, waterGoalCups, waterScore]);

  const coachSummary = useMemo(() => {
    const waterLess = Math.max(0, waterGoalCups - todaysWater);
    const calorieDelta = todaysCalories - dailyCalorieTarget;
    const activityStatus = todaysActivityMinutes >= 15 ? "you’re active" : "you still need a movement boost";
    const riskStatus = todaysJunk > 0 || (rewardSummary.junkCount ?? 0) > 0 ? "you have a junk-food signal" : "your junk-food exposure is low";

    if (waterLess > 0) {
      return `Today’s coach summary: your hydration is ${waterLess} cup${waterLess === 1 ? "" : "s"} short, your food energy is ${calorieDelta <= 0 ? "below" : "above"} your target by ${Math.abs(calorieDelta)} kcal, and ${activityStatus}. ${riskStatus} — keep the next meal balanced and avoid a late snack.`;
    }

    return `Today’s coach summary: your water target is met, your food energy is ${calorieDelta <= 0 ? "below" : "above"} your target by ${Math.abs(calorieDelta)} kcal, and ${activityStatus}. ${riskStatus} — keep the next meal balanced and use a clean reward path.`;
  }, [dailyCalorieTarget, rewardSummary.junkCount, todaysActivityMinutes, todaysCalories, todaysJunk, todaysWater, waterGoalCups]);

  const foodHealth = useMemo(() => {
    if (todaysCalories === 0) return "No food logged";
    if (todaysCalories > dailyCalorieTarget + 260) return "High calorie load";
    if (todaysCalories < dailyCalorieTarget - 260) return "Low calorie load";
    return "On target";
  }, [dailyCalorieTarget, todaysCalories]);

  return (
    <section className="dashboard-wrap">
      <section className="dashboard-header card">
        <div>
          <div className="eyebrow">Today’s health status</div>
          <h2>Welcome back, {profile.name || "there"}</h2>
          <p className="muted">
            {age ? `${age} years old` : "Age not set"} • {profile.gender || "Gender not set"} • BMI {bmi ? bmi.toFixed(1) : "--"}
          </p>
        </div>
        <div className="score-panel">
          <div className="score-ring">
            <span>{dashboardHealthScore}%</span>
            <small>health score</small>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <article className="card stat-card highlight-blue">
          <div className="stat-top">
            <Flame className="stat-icon" size={20} strokeWidth={2.25} />
            <span className="stat-label">Daily calorie target</span>
          </div>
          <div className="stat-number">{dailyCalorieTarget} kcal</div>
          <div className="stat-foot muted">Today: {todaysCalories} kcal logged</div>
        </article>

        <article className="card stat-card highlight-green">
          <div className="stat-top">
            <Droplet className="stat-icon" size={20} strokeWidth={2.25} />
            <span className="stat-label">Water goal</span>
          </div>
          <div className="stat-number">{todaysWater}/{waterGoalCups} cups</div>
          <div className="stat-foot muted">{waterGoalLiters.toFixed(1)} L daily target</div>
        </article>

        <article className="card stat-card highlight-orange">
          <div className="stat-top">
            <Footprints className="stat-icon" size={20} strokeWidth={2.25} />
            <span className="stat-label">Movement goal</span>
          </div>
          <div className="stat-number">{todaysActivityMinutes} min</div>
          <div className="stat-foot muted">Light movement plan active</div>
        </article>

        <article className="card stat-card highlight-red">
          <div className="stat-top">
            <Trophy className="stat-icon" size={20} strokeWidth={2.25} />
            <span className="stat-label">Reward balance</span>
          </div>
          <div className="stat-number">{rewardSummary.availableCredits ?? 0} pts</div>
          <div className="stat-foot muted">{rewardSummary.outstandingDebtMinutes ?? 0} min debt</div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card panel-card">
          <div className="panel-head">
            <h3>AI meal coach</h3>
            <span className="tag normal">Food intelligence</span>
          </div>
          <div className="coach-tip">
            <strong>Today’s food focus</strong>
            <p className="muted">
              {foodHealth === "On target" ? "Your meal load is balanced for today." : foodHealth}
            </p>
          </div>
          <ul className="check-list">
            <li>Portion check: lunch should stay around 1 balanced plate.</li>
            <li>Recommended plate split: 50% vegetables, 25% protein, 25% whole grains/starchy carbs.</li>
            <li>Logged junk-food instances: {todaysJunk}</li>
          </ul>
        </article>

        <article className="card panel-card">
          <div className="panel-head">
            <h3>Exercise assistant</h3>
            <span className="tag borderless">Move more</span>
          </div>
          <div className="exercise-plan">
            <div>
              <span className="icon-badge"><Dumbbell size={22} strokeWidth={2.25} color="var(--series-3)" /></span>
              <div>
                <strong>Suggested activity</strong>
                <p className="muted">{Math.max(10, Math.round(10 + (12 - todaysActivityMinutes) / 2))} minutes active movement</p>
              </div>
            </div>
            <div className="mini-plan">
              <span>Walk: 10 min</span>
              <span>Squats: 2 × 12</span>
              <span>Wall push-ups: 2 × 10</span>
            </div>
          </div>
        </article>

        <article className="card panel-card">
          <div className="panel-head">
            <h3>Hydration check</h3>
            <span className="tag normal">{waterProgress >= 100 ? "Goal met" : "In progress"}</span>
          </div>
          <div className="meter-wrap">
            <div className="meter-label">
              <span>Today</span>
              <span>{todaysWater} / {waterGoalCups} cups</span>
            </div>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${waterProgress}%` }}></div>
            </div>
            <p className="muted">
              {waterProgress >= 100 ? "Hydration goal complete." : `${Math.max(waterGoalCups - todaysWater, 0)} more cups needed.`}
            </p>
          </div>
        </article>

        <article className="card panel-card danger-panel">
          <div className="panel-head">
            <h3>Junk-food reduction</h3>
            <span className="tag high">Risk monitor</span>
          </div>
          <div className="risk-score">
            <span className="risk-number">{todaysJunk > 0 ? "Watch" : "Low"}</span>
            <span className="muted">{rewardSummary.junkCount ?? 0} junk-food events this week</span>
          </div>
          <ul className="check-list compact">
            <li>Stay away from late-day sugary snacks.</li>
            <li>Swap 1 snack for fruit or yogurt.</li>
            <li>Use a reward for a clean meal day.</li>
          </ul>
        </article>

        <article className="card panel-card full-span">
          <div className="panel-head">
            <h3>Daily AI coach</h3>
            <span className="tag borderless">Coach plan</span>
          </div>
          <div className="coach-suggestions">
            <div className="coach-summary">
              <span className="summary-label">Coach summary</span>
              <p>{coachSummary}</p>
            </div>
            <ul>
              {coachAdvice.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="command-center">
            <div className="command-title">
              <span>AI Coach Command Center</span>
              <button className="secondary small-button" onClick={() => onNavigate?.("coach")}>Open chat</button>
            </div>
            <div className="quick-prompts">
              <button className="quick-prompt" onClick={() => onPrompt?.("Generate a daily health and weight-loss plan for me.")}>Generate my plan</button>
              <button className="quick-prompt" onClick={() => onPrompt?.("Help me reduce junk food and plan healthier replacements for today.")}>Reduce junk food</button>
              <button className="quick-prompt" onClick={() => onPrompt?.("Check my water intake and tell me what I should drink next.")}>Check my water</button>
              <button className="quick-prompt" onClick={() => onPrompt?.("What should I eat based on my profile and today’s food log?")}>What should I eat?</button>
            </div>
          </div>
          <div className="next-actions">
            <button className="primary" onClick={() => onNavigate?.("meals")}>Log meal</button>
            <button className="secondary" onClick={() => onNavigate?.("water")}>Log water</button>
            <button className="secondary" onClick={() => onNavigate?.("activity")}>Start activity</button>
            <button className="secondary" onClick={() => onNavigate?.("plan")}>View diet plan</button>
          </div>
        </article>
      </section>
    </section>
  );
}
