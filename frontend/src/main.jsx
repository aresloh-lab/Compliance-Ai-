import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import CompanionApp from "./CompanionApp.jsx";
import AuthGate from "./components/AuthGate.jsx";
import AmbientBackground from "./components/AmbientBackground.jsx";
import "./styles.css";

// A partner's device lands here via a ?companion=1 link and never touches
// the primary registration/login gate — the share code itself is that view's credential.
const isCompanion = new URLSearchParams(window.location.search).get("companion") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AmbientBackground />
    {isCompanion ? (
      <CompanionApp />
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    )}
  </React.StrictMode>
);

// Only register in a real production build — in dev, a cache-first service
// worker means every code change keeps getting silently overridden by
// whatever was cached the first time the app was ever loaded, which is
// exactly the kind of stale-app bug that's worse than no offline support.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
} else if ("serviceWorker" in navigator) {
  // Also unregister any service worker left over from an earlier dev session
  // (e.g. before this guard existed) so stale cached code stops being served.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}
