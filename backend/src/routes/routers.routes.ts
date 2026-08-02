import { Router } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import { testConnection } from "../services/mikrotikService";
import {
  createRouter,
  deleteRouter,
  getRouterRecord,
  listRouters,
  updateRouter,
} from "../services/routerRepository";

export const routersRouter = Router();

const routerSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(8728),
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(255),
  sslEnabled: z.boolean().default(false),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});

const routerUpdateSchema = routerSchema.partial();

routersRouter.get("/", (_req, res) => {
  res.json({ data: listRouters() });
});

routersRouter.post("/", (req, res) => {
  const input = routerSchema.parse(req.body);
  const created = createRouter(input);
  res.status(201).json({ data: created });
});

routersRouter.put("/:id", (req, res) => {
  const input = routerUpdateSchema.parse(req.body);
  const updated = updateRouter(req.params.id, input);
  res.json({ data: updated });
});

routersRouter.delete("/:id", (req, res) => {
  deleteRouter(req.params.id);
  res.status(204).send();
});

routersRouter.post("/:id/test-connection", async (req, res, next) => {
  try {
    const record = getRouterRecord(req.params.id);
    if (!record) throw new AppError(404, "الراوتر غير موجود", "ROUTER_NOT_FOUND");
    const result = await testConnection(record);
    res.json({ data: { connected: true, ...result } });
  } catch (err) {
    next(err);
  }
});
