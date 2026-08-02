import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import "./db/database";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { httpLogger, logger } from "./middleware/logger";
import { exportRouter } from "./routes/export.routes";
import { healthRouter } from "./routes/health.routes";
import { libraryRouter } from "./routes/library.routes";
import { routersRouter } from "./routes/routers.routes";
import { settingsRouter } from "./routes/settings.routes";
import { syncRouter } from "./routes/sync.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(httpLogger);

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/api", healthRouter);
app.use("/api/routers", routersRouter);
app.use("/api/sync", syncRouter);
app.use("/api/export-to-mikrotik", exportRouter);
app.use("/api/library", libraryRouter);
app.use("/api/settings", settingsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Hersnnet Cards Manager backend listening on port ${env.port} (${env.nodeEnv})`);
});
