import { schoolBranding } from "../config/branding";

export type PaymentMethodCode = "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY";
export type PaymentStatusCode = "COMPLETED" | "PENDING" | "FAILED";

export type ReceiptVerificationInput = {
  transactionNumber: string;
  date: string;
  parentFullName: string;
  paymentSubjectName?: string;
  studentNames?: string[];
  reason: string;
  amount: number;
  amountWords: string;
  method: PaymentMethodCode;
  status: PaymentStatusCode;
};

export type ReceiptVerificationRecord = {
  type: "EDUPAY_RECEIPT";
  version: 1;
  issuer: {
    schoolName: string;
    shortName: string;
    appName: string;
    tagline: string;
  };
  transaction: {
    transactionNumber: string;
    date: string;
    amount: string;
    currency: "USD";
    amountWords: string;
    reason: string;
    methodCode: PaymentMethodCode;
    methodLabel: string;
    statusCode: PaymentStatusCode;
    statusLabel: string;
  };
  parties: {
    parentFullName: string;
    paymentSubjectName: string;
    parentCaption: string;
    studentNames: string[];
  };
  security: {
    verificationCode: string;
    sealCode: string;
    hash: string;
  };
};

export function getReceiptMethodLabel(method: PaymentMethodCode) {
  const methodLabel: Record<PaymentMethodCode, string> = {
    CASH: "Cash / Espèces",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money"
  };
  return methodLabel[method] ?? method;
}

export function getReceiptStatusLabel(status: PaymentStatusCode) {
  const statusLabel: Record<PaymentStatusCode, string> = {
    COMPLETED: "Réglé",
    PENDING: "En attente",
    FAILED: "Échoué"
  };
  return statusLabel[status] ?? status;
}

export function getReceiptSubjectName(payment: Pick<ReceiptVerificationInput, "paymentSubjectName" | "studentNames" | "parentFullName">) {
  if (payment.paymentSubjectName?.trim()) return payment.paymentSubjectName;
  if ((payment.studentNames?.length ?? 0) > 0) return payment.studentNames!.join(" / ");
  return payment.parentFullName;
}

export function getReceiptParentCaption(payment: Pick<ReceiptVerificationInput, "paymentSubjectName" | "studentNames" | "parentFullName">) {
  const parentName = payment.parentFullName.trim();
  if (!parentName) return "";
  const subjectName = getReceiptSubjectName(payment).trim();
  return parentName.localeCompare(subjectName, undefined, { sensitivity: "accent" }) === 0 ? "" : parentName;
}

function makeSecurityHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function buildReceiptSecurity(input: ReceiptVerificationInput) {
  const payload = [
    input.transactionNumber,
    input.date,
    getReceiptSubjectName(input).trim().toUpperCase(),
    input.reason.trim().toUpperCase(),
    input.amount.toFixed(5),
    input.method,
    input.status
  ].join("|");
  const hash = makeSecurityHash(payload);
  return {
    hash,
    verificationCode: `EDP-${hash.slice(0, 4)}-${hash.slice(4, 8)}`,
    sealCode: makeSecurityHash(`${hash}|EduPay|A5|Official`).slice(0, 6)
  };
}

export function buildReceiptVerificationRecord(input: ReceiptVerificationInput): ReceiptVerificationRecord {
  const security = buildReceiptSecurity(input);
  return {
    type: "EDUPAY_RECEIPT",
    version: 1,
    issuer: {
      schoolName: schoolBranding.schoolName,
      shortName: schoolBranding.shortName,
      appName: schoolBranding.appName,
      tagline: schoolBranding.tagline
    },
    transaction: {
      transactionNumber: input.transactionNumber,
      date: input.date,
      amount: input.amount.toFixed(5),
      currency: "USD",
      amountWords: input.amountWords,
      reason: input.reason,
      methodCode: input.method,
      methodLabel: getReceiptMethodLabel(input.method),
      statusCode: input.status,
      statusLabel: getReceiptStatusLabel(input.status)
    },
    parties: {
      parentFullName: input.parentFullName,
      paymentSubjectName: getReceiptSubjectName(input),
      parentCaption: getReceiptParentCaption(input),
      studentNames: input.studentNames ?? []
    },
    security
  };
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildReceiptVerificationUrl(
  input: ReceiptVerificationInput,
  locationLike: Pick<Location, "origin" | "pathname"> = window.location
) {
  const token = encodeBase64Url(JSON.stringify(buildReceiptVerificationRecord(input)));
  return `${locationLike.origin}${locationLike.pathname}#/receipt/verify?d=${encodeURIComponent(token)}`;
}

export function parseReceiptVerificationToken(token: string | null) {
  if (!token) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(token)) as ReceiptVerificationRecord;
    if (parsed.type !== "EDUPAY_RECEIPT" || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function validateReceiptVerificationRecord(record: ReceiptVerificationRecord) {
  const expected = buildReceiptSecurity({
    transactionNumber: record.transaction.transactionNumber,
    date: record.transaction.date,
    parentFullName: record.parties.parentFullName,
    paymentSubjectName: record.parties.paymentSubjectName,
    studentNames: record.parties.studentNames,
    reason: record.transaction.reason,
    amount: Number(record.transaction.amount),
    amountWords: record.transaction.amountWords,
    method: record.transaction.methodCode,
    status: record.transaction.statusCode
  });

  return {
    valid:
      expected.hash === record.security.hash
      && expected.verificationCode === record.security.verificationCode
      && expected.sealCode === record.security.sealCode,
    expected
  };
}