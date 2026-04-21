import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/router";
import { parentRouter } from "./modules/parents/router";
import { studentRouter } from "./modules/students/router";
import { paymentRouter } from "./modules/payments/router";
import { notificationRouter } from "./modules/notifications/router";
import { analyticsRouter } from "./modules/analytics/router";
import { aiRouter } from "./modules/ai/router";
import { classRouter } from "./modules/classes/router";
import { exportRouter } from "./modules/exports/router";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250
}));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.use("/api/auth", authRouter);
app.use("/api/parents", parentRouter);
app.use("/api/students", studentRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/classes", classRouter);
app.use("/api/export", exportRouter);

app.listen(Number(env.API_PORT), () => {
  console.log(`API running on port ${env.API_PORT}`);
});
