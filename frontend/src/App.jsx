import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Onboarding from "./components/Onboarding.jsx";
import Chat from "./components/Chat.jsx";
import MealBox from "./components/MealBox.jsx";
import HealthReportAnalyzer from "./components/HealthReportAnalyzer.jsx";
import PlanView from "./components/PlanView.jsx";
import PlanOverview from "./components/PlanOverview.jsx";
import ProgressDashboard from "./components/ProgressDashboard.jsx";
import FoodDiary from "./components/FoodDiary.jsx";
import WaterReminder from "./components/WaterReminder.jsx";
import InstallPrompt from "./components/InstallPrompt.jsx";
import JunkFoodTracker from "./components/JunkFoodTracker.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import SupplementLog from "./components/SupplementLog.jsx";
import Insights from "./components/Insights.jsx";
import DailyWeighInBanner from "./components/DailyWeighInBanner.jsx";
import SecuritySettings from "./components/SecuritySettings.jsx";
import WeightLossProgram from "./components/WeightLossProgram.jsx";
import BackupRestore from "./components/BackupRestore.jsx";
import GoogleDriveBackup from "./components/GoogleDriveBackup.jsx";
import CompanionShare from "./components/CompanionShare.jsx";
import AIProviderSettings from "./components/AIProviderSettings.jsx";
import HealthDashboard from "./components/HealthDashboard.jsx";
import Logomark from "./components/Logomark.jsx";
import { backupApi } from "./api.js";
import { isProfileComplete } from "./profileUtils.js";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "coach", label: "Coach" },
  { id: "food", label: "Food" },
  { id: "activity", label: "Activity" },
  { id: "water", label: "Water" },
  { id: "plan", label: "Plan" },
  { id: "progress", label: "Progress" },
  { id: "profile", label: "Profile" },
];

const LANDING_TAB_KEY = "weightCoachLandingTab";

export default function App() {
  const [tab, setTab] = useState(() => {
    const landing = sessionStorage.getItem(LANDING_TAB_KEY);
    if (landing) {
      sessionStorage.removeItem(LANDING_TAB_KEY);
      return landing;
    }
    return "dashboard";
  });
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(true); // assume yes until checked, to avoid a flash of the warning on every load
  const [chatStarter, setChatStarter] = useState("");
  const [pendingWorkout, setPendingWorkout] = useState(null);
  const [pendingRepSet, setPendingRepSet] = useState(null);
  const [pendingTabata, setPendingTabata] = useState(null);
  const [pendingVideoExercise, setPendingVideoExercise] = useState(null);
  const registered = isProfileComplete(profile);

  function handleDashboardPrompt(message) {
    const prompt = (message || "").trim();
    if (!prompt) return;
    setChatStarter(prompt);
    setTab("coach");
  }

  function handleChatAction(action) {
    switch (action.type) {
      case "navigate_to_tab":
        setTab(action.tab);
        break;
      case "start_workout_timer":
        setPendingWorkout({ activityType: action.activityType, intensity: action.intensity, token: Date.now() });
        setTab("activity");
        break;
      case "start_rep_counter":
        setPendingRepSet({ ...action, token: Date.now() });
        setTab("activity");
        break;
      case "start_tabata_timer":
        setPendingTabata({ exerciseType: action.exerciseType, rounds: action.rounds, token: Date.now() });
        setTab("activity");
        break;
      case "start_video_exercise_coach":
        // Browsers require a direct user gesture to grant camera access, so
        // this can only pre-select the exercise and bring them to the
        // camera card — the user still taps "Enable camera" themselves.
        setPendingVideoExercise({ exerciseType: action.exerciseType, token: Date.now() });
        setTab("activity");
        break;
      case "export_my_data":
        window.location.href = backupApi.exportUrl;
        break;
      case "connect_google_fit":
        window.location.href = "/api/google-fit/connect";
        break;
      case "connect_google_drive":
        window.location.href = "/api/google-drive/connect";
        break;
      default:
        break;
    }
  }

  useEffect(() => {
    api
      .getProfile()
      .then((p) => setProfile(p))
      .finally(() => setLoading(false));
    api
      .getHealth()
      .then((h) => setAiConfigured(Boolean(h.aiConfigured)))
      .catch(() => {}); // can't reach the backend at all — a separate, more obvious failure mode
  }, []);

  async function handleSaveProfile(next) {
    const saved = await api.saveProfile(next);
    setProfile(saved);
  }

  return (
    <>
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logomark size={38} />
          <div>
            <h1 style={{ margin: 0 }}>Healthy Weight Coach</h1>
            <p style={{ margin: 0 }}>AI guidance for balanced eating, light activity, and condition-aware nutrition.</p>
          </div>
        </div>
      </header>

      <InstallPrompt />

      {!aiConfigured && (
        <div className="error-banner" style={{ margin: "0 0 12px" }}>
          AI features are offline — no AI provider is configured. Set ANTHROPIC_API_KEY,
          OPENAI_API_KEY, or GEMINI_API_KEY in <code>backend/.env</code>, then pick one under
          Profile &gt; AI Provider.
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          {!registered && tab !== "profile" && (
            <div className="card">
              <p>Register with your name, date of birth, gender, height, and weight so the coach can personalize its advice.</p>
              <button className="primary" onClick={() => setTab("profile")}>
                Go to Registration
              </button>
            </div>
          )}

          {registered && <DailyWeighInBanner />}

          {tab === "dashboard" && registered && (
            <HealthDashboard
              profile={profile}
              onNavigate={(target) => setTab(target)}
              onPrompt={handleDashboardPrompt}
            />
          )}

          {tab === "profile" && (
            <>
              <Onboarding profile={profile} onSave={handleSaveProfile} />
              <AIProviderSettings />
              <CompanionShare />
              <GoogleDriveBackup />
              <BackupRestore />
              <SecuritySettings />
            </>
          )}
          {tab === "coach" && registered && (
            <Chat
              onAction={handleChatAction}
              starterPrompt={chatStarter}
              onStarterPromptConsumed={() => setChatStarter("")}
            />
          )}
          {tab === "food" && registered && (
            <>
              <MealBox />
              <FoodDiary />
              <JunkFoodTracker />
            </>
          )}
          {tab === "activity" && registered && (
            <ActivityLog
              pendingWorkout={pendingWorkout}
              pendingRepSet={pendingRepSet}
              pendingTabata={pendingTabata}
              pendingVideoExercise={pendingVideoExercise}
            />
          )}
          {tab === "water" && registered && <WaterReminder />}
          {tab === "plan" && registered && (
            <>
              <PlanOverview profile={profile} />
              <HealthReportAnalyzer profile={profile} onApplyConditions={handleSaveProfile} />
              <WeightLossProgram profile={profile} />
              <PlanView />
              <SupplementLog />
              <Insights profile={profile} />
            </>
          )}
          {tab === "progress" && registered && <ProgressDashboard profile={profile} />}
        </>
      )}
    </>
  );
}
