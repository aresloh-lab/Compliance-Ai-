import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import profileRoutes from "./src/routes/profile.js";
import chatRoutes from "./src/routes/chat.js";
import mealAnalysisRoutes from "./src/routes/mealAnalysis.js";
import familyMealRoutes from "./src/routes/familyMeal.js";
import foodCheckRoutes from "./src/routes/foodCheck.js";
import rewardsRoutes from "./src/routes/rewards.js";
import googleFitRoutes from "./src/routes/googleFit.js";
import activityCheckinRoutes from "./src/routes/activityCheckin.js";
import plateauRoutes from "./src/routes/plateau.js";
import authRoutes from "./src/routes/auth.js";
import weightLossProgramRoutes from "./src/routes/weightLossProgram.js";
import backupRoutes from "./src/routes/backup.js";
import googleDriveRoutes from "./src/routes/googleDrive.js";
import planRoutes from "./src/routes/plan.js";
import progressRoutes from "./src/routes/progress.js";
import healthReportRoutes from "./src/routes/healthReport.js";
import foodLogRoutes from "./src/routes/foodLog.js";
import waterRoutes from "./src/routes/water.js";
import junkFoodPlanRoutes from "./src/routes/junkFoodPlan.js";
import activityRoutes from "./src/routes/activity.js";
import stepsRoutes from "./src/routes/steps.js";
import supplementsRoutes from "./src/routes/supplements.js";
import companionRoutes from "./src/routes/companion.js";
import repCounterRoutes from "./src/routes/repCounter.js";
import tabataMusicRoutes from "./src/routes/tabataMusic.js";
import aiProviderRoutes from "./src/routes/aiProvider.js";
import { PROVIDERS, isConfigured } from "./src/ai/index.js";
import { getFrontendUrl } from "./src/util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const allowedCorsOrigins = new Set(
  [getFrontendUrl(), "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean)
);

// A fixed-IP allowlist breaks every time DHCP hands out a new LAN address
// (which happened mid-session) — matching any private-network address
// instead is robust to that, and doesn't weaken anything: this app's whole
// threat model is already "local network only", and CORS only gates
// browser-based cross-origin fetches anyway, not direct API access, which
// anyone on the LAN could already reach regardless.
const PRIVATE_LAN_ORIGIN = /^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):5173$/;

// Cookie-based sessions need the browser's CORS credentials mode, which is
// incompatible with the wildcard origin — must reflect a specific origin
// instead. In production (frontend served by this same app, see below)
// requests are same-origin anyway and this is mostly a dev-mode concern.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedCorsOrigins.has(origin) || PRIVATE_LAN_ORIGIN.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS origin not allowed: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "15mb" })); // meal photos are embedded as base64 data URLs

app.get("/api/health", (req, res) => res.json({ ok: true, aiConfigured: PROVIDERS.some(isConfigured) }));
app.use("/api/profile", profileRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/meal-analysis", mealAnalysisRoutes);
app.use("/api/family-meal", familyMealRoutes);
app.use("/api/food-check", foodCheckRoutes);
app.use("/api/rewards", rewardsRoutes);
app.use("/api/google-fit", googleFitRoutes);
app.use("/api/activity-checkin", activityCheckinRoutes);
app.use("/api/plateau", plateauRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/weight-loss-program", weightLossProgramRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/google-drive", googleDriveRoutes);
app.use("/api/plan", planRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/health-report", healthReportRoutes);
app.use("/api/food-log", foodLogRoutes);
app.use("/api/water", waterRoutes);
app.use("/api/junk-food-plan", junkFoodPlanRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/steps", stepsRoutes);
app.use("/api/supplements", supplementsRoutes);
app.use("/api/companion", companionRoutes);
app.use("/api/rep-counter", repCounterRoutes);
app.use("/api/tabata-music", tabataMusicRoutes);
app.use("/api/ai", aiProviderRoutes);

if (!PROVIDERS.some(isConfigured)) {
  console.warn(
    "Warning: no AI provider is configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in backend/.env before using AI features."
  );
}

// Serves the built frontend (run `npm run build` in frontend/ first) so the
// whole app is one deployable service on one origin — which is also what
// keeps cookie-based sessions simple (no cross-origin CORS/cookie dance).
// Not used in dev: Vite's own dev server (`npm run dev` in frontend/) serves
// the frontend there instead, proxying /api to this server.
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "..", "frontend", "dist");
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
