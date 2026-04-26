import nodemailer from "nodemailer";
import { env } from "../config/env";

type EmailInput = {
  to?: string | null;
  subject: string;
  text: string;
};

type SmsInput = {
  to?: string | null;
  text: string;
};

function hasSmtpConfig() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_PASS !== "CHANGE_ME");
}

function hasSmsConfig() {
  return Boolean(env.AFRIKTALK_API_URL && env.AFRIKTALK_API_KEY && env.AFRIKTALK_API_KEY !== "CHANGE_ME");
}

function smtpTransport() {
  const port = Number(env.SMTP_PORT);
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}

export async function sendEmail(input: EmailInput) {
  if (!input.to) return "SKIPPED";

  if (!hasSmtpConfig()) {
    console.log(`[email:dry-run] To: ${input.to}\nSubject: ${input.subject}\n${input.text}`);
    return "SIMULATED";
  }

  try {
    await smtpTransport().sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text
    });
    return "SENT";
  } catch (error) {
    console.error("Email delivery failed", error);
    return "FAILED";
  }
}

export async function sendSms(input: SmsInput) {
  if (!input.to) return "SKIPPED";

  if (!hasSmsConfig()) {
    console.log(`[sms:dry-run] To: ${input.to}\n${input.text}`);
    return "SIMULATED";
  }

  try {
    const response = await fetch(env.AFRIKTALK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AFRIKTALK_API_KEY}`
      },
      body: JSON.stringify({
        sender: env.AFRIKTALK_SENDER,
        to: input.to,
        message: input.text
      })
    });
    if (!response.ok) throw new Error(`SMS provider responded with ${response.status}`);
    return "SENT";
  } catch (error) {
    console.error("SMS delivery failed", error);
    return "FAILED";
  }
}
