import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().default(""),
  JWT_SECRET: z.string().min(8).default("dev-secret-change-in-production-please"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  API_PORT: z.string().default("4000"),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  FRONTEND_URL: z.string().url().optional(),
  SMTP_HOST: z.string().default("smtp.example.com"),
  SMTP_PORT: z.string().default("587"),
  SMTP_USER: z.string().default("school@example.com"),
  SMTP_FROM: z.string().default(""),
  SMTP_PASS: z.string().default("CHANGE_ME"),
  AFRIKTALK_API_KEY: z.string().default("CHANGE_ME"),
  AFRIKTALK_USERNAME: z.string().default(""),
  AFRIKTALK_API_URL: z.string().default("https://api.africastalking.com/version1/messaging"),
  AFRIKTALK_SENDER: z.string().default("EduPay"),
  DEFAULT_LANG: z.enum(["fr", "en"]).default("fr"),
  ENABLE_DEMO_AUTH_FALLBACK: z.enum(["true", "false"]).default("false"),
  ENABLE_DEMO_DATA_FALLBACK: z.enum(["true", "false"]).default("false"),
  ADMIN_RECOVERY_CODE: z.string().default("")
});

export const env = envSchema.parse(process.env);
