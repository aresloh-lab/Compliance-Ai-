import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { buildBackupPayload, backupFilename, validateBackupPayload, applyImportedData } from "../backup.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/export", async (req, res) => {
  const store = await getStore();
  const payload = buildBackupPayload(store);
  res.setHeader("Content-Disposition", `attachment; filename="${backupFilename()}"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload, null, 2));
});

router.post("/import", async (req, res) => {
  const validationError = validateBackupPayload(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const store = await updateStore((s) => applyImportedData(s, req.body.data));
  res.json({ ok: true, restoredFrom: req.body.exportedAt ?? null, profile: store.profile });
});

export default router;
