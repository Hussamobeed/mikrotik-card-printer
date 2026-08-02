import { Router } from "express";
import { getCachedSync, getSyncHistory, runSync } from "../services/syncService";

export const syncRouter = Router();

/** Manual synchronization only - never triggered automatically. */
syncRouter.post("/:routerId", async (req, res, next) => {
  try {
    const result = await runSync(req.params.routerId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

syncRouter.get("/:routerId/cache", (req, res) => {
  res.json({ data: getCachedSync(req.params.routerId) });
});

syncRouter.get("/:routerId/history", (req, res) => {
  res.json({ data: getSyncHistory(req.params.routerId) });
});

syncRouter.get("/history/all", (_req, res) => {
  res.json({ data: getSyncHistory() });
});
