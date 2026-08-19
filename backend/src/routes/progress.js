import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

// Measurement types this app understands, so readings from any kit (smart
// scale, BP monitor, glucometer, uric acid meter) can be logged the same way.
// `source` distinguishes a manually-typed reading from one pulled in by a
// future device integration (Bluetooth kit, Apple Health, Google Fit, Fitbit, etc.)
const VALID_TYPES = new Set(["weight", "bloodPressure", "glucose", "uricAcid"]);

function validateEntry(body) {
  const { type, source = "manual", note = "" } = body;
  if (!VALID_TYPES.has(type)) {
    return { error: `type must be one of: ${[...VALID_TYPES].join(", ")}` };
  }
  if (type === "bloodPressure") {
    const { systolic, diastolic } = body;
    if (typeof systolic !== "number" || typeof diastolic !== "number") {
      return { error: "bloodPressure entries require numeric systolic and diastolic" };
    }
    return { entry: { type, systolic, diastolic, unit: "mmHg", source, note } };
  }
  const { value } = body;
  if (typeof value !== "number") {
    return { error: "value (number) is required for this measurement type" };
  }
  const unit = { weight: "kg", glucose: "mg/dL", uricAcid: "mg/dL" }[type];
  return { entry: { type, value, unit, source, note } };
}

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.progressEntries);
});

router.post("/", async (req, res) => {
  const { entry, error } = validateEntry(req.body);
  if (error) return res.status(400).json({ error });

  const record = { id: Date.now(), date: new Date().toISOString(), ...entry };
  const store = await updateStore((s) => {
    s.progressEntries.push(record);
    s.progressEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
  });
  res.status(201).json(record);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await updateStore((s) => {
    s.progressEntries = s.progressEntries.filter((e) => e.id !== id);
  });
  res.status(204).end();
});

export default router;
