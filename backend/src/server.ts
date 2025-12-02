import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { authRouter } from "./routes/authRoutes";
import { itemRouter } from "./routes/itemRoutes";
import { purchaseRouter } from "./routes/purchaseRoutes";
import { dayEndRouter } from "./routes/dayEndRoutes";
import { dashboardRouter } from "./routes/dashboardRoutes";
import { analyticsRouter } from "./routes/analyticsRoutes";
import { settingsRouter } from "./routes/settingsRoutes";
import { adjustmentRouter } from "./routes/adjustmentRoutes";
import { userRouter } from "./routes/userRoutes";
import { authMiddleware } from "./middleware/authMiddleware";
import { errorHandler } from "./middleware/errorMiddleware";
import { ensureBootstrapData } from "./services/bootstrapService";

async function bootstrap() {
  await ensureBootstrapData();

  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(morgan("dev"));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);
  app.use("/api/items", authMiddleware, itemRouter);
  app.use("/api/purchases", authMiddleware, purchaseRouter);
  app.use("/api/day-end-reports", authMiddleware, dayEndRouter);
  app.use("/api/dashboard", authMiddleware, dashboardRouter);
  app.use("/api/analytics", authMiddleware, analyticsRouter);
  app.use("/api/settings", authMiddleware, settingsRouter);
  app.use("/api/adjustments", authMiddleware, adjustmentRouter);
  app.use("/api/users", authMiddleware, userRouter);

  app.use(errorHandler);

  app.listen(env.port, () => {
    console.log(`API ready on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
