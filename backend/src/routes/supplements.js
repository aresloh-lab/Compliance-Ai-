import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);
const CATEGORIES = new Set([
  "probiotic",
  "vitaminC",
  "enzyme",
  "multivitamin",
  "fiber",
  "omega3",
  "other",
]);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.supplementLog);
});

router.post("/", async (req, res) => {
  const { category, name, dosage = "", note = "" } = req.body;
  if (!CATEGORIES.has(category)) {
    return res.status(400).json({ error: `category must be one of: ${[...CATEGORIES].join(", ")}` });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required (e.g. Greek yogurt, Vitamin C 500mg)" });
  }

  const entry = {
    id: Date.now(),
    at: new Date().toISOString(),
    category,
    name,
    dosage,
    note,
  };
  await updateStore((s) => {
    s.supplementLog.push(entry);
  });
  res.status(201).json(entry);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await updateStore((s) => {
    s.supplementLog = s.supplementLog.filter((e) => e.id !== id);
  });
  res.status(204).end();
});

export default router;
