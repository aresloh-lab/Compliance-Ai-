import React, { useEffect, useRef, useState } from "react";
import { Droplet } from "lucide-react";
import { api } from "../api.js";

function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function WaterReminder() {
  const [settings, setSettings] = useState(null);
  const [log, setLog] = useState([]);
  const [reminderVisible, setReminderVisible] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [loadError, setLoadError] = useState(null);
  const timerRef = useRef(null);

  function load() {
    setLoadError(null);
    Promise.all([api.getWaterSettings(), api.getWaterLog()])
      .then(([s, l]) => {
        setSettings(s);
        setLog(l);
        setGoalInput(String(s.dailyGoalCups ?? s.suggested));
      })
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  const todayCups = log.filter((e) => isToday(e.at)).reduce((sum, e) => sum + e.cups, 0);
  const goal = settings?.dailyGoalCups ?? settings?.suggested ?? 8;
  const interval = settings?.intervalMinutes ?? settings?.suggestedIntervalMinutes ?? 90;

  function checkPace() {
    if (!settings) return;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    if (hour < settings.startHour || hour >= settings.endHour) return;

    const windowElapsed = hour - settings.startHour;
    const windowTotal = settings.endHour - settings.startHour;
    const expectedByNow = Math.round(goal * (windowElapsed / windowTotal));
    const behindBy = expectedByNow - todayCups;

    if (behindBy >= 2) {
      setReminderMessage(
        `You're a few cups behind pace for your ${goal}-cup goal — about ${behindBy} behind where you'd expect to be by now.`
      );
    } else {
      setReminderMessage("Time to drink some water!");
    }
    setReminderVisible(true);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Time to drink water", {
        body: behindBy >= 2 ? `You're behind on your ${goal}-cup goal today — catch up when you can.` : "Take a moment to hydrate.",
      });
    }
  }

  // Check pace immediately on load/goal change too, not just on the next
  // timer tick, so opening the tab surfaces a "you're behind" state right away.
  useEffect(() => {
    if (!settings || log.length === 0) return;
    checkPace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings !== null]);

  useEffect(() => {
    if (!settings) return;
    clearInterval(timerRef.current);
    const ms = Math.max(1, interval) * 60 * 1000;
    timerRef.current = setInterval(checkPace, ms);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, todayCups]);

  function requestPermission() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPermission);
  }

  async function saveSettings(next) {
    const saved = await api.saveWaterSettings(next);
    setSettings(saved);
  }

  async function saveGoal() {
    const saved = await api.saveWaterSettings({ dailyGoalCups: goalInput === "" ? null : Number(goalInput) });
    setSettings(saved);
    setEditingGoal(false);
  }

  async function useAutoGoal() {
    const saved = await api.saveWaterSettings({ dailyGoalCups: null });
    setSettings(saved);
    setGoalInput(String(saved.suggested));
    setEditingGoal(false);
  }

  async function logCup(cups = 1) {
    const entry = await api.logWater(cups);
    setLog((l) => [...l, entry]);
    setReminderVisible(false);
  }

  if (loadError) {
    return (
      <div className="card">
        <div className="error-banner">{loadError}</div>
        <button className="secondary" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!settings) return <div className="card"><p className="muted">Loading...</p></div>;

  const goalReached = todayCups >= goal;
  const usingAutoGoal = settings.dailyGoalCups == null;

  return (
    <div className="card">
      <h2>Water reminders</h2>
      <p className="muted">
        Your goal is calculated from your weight and activity level (~33ml/kg + an activity
        bonus), and reminders are spaced across your active hours to actually reach it — not just
        a flat timer.
      </p>

      {reminderVisible && (
        <div
          className="error-banner"
          style={{ background: "rgba(42,120,214,0.08)", borderColor: "rgba(42,120,214,0.3)", color: "var(--series-1)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
        >
          <Droplet size={14} strokeWidth={2.25} /> {reminderMessage}{" "}
          <button className="secondary" style={{ marginLeft: 8 }} onClick={() => logCup(1)}>
            I drank a glass
          </button>
          <button
            style={{ marginLeft: 8, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
            onClick={() => setReminderVisible(false)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>
          {todayCups}/{goal}
        </div>
        <div className="muted">
          cups today {usingAutoGoal && <span style={{ fontSize: "0.75rem" }}>(auto)</span>}
        </div>
        {goalReached && <span className="tag normal">Goal reached</span>}
        <button className="primary" style={{ marginLeft: "auto" }} onClick={() => logCup(1)}>
          + Log a cup
        </button>
      </div>

      {editingGoal ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="number"
            min="1"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            style={{ maxWidth: 100 }}
          />
          <button className="secondary" onClick={saveGoal}>Save goal</button>
          {!usingAutoGoal && (
            <button className="secondary" onClick={useAutoGoal}>Use auto ({settings.suggested})</button>
          )}
        </div>
      ) : (
        <button className="secondary" style={{ marginBottom: 12 }} onClick={() => setEditingGoal(true)}>
          Adjust goal ({goal}/day{usingAutoGoal ? ", auto" : ""})
        </button>
      )}

      {notifPermission !== "granted" && notifPermission !== "unsupported" && (
        <p className="muted">
          Reminders show in-app either way. For a browser notification when this tab isn't
          focused,{" "}
          <button className="secondary" onClick={requestPermission} style={{ padding: "2px 8px" }}>
            enable notifications
          </button>
          .
        </p>
      )}

      <h3 style={{ marginBottom: 8, fontSize: "0.95rem" }}>Reminder schedule</h3>
      <div className="row">
        <div className="field">
          <label>Remind every (minutes) {settings.intervalMinutes == null && <span className="muted">(auto: {settings.suggestedIntervalMinutes})</span>}</label>
          <input
            type="number"
            min="15"
            value={interval}
            onChange={(e) => saveSettings({ intervalMinutes: e.target.value })}
          />
        </div>
        <div />
      </div>
      <div className="row">
        <div className="field">
          <label>Active from (hour, 24h)</label>
          <input
            type="number"
            min="0"
            max="23"
            value={settings.startHour}
            onChange={(e) => saveSettings({ startHour: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Active until (hour, 24h)</label>
          <input
            type="number"
            min="0"
            max="23"
            value={settings.endHour}
            onChange={(e) => saveSettings({ endHour: Number(e.target.value) })}
          />
        </div>
      </div>
      <p className="muted">
        Reminders only fire while this app is open in your browser — there's no background/mobile
        push in this build.
      </p>
    </div>
  );
}
