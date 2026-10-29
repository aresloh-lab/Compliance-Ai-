import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { ageFromDob } from "../util.js";
import { requireSession } from "../session.js";

const router = Router();

// Every route below requires a valid session — this is personal health data,
// and registered info shouldn't be silently readable/overwritable by any
// request that happens to know the URL. The registration flow itself
// creates the account (and its session) first, then calls PUT to save the
// profile — see AuthGate.jsx.
router.use(requireSession);

router.get("/", async (req, res) => {
  const store = await getStore(req.accountId);
  res.json(store.profile);
});

// "age" everywhere else in this app (BMR/TDEE math, the age-tiered coaching
// guidance) is a derived number computed from "dob" here — dob is the
// actual field the user provides and edits; age is kept in sync automatically
// so every existing age-consuming formula/prompt needs no changes.
const REQUIRED_FIELDS = ["name", "dob", "gender", "heightCm", "weightKg", "nationality"];

router.put("/", async (req, res) => {
  const profile = req.body;
  const missing = REQUIRED_FIELDS.filter((f) => profile[f] === "" || profile[f] === null || profile[f] === undefined);
  if (missing.length) {
    return res.status(400).json({ error: `Registration requires: ${missing.join(", ")}` });
  }
  const age = ageFromDob(profile.dob);
  if (age == null || age < 0 || age > 130) {
    return res.status(400).json({ error: "That date of birth doesn't look valid." });
  }
  const store = await updateStore(req.accountId, (s) => {
    s.profile = { ...profile, age };
  });
  res.json(store.profile);
});

export default router;
