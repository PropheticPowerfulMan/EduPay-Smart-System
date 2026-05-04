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

type DeliveryStatus = "SENT" | "FAILED" | "SIMULATED" | "SKIPPED";

function hasSmtpConfig() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_PASS !== "CHANGE_ME");
}

function hasSmsConfig() {
  return Boolean(
    env.AFRIKTALK_API_URL &&
    env.AFRIKTALK_USERNAME &&
    env.AFRIKTALK_API_KEY &&
    env.AFRIKTALK_API_KEY !== "CHANGE_ME"
  );
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

function normalizePhoneNumber(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function isAfricaTalkingEndpoint(url: string) {
  return url.includes("africastalking.com");
}

function isSuccessfulAfrikTalkResponse(body: unknown) {
  if (!body || typeof body !== "object") return true;
  const recipients = (body as any).SMSMessageData?.Recipients;
  if (!Array.isArray(recipients) || recipients.length === 0) return true;

  return recipients.some((recipient) => {
    const status = String(recipient.status ?? recipient.Status ?? "").toLowerCase();
    return status.includes("success") || status.includes("sent") || status.includes("submitted");
  });
}

export async function sendEmail(input: EmailInput): Promise<DeliveryStatus> {
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

export async function sendSms(input: SmsInput): Promise<DeliveryStatus> {
  if (!input.to) return "SKIPPED";
  const to = normalizePhoneNumber(input.to);
  if (!to) return "SKIPPED";

  if (!hasSmsConfig()) {
    console.log(`[sms:dry-run] To: ${to}\n${input.text}`);
    return "SIMULATED";
  }

  try {
    const endpoint = env.AFRIKTALK_API_URL;
    const isAfricaTalking = isAfricaTalkingEndpoint(endpoint);
    const body = isAfricaTalking
      ? new URLSearchParams({
        username: env.AFRIKTALK_USERNAME,
        to,
        message: input.text,
        ...(env.AFRIKTALK_SENDER ? { from: env.AFRIKTALK_SENDER } : {})
      })
      : JSON.stringify({
        username: env.AFRIKTALK_USERNAME,
        sender: env.AFRIKTALK_SENDER,
        from: env.AFRIKTALK_SENDER,
        to,
        message: input.text
      });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: isAfricaTalking
        ? {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey: env.AFRIKTALK_API_KEY
        }
        : {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AFRIKTALK_API_KEY}`,
          apiKey: env.AFRIKTALK_API_KEY
        },
      body
    });
    const responseText = await response.text();
    let responseBody: unknown = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }
    if (!response.ok) throw new Error(`SMS provider responded with ${response.status}: ${responseText}`);
    if (!isSuccessfulAfrikTalkResponse(responseBody)) {
      throw new Error(`SMS provider did not accept any recipient: ${responseText}`);
    }
    return "SENT";
  } catch (error) {
    console.error("SMS delivery failed", error);
    return "FAILED";
  }
}
