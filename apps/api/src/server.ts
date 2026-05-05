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
import { startOrbitOutboxWorker } from "./integrations/orbit";

const app = express();

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://edupay-web.onrender.com"
]);

if (env.FRONTEND_URL) {
  allowedOrigins.add(env.FRONTEND_URL.replace(/\/$/, ""));
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    let hostname = "";
    try {
      hostname = origin ? new URL(origin).hostname : "";
    } catch {
      hostname = "";
    }
    if (!origin || allowedOrigins.has(origin) || hostname.endsWith(".github.io")) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  }
}));
app.use(express.json({ limit: "3mb" }));
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

const stopOrbitOutboxWorker = startOrbitOutboxWorker();

const server = app.listen(Number(process.env.PORT ?? env.API_PORT), "0.0.0.0", () => {
  console.log(`API running on port ${process.env.PORT ?? env.API_PORT}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down EduPay API`);
  stopOrbitOutboxWorker();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
