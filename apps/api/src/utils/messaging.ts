import nodemailer from "nodemailer";
import { env } from "../config/env";

type EmailInput = {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
};

type SmsInput = {
  to?: string | null;
  text: string;
};

type DeliveryStatus = "SENT" | "FAILED" | "SIMULATED" | "SKIPPED";

export type MessagingConfigStatus = {
  email: {
    configured: boolean;
    host: string;
    port: string;
    from: string;
    userConfigured: boolean;
  };
  sms: {
    configured: boolean;
    providerUrl: string;
    usernameConfigured: boolean;
    sender: string;
  };
};

const SCHOOL_NAME = "Kinshasa Christian School";
const SCHOOL_SHORT_NAME = "KCS";
const SCHOOL_TAGLINE = "Letting Our Light Shine";
const SCHOOL_LOGO_URL = "https://kinshasachristianschool.org/Images/logo.png";
const SCHOOL_WEBSITE = "https://kinshasachristianschool.org/";
const BRAND_BLUE = "#004080";
const BRAND_NAVY = "#08264c";
const BRAND_GOLD = "#ffcb05";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEmailContent(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const htmlLines: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      htmlLines.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      htmlLines.push('<div style="height:12px;line-height:12px">&nbsp;</div>');
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("• ")) {
      if (!listOpen) {
        htmlLines.push('<ul style="margin:8px 0 14px 0;padding:0;list-style:none">');
        listOpen = true;
      }
      htmlLines.push(
        `<li style="margin:7px 0;padding-left:22px;position:relative;color:#314155;font-size:14px;line-height:1.55"><span style="position:absolute;left:0;top:8px;width:7px;height:7px;border-radius:999px;background:${BRAND_GOLD};display:inline-block"></span>${escapeHtml(line.slice(2))}</li>`
      );
      continue;
    }

    closeList();
    const [label, ...rest] = line.split(":");
    if (rest.length > 0 && label.length <= 34) {
      htmlLines.push(
        `<p style="margin:8px 0;color:#314155;font-size:14px;line-height:1.55"><strong style="color:${BRAND_NAVY}">${escapeHtml(label)}:</strong>${escapeHtml(` ${rest.join(":").trim()}`)}</p>`
      );
    } else {
      htmlLines.push(`<p style="margin:8px 0;color:#314155;font-size:14px;line-height:1.55">${escapeHtml(line)}</p>`);
    }
  }

  closeList();
  return htmlLines.join("");
}

function inferAudience(subject: string, text: string) {
  const content = `${subject}\n${text}`.toLowerCase();
  if (content.includes("parent") || content.includes("enfant") || content.includes("eleves concernes")) {
    return { label: "Espace parent", accent: BRAND_GOLD };
  }
  if (content.includes("eleve") || content.includes("student")) {
    return { label: "Espace eleve", accent: "#12aee8" };
  }
  if (content.includes("employ") || content.includes("enseign") || content.includes("staff")) {
    return { label: "Espace employe", accent: "#16a34a" };
  }
  return { label: "Notification EduPay", accent: BRAND_GOLD };
}

function buildBrandedEmailHtml(input: EmailInput) {
  if (input.html) return input.html;

  const audience = inferAudience(input.subject, input.text);
  const previewLine = input.text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? input.subject;
  const frontendUrl = env.FRONTEND_URL?.replace(/\/$/, "") || SCHOOL_WEBSITE;
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef4fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(previewLine)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4fb;margin:0;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:collapse">
          <tr>
            <td style="padding:0">
              <div style="background:${BRAND_NAVY};border-radius:28px 28px 0 0;padding:26px 28px 30px;position:relative;overflow:hidden">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="width:74px;height:74px;border-radius:22px;background:#ffffff;padding:8px;box-shadow:0 12px 30px rgba(0,0,0,.18)">
                            <img src="${SCHOOL_LOGO_URL}" width="58" height="58" alt="${SCHOOL_NAME}" style="display:block;width:58px;height:58px;object-fit:contain;border:0">
                          </td>
                          <td style="padding-left:16px">
                            <p style="margin:0 0 4px;color:${BRAND_GOLD};font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.14em">${SCHOOL_SHORT_NAME} · ${escapeHtml(audience.label)}</p>
                            <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.2;font-weight:800">${escapeHtml(input.subject)}</h1>
                            <p style="margin:7px 0 0;color:#cfe2ff;font-size:13px">${SCHOOL_TAGLINE}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-left:1px solid #dbe7f4;border-right:1px solid #dbe7f4;padding:30px 30px 10px">
              <div style="border-left:5px solid ${audience.accent};background:#f8fbff;border-radius:18px;padding:18px 20px;margin-bottom:22px">
                <p style="margin:0;color:${BRAND_BLUE};font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em">Message officiel</p>
                <p style="margin:6px 0 0;color:#334155;font-size:14px;line-height:1.55">Ce message vous est envoyé par ${SCHOOL_NAME} via EduPay.</p>
              </div>
              ${formatEmailContent(input.text)}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-left:1px solid #dbe7f4;border-right:1px solid #dbe7f4;padding:18px 30px 30px">
              <a href="${frontendUrl}" style="display:inline-block;background:${BRAND_GOLD};color:#071d3a;text-decoration:none;font-weight:800;border-radius:999px;padding:13px 22px;font-size:14px">Ouvrir EduPay</a>
              <p style="margin:16px 0 0;color:#64748b;font-size:12px;line-height:1.5">Pour toute question, contactez l'administration de ${SCHOOL_SHORT_NAME}. Gardez ce message pour vos archives.</p>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND_BLUE};border-radius:0 0 28px 28px;padding:20px 28px;text-align:center">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700">${SCHOOL_NAME}</p>
              <p style="margin:5px 0 0;color:#cfe2ff;font-size:12px">Macampagne, Ngaliema · ${SCHOOL_TAGLINE}</p>
              <p style="margin:10px 0 0;color:#9fc2ea;font-size:11px">&copy; ${year} ${SCHOOL_SHORT_NAME}. Notification automatisee EduPay.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

export function getMessagingConfigStatus(): MessagingConfigStatus {
  return {
    email: {
      configured: hasSmtpConfig(),
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      from: env.SMTP_FROM || env.SMTP_USER,
      userConfigured: Boolean(env.SMTP_USER && env.SMTP_USER !== "school@example.com")
    },
    sms: {
      configured: hasSmsConfig(),
      providerUrl: env.AFRIKTALK_API_URL,
      usernameConfigured: Boolean(env.AFRIKTALK_USERNAME),
      sender: env.AFRIKTALK_SENDER
    }
  };
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
  const html = buildBrandedEmailHtml(input);

  if (!hasSmtpConfig()) {
    console.log(`[email:dry-run] To: ${input.to}\nSubject: ${input.subject}\n${input.text}\n\n[html]\n${html}`);
    return "SIMULATED";
  }

  try {
    await smtpTransport().sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: input.to,
      replyTo: env.SMTP_FROM || env.SMTP_USER,
      subject: input.subject,
      text: input.text,
      html
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
