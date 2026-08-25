import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3100;
const DATA_DIR = path.join(__dirname, "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

// gemini-3.5-flash-lite: confirmed working with a generous free-tier quota
// in this project (see backend/src/ai/gemini.js) — other free Gemini models
// were either retired, blocked for new accounts, or capped at ~20 req/day.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const IS_LITE_MODEL = GEMINI_MODEL.includes("lite");

const genaiKey = process.env.GEMINI_API_KEY?.trim() || null;
const genai = genaiKey ? new GoogleGenAI({ apiKey: genaiKey }) : null;

const resendKey = process.env.RESEND_API_KEY?.trim() || null;
const resendFrom = process.env.RESEND_FROM_EMAIL || "Threshold <onboarding@resend.dev>";

async function sendReportEmail({ to, subject, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: resendFrom, to, subject, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SERVICES = ["Formation", "Planning", "Location", "Design", "Renovation"];

const CHAT_SYSTEM = `You are the intake assistant for Threshold, a boutique studio that helps people open a physical retail shop. Threshold offers five services: startup & entity formation, business planning, site/location scouting, interior & brand design, and renovation & build-out.

Have a short, warm, professional conversation with a prospective client to understand what they're opening and which services they need. Ask one focused question at a time -- never a long list at once. Try to learn: what kind of business, which of the five services apply, city/neighborhood, rough budget, and target timeline. Once you have a reasonable picture, even if incomplete, let them know they can click "Generate report for the studio" whenever they're ready. Keep every reply under 80 words and don't use markdown formatting.`;

function reportPrompt() {
  return `Based on the conversation above, respond with ONLY a JSON object (no markdown fences, no commentary before or after) with exactly these keys:
"business" (short description of what they're opening),
"services" (array using only these values where they apply: ${JSON.stringify(SERVICES)}),
"city" (string, or null if not mentioned),
"budget" (short string summarizing what was said about budget, or "not discussed"),
"timeline" (short string summarizing target timeline, or "not discussed"),
"summary" (2-3 sentence brief for the studio team),
"recommended_next_step" (one sentence).`;
}

function cleanMessages(input) {
  return (Array.isArray(input) ? input : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function askGemini({ system, messages, maxTokens }) {
  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: toGeminiContents(messages),
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens,
      // Non-lite Gemini models spend output tokens on hidden "thinking" first,
      // which can silently eat the whole budget on a short prompt; lite
      // models don't support this field at all (400s if sent).
      ...(IS_LITE_MODEL ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    },
  });
  return response.text ?? "";
}

function requireAI(res) {
  if (!genai) {
    res.status(503).json({ error: "AI is not configured on this server. Set GEMINI_API_KEY in business-site/.env." });
    return false;
  }
  return true;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(genai), emailConfigured: Boolean(resendKey && process.env.REPORT_TO_EMAIL) });
});

app.post("/api/chat", async (req, res) => {
  if (!requireAI(res)) return;
  const messages = cleanMessages(req.body?.messages);

  if (!messages.length || messages[0].role !== "user") {
    return res.status(400).json({ error: "messages must start with a user message" });
  }

  try {
    const text = await askGemini({ system: CHAT_SYSTEM, messages, maxTokens: 500 });
    res.json({ reply: text });
  } catch (err) {
    console.error("chat error:", err);
    res.status(502).json({ error: "The assistant is unavailable right now. Please try again." });
  }
});

app.post("/api/report", async (req, res) => {
  if (!requireAI(res)) return;
  const messages = cleanMessages(req.body?.messages);
  const contact = req.body?.contact || {};

  if (!messages.length) {
    return res.status(400).json({ error: "No conversation to summarize yet." });
  }

  try {
    const text = await askGemini({
      system: CHAT_SYSTEM,
      messages: [...messages, { role: "user", content: reportPrompt() }],
      maxTokens: 800,
    });

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = {
        business: null,
        services: [],
        city: null,
        budget: "not discussed",
        timeline: "not discussed",
        summary: text || "The assistant could not summarize this conversation.",
        recommended_next_step: "Follow up with the client directly.",
      };
    }

    const record = {
      id: "R-" + Date.now(),
      createdAt: new Date().toISOString(),
      contact: { name: contact.name || null, email: contact.email || null },
      report: parsed,
      transcript: messages,
    };

    await fs.mkdir(DATA_DIR, { recursive: true });
    let existing = [];
    try {
      existing = JSON.parse(await fs.readFile(REPORTS_FILE, "utf8"));
    } catch {
      // no file yet
    }
    existing.push(record);
    await fs.writeFile(REPORTS_FILE, JSON.stringify(existing, null, 2));

    let emailed = false;
    if (resendKey && process.env.REPORT_TO_EMAIL) {
      try {
        await sendReportEmail({
          to: process.env.REPORT_TO_EMAIL,
          subject: `New Threshold consult report — ${parsed.business || contact.name || "New inquiry"}`,
          text: [
            `Ticket: ${record.id}`,
            `Name: ${contact.name || "—"}`,
            `Email: ${contact.email || "—"}`,
            "",
            `Business: ${parsed.business || "—"}`,
            `Services: ${(parsed.services || []).join(", ") || "—"}`,
            `City: ${parsed.city || "—"}`,
            `Budget: ${parsed.budget || "—"}`,
            `Timeline: ${parsed.timeline || "—"}`,
            "",
            `Summary: ${parsed.summary || "—"}`,
            `Recommended next step: ${parsed.recommended_next_step || "—"}`,
          ].join("\n"),
        });
        emailed = true;
      } catch (err) {
        console.error("email send failed:", err);
      }
    }

    res.json({ report: parsed, id: record.id, emailed });
  } catch (err) {
    console.error("report error:", err);
    res.status(502).json({ error: "Could not generate the report right now. Please try again." });
  }
});

app.get("/api/reports", async (req, res) => {
  if (!process.env.ADMIN_KEY || req.get("x-admin-key") !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const existing = JSON.parse(await fs.readFile(REPORTS_FILE, "utf8"));
    res.json({ reports: existing.slice().reverse() });
  } catch {
    res.json({ reports: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Threshold business site listening on http://localhost:${PORT}`);
  if (!genai) console.warn("Warning: GEMINI_API_KEY not set — chat/report endpoints will return 503.");
  if (!resendKey || !process.env.REPORT_TO_EMAIL) {
    console.warn("Warning: email not fully configured — reports will be saved locally but not emailed. See .env.example.");
  }
});
