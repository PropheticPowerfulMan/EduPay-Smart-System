// Serveur Express simplifié sans Prisma - mode démo/développement
import cors from "cors";
import express, { Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { randomInt, timingSafeEqual } from "crypto";
import { sendEmail, sendSms } from "./src/utils/messaging";

const env = {
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-key-change-me-in-prod",
  API_PORT: process.env.API_PORT || "4000",
  FRONTEND_URL: process.env.FRONTEND_URL || "",
  ADMIN_RECOVERY_CODE: process.env.ADMIN_RECOVERY_CODE || ""
};

const app = express();

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://edupay-web.onrender.com"
]);

if (env.FRONTEND_URL) {
  allowedOrigins.add(env.FRONTEND_URL.replace(/\/$/, ""));
}

// Middleware
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
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Reessayez dans quelques minutes." }
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives de recuperation. Reessayez plus tard." }
});

// Mock Data
const mockUsers = [
  {
    id: "user-1",
    email: "admin@school.com",
    password: "password123",
    role: "ADMIN",
    fullName: "Admin User",
    schoolId: "school-1"
  },
  {
    id: "user-2",
    email: "parent@school.com",
    password: "password123",
    role: "PARENT",
    fullName: "Marie Dupont",
    schoolId: "school-1"
  }
];

const mockParents: any[] = [
  { id: "PAR-2025-0001", nom: "Dupont", postnom: "", prenom: "Marie", fullName: "Dupont Marie", phone: "+243 999 123 456", email: "marie@example.com", schoolId: "school-1", userId: "user-2", preferredLanguage: "fr", createdAt: new Date().toISOString() },
  { id: "PAR-2025-0002", nom: "Pierre", postnom: "Kalamba", prenom: "Jean", fullName: "Pierre Kalamba Jean", phone: "+243 999 234 567", email: "jean@example.com", schoolId: "school-1", userId: null, preferredLanguage: "fr", createdAt: new Date().toISOString() }
];

let parentCounter = 2;

function generateParentId() {
  parentCounter++;
  const year = new Date().getFullYear();
  return `PAR-${year}-${String(parentCounter).padStart(4, "0")}`;
}

function generateTemporaryPassword() {
  return `KCS-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
}

function buildParentWelcomeMessages(parent: any, password: string, email: string) {
  const children = parentWithStudents(parent).students;
  const childLines = children.length
    ? children.map((student: any) => `- ${student.fullName} (${student.className || student.classId})`).join("\n")
    : "- Aucun eleve rattache pour le moment";
  const subject = "Vos acces EduPay";
  const emailBody = [
    `Bonjour ${parent.fullName},`,
    "",
    "Votre compte parent EduPay vient d'etre cree.",
    "",
    `Identifiant parent: ${parent.id}`,
    `Telephone: ${parent.phone || "Non renseigne"}`,
    `Email de connexion: ${email}`,
    `Mot de passe temporaire: ${password}`,
    "",
    "Enfants rattaches:",
    childLines,
    "",
    "Pour votre securite, connectez-vous puis changez ce mot de passe depuis votre profil."
  ].join("\n");
  const smsBody = `EduPay: compte cree pour ${parent.fullName}. Email: ${email}. Mot de passe temporaire: ${password}. Changez-le apres connexion.`;
  return { subject, emailBody, smsBody };
}

async function sendParentWelcomeNotifications(parent: any, password: string, email: string) {
  const messages = buildParentWelcomeMessages(parent, password, email);
  const status = {
    email: parent.email ? "QUEUED" : "SKIPPED",
    sms: parent.phone ? "QUEUED" : "SKIPPED"
  };

  if (parent.email) {
    status.email = await sendEmail({
      to: parent.email,
      subject: messages.subject,
      text: messages.emailBody
    });
  }
  if (parent.phone) {
    status.sms = await sendSms({ to: parent.phone, text: messages.smsBody });
  }

  return status;
}

const mockStudents: any[] = [
  { id: "student-1", parentId: "PAR-2025-0001", classId: "section-grade-1", fullName: "Alice Dupont", annualFee: 500, schoolId: "school-1" },
  { id: "student-2", parentId: "PAR-2025-0001", classId: "section-grade-1", fullName: "Bob Dupont", annualFee: 500, schoolId: "school-1" },
  { id: "student-3", parentId: "PAR-2025-0002", classId: "section-grade-2", fullName: "Charlie Pierre", annualFee: 550, schoolId: "school-1" }
];

const mockClasses = [
  ...Array.from({ length: 3 }, (_v, index) => {
    const name = `K${index + 3}`;
    return { id: `section-${name.toLowerCase()}`, name, level: "Kindergarten", schoolId: "school-1" };
  }),
  ...Array.from({ length: 12 }, (_v, index) => {
    const grade = index + 1;
    return { id: `section-grade-${grade}`, name: `Grade ${grade}`, level: "Grade", schoolId: "school-1" };
  })
];

const mockPayments: any[] = [
  {
    id: "payment-1",
    transactionNumber: "TX-1000000-1234",
    parentId: "PAR-2025-0001",
    reason: "Monthly tuition",
    amount: 25000,
    amountInWords: "vingt-cinq mille dollars americains",
    method: "CASH",
    status: "COMPLETED",
    createdAt: new Date(),
    schoolId: "school-1",
    students: ["student-1", "student-2"]
  }
];

let paymentNotificationsEnabled = true;

function getPaymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: "Cash / Especes",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money"
  };
  return labels[method] ?? method;
}

function getPaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    COMPLETED: "Regle",
    PENDING: "En attente",
    FAILED: "Echoue"
  };
  return labels[status] ?? status;
}

async function sendDemoPaymentNotifications(payment: any, parent: any, students: any[]) {
  if (!parent) return { email: "SKIPPED", sms: "SKIPPED" };
  const amount = `$ ${Number(payment.amount || 0).toFixed(5)} USD`;
  const studentLines = students.length ? students.map((s) => `- ${s.fullName}`).join("\n") : "- Aucun eleve precise";
  const emailBody = [
    `Bonjour ${parent.fullName},`,
    "",
    "Un paiement vient d'etre enregistre dans EduPay.",
    "",
    `Transaction: ${payment.transactionNumber}`,
    `Date: ${new Date(payment.createdAt).toLocaleString("fr-FR")}`,
    `Motif: ${payment.reason}`,
    `Montant: ${amount}`,
    `Mode de paiement: ${getPaymentMethodLabel(payment.method)}`,
    `Statut: ${getPaymentStatusLabel(payment.status)}`,
    "",
    "Eleves concernes:",
    studentLines
  ].join("\n");
  const smsBody = `EduPay: paiement ${payment.transactionNumber}. Motif: ${payment.reason}. Montant: ${amount}. Statut: ${getPaymentStatusLabel(payment.status)}.`;
  return {
    email: parent.email
      ? await sendEmail({ to: parent.email, subject: "Paiement enregistre dans EduPay", text: emailBody })
      : "SKIPPED",
    sms: parent.phone ? await sendSms({ to: parent.phone, text: smsBody }) : "SKIPPED"
  };
}

// Routes: Auth
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const email = payload.email.trim().toLowerCase();
  const user = mockUsers.find((u) => u.email.toLowerCase() === email);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (!safeCompare(payload.password, user.password)) return res.status(401).json({ message: "Invalid credentials" });
  const token = jwt.sign({ sub: user.id, role: user.role, schoolId: user.schoolId }, env.JWT_SECRET);
  const parent = user.role === "PARENT" ? mockParents.find((item) => item.userId === user.id) : null;
  return res.json({ token, role: user.role, fullName: user.fullName, parentId: parent?.id, photoUrl: parent?.photoUrl || "" });
});

app.post("/api/auth/change-password", authGuard, (req: any, res) => {
  const payload = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  }).parse(req.body);
  const user = mockUsers.find((u) => u.id === req.user?.sub);
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
  if (user.password !== payload.currentPassword) return res.status(400).json({ message: "Mot de passe actuel incorrect" });
  user.password = payload.newPassword;
  return res.json({ message: "Mot de passe modifie avec succes." });
});

app.post("/api/auth/recover-admin-password", recoveryLimiter, async (req, res) => {
  const payload = z.object({
    email: z.string().email(),
    recoveryCode: z.string().min(12),
    newPassword: z.string().min(10)
  }).parse(req.body);

  if (!env.ADMIN_RECOVERY_CODE || env.ADMIN_RECOVERY_CODE.startsWith("CHANGE_ME")) {
    return res.status(503).json({ message: "La recuperation administrateur n'est pas configuree sur le serveur." });
  }
  if (payload.recoveryCode !== env.ADMIN_RECOVERY_CODE) {
    return res.status(401).json({ message: "Code de recuperation invalide." });
  }

  const user = mockUsers.find((u) => u.email.toLowerCase() === payload.email.trim().toLowerCase() && u.role === "ADMIN");
  if (!user) return res.status(404).json({ message: "Compte administrateur introuvable." });
  user.password = payload.newPassword;
  console.log(`[admin-recovery] Password reset for ${user.email}`);
  return res.json({ message: "Mot de passe administrateur reinitialise. Vous pouvez vous connecter." });
});

// Middleware: Auth Guard
function authGuard(req: any, res: Response, next: Function) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Not authenticated" });
  const token = header.replace("Bearer ", "").trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function requireRole(...roles: string[]) {
  return (req: any, res: Response, next: Function) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    return next();
  };
}

// Routes: Parents
app.get("/api/parents/me", authGuard, (req: any, res) => {
  if (req.user?.role !== "PARENT") {
    return res.status(403).json({ message: "Access denied" });
  }

  const parent = mockParents.find((p) => p.userId === req.user?.sub);
  if (!parent) return res.status(404).json({ message: "Parent not found" });
  const students = mockStudents.filter((s) => s.parentId === parent.id);
  const payments = mockPayments.filter((p) => p.parentId === parent.id);
  return res.json({
    ...parent,
    students: students.map((st) => ({
      ...st,
      payments: payments.filter((p) => p.students.includes(st.id))
    }))
  });
});

// Helper: attach students + className to each parent
function parentWithStudents(parent: any) {
  const students = mockStudents
    .filter((s) => s.parentId === parent.id)
    .map((s) => ({
      ...s,
      className: (mockClasses.find((c) => c.id === s.classId) || {}).name || s.classId
    }));
  return { ...parent, students };
}

app.get("/api/parents", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const q = (req.query.search as string || "").toLowerCase();
  let list = mockParents.map(parentWithStudents);
  if (q) {
    list = list.filter((p: any) =>
      p.fullName.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  }
  return res.json(list);
});

app.post("/api/parents", authGuard, requireRole("ADMIN", "ACCOUNTANT"), async (req: any, res) => {
  const { nom, postnom, prenom, fullName, phone, email, photoUrl, students: reqStudents } = req.body;
  const id = generateParentId();
  const temporaryPassword = generateTemporaryPassword();
  const userId = `user-parent-${Date.now()}`;
  const parentFullName = fullName || [nom, postnom, prenom].filter(Boolean).join(" ");
  const parent = {
    id,
    nom: nom || "",
    postnom: postnom || "",
    prenom: prenom || "",
    fullName: parentFullName,
    phone: phone || "",
    email: email || "",
    photoUrl: photoUrl || "",
    schoolId: "school-1",
    userId,
    preferredLanguage: "fr",
    createdAt: new Date().toISOString()
  };
  mockUsers.push({
    id: userId,
    email: email || `${id.toLowerCase()}@parent.local`,
    password: temporaryPassword,
    role: "PARENT",
    fullName: parentFullName,
    schoolId: "school-1"
  });
  mockParents.push(parent);
  // Add students if provided
  if (Array.isArray(reqStudents)) {
    for (const s of reqStudents) {
      if (!s.fullName) continue;
      mockStudents.push({
        id: `student-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        parentId: id,
        classId: s.classId || "",
        fullName: s.fullName,
        annualFee: Number(s.annualFee) || 0,
        schoolId: "school-1"
      });
    }
  }
  const notificationStatus = await sendParentWelcomeNotifications(parent, temporaryPassword, email || `${id.toLowerCase()}@parent.local`);
  return res.status(201).json({
    ...parentWithStudents(parent),
    temporaryPassword,
    notificationStatus
  });
});

app.put("/api/parents/me/photo", authGuard, (req: any, res) => {
  if (req.user?.role !== "PARENT") {
    return res.status(403).json({ message: "Access denied" });
  }
  const payload = z.object({ photoUrl: z.string().max(750_000).optional().default("") }).parse(req.body);
  const parent = mockParents.find((p) => p.userId === req.user?.sub);
  if (!parent) return res.status(404).json({ message: "Parent not found" });
  parent.photoUrl = payload.photoUrl;
  return res.json({ photoUrl: parent.photoUrl || "" });
});

app.post("/api/parents/:id/reset-password", authGuard, (req: any, res) => {
  if (!["ADMIN", "ACCOUNTANT"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  const parent = mockParents.find((p) => p.id === req.params.id);
  if (!parent) return res.status(404).json({ message: "Parent not found" });
  const temporaryPassword = generateTemporaryPassword();
  let user = mockUsers.find((u) => u.id === parent.userId);
  if (!user) {
    const userId = `user-parent-${Date.now()}`;
    parent.userId = userId;
    user = {
      id: userId,
      email: parent.email || `${parent.id.toLowerCase()}@parent.local`,
      password: temporaryPassword,
      role: "PARENT",
      fullName: parent.fullName,
      schoolId: parent.schoolId
    };
    mockUsers.push(user);
  } else {
    user.password = temporaryPassword;
    user.email = parent.email || user.email;
    user.fullName = parent.fullName;
  }
  return res.json({ parentId: parent.id, email: user.email, temporaryPassword });
});

app.put("/api/parents/:id", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const idx = mockParents.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Parent not found" });
  const { nom, postnom, prenom, fullName, phone, email, photoUrl, students: reqStudents } = req.body;
  mockParents[idx] = {
    ...mockParents[idx],
    nom: nom ?? mockParents[idx].nom,
    postnom: postnom ?? mockParents[idx].postnom,
    prenom: prenom ?? mockParents[idx].prenom,
    fullName: fullName || [nom, postnom, prenom].filter(Boolean).join(" "),
    phone: phone ?? mockParents[idx].phone,
    email: email ?? mockParents[idx].email,
    photoUrl: photoUrl ?? mockParents[idx].photoUrl
  };
  // Replace students: remove old ones, add new ones
  if (Array.isArray(reqStudents)) {
    // Remove existing students for this parent that are NOT in the request (not by id match — full replace)
    const keepIds = (reqStudents as any[]).filter((s) => s.id).map((s) => s.id);
    // Remove students no longer listed
    for (let i = mockStudents.length - 1; i >= 0; i--) {
      if (mockStudents[i].parentId === req.params.id && !keepIds.includes(mockStudents[i].id)) {
        mockStudents.splice(i, 1);
      }
    }
    // Add new students (those without an id)
    for (const s of reqStudents as any[]) {
      if (s.id) continue; // existing, keep as-is
      if (!s.fullName) continue;
      mockStudents.push({
        id: `student-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        parentId: req.params.id,
        classId: s.classId || "",
        fullName: s.fullName,
        annualFee: Number(s.annualFee) || 0,
        schoolId: "school-1"
      });
    }
  }
  return res.json(parentWithStudents(mockParents[idx]));
});

app.delete("/api/parents/:id", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const idx = mockParents.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Parent not found" });
  mockParents.splice(idx, 1);
  // Also remove students
  for (let i = mockStudents.length - 1; i >= 0; i--) {
    if (mockStudents[i].parentId === req.params.id) mockStudents.splice(i, 1);
  }
  return res.status(204).send();
});

// Routes: Students
app.get("/api/students", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (_req: any, res) => {
  return res.json(mockStudents);
});

// Routes: Classes
app.get("/api/classes", authGuard, (_req: any, res) => {
  return res.json(mockClasses);
});

// Routes: Payments
app.get("/api/payments/settings/notifications", authGuard, (req: any, res) => {
  if (!["ADMIN", "ACCOUNTANT"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  return res.json({ paymentNotificationsEnabled });
});

app.put("/api/payments/settings/notifications", authGuard, (req: any, res) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }
  paymentNotificationsEnabled = Boolean(req.body?.paymentNotificationsEnabled);
  return res.json({ paymentNotificationsEnabled });
});

app.post("/api/payments", authGuard, requireRole("ADMIN", "ACCOUNTANT"), async (req: any, res) => {
  const { parentId, parentFullName, studentIds, reason, amount, method, status, transactionNumber, notifyParent } = req.body;
  const parent = mockParents.find((p) => p.id === parentId || p.fullName === parentFullName);
  const resolvedParentId = parentId || parent?.id;
  const payment = {
    id: `payment-${Date.now()}`,
    transactionNumber: transactionNumber || `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    parentId: resolvedParentId,
    parentFullName: parentFullName || parent?.fullName,
    reason,
    amount,
    amountInWords: `${amount} dollars americains`,
    method,
    status: status || "COMPLETED",
    createdAt: new Date(),
    schoolId: "school-1",
    students: studentIds
  };
  mockPayments.push(payment);
  const shouldNotify = notifyParent ?? paymentNotificationsEnabled;
  const relatedStudents = mockStudents.filter((s) => Array.isArray(studentIds) ? studentIds.includes(s.id) : s.parentId === resolvedParentId);
  const notificationStatus = shouldNotify
    ? await sendDemoPaymentNotifications(payment, parent, relatedStudents)
    : { email: "DISABLED", sms: "DISABLED" };
  return res.status(201).json({ payment, receipt: { id: `receipt-${Date.now()}` }, notificationStatus });
});

app.get("/api/payments", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (_req: any, res) => {
  return res.json(mockPayments);
});

// Routes: Analytics
app.get("/api/analytics/overview", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (_req: any, res) => {
  const totalRevenue = mockPayments.reduce((s, p) => s + (p.status === "COMPLETED" ? p.amount : 0), 0);
  const monthlyRevenue = totalRevenue * 0.3;
  const paymentSuccessRate = 85;
  const outstandingDebt = 450000;
  return res.json({ totalRevenue, monthlyRevenue, paymentSuccessRate, outstandingDebt });
});

// Routes: AI Assistant
app.post("/api/ai/assistant", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const { query } = req.body;
  return res.json({
    answer: "Query understood. Here is your answer from the AI assistant.",
    suggestions: ["Try another question", "Check dashboard insights"]
  });
});

app.get("/api/ai/insights", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (_req: any, res) => {
  return res.json({
    anomalies: [{ class: "Grade 3", unpaid_rate: 0.40 }],
    suggestions: ["Send reminder to 25 parents", "Review payment plan"],
    summary: "High unpaid rates detected in Grade 3"
  });
});

// Routes: Notifications (stub)
app.post("/api/notifications/send", authGuard, requireRole("ADMIN", "ACCOUNTANT"), async (req: any, res) => {
  const payload = z.object({
    parentId: z.string(),
    channel: z.enum(["SMS", "EMAIL"]),
    subject: z.string().optional(),
    body: z.string().min(3)
  }).parse(req.body);
  const parent = mockParents.find((p) => p.id === payload.parentId);
  if (!parent) return res.status(404).json({ message: "Parent introuvable" });

  const status = payload.channel === "EMAIL"
    ? await sendEmail({
      to: parent.email,
      subject: payload.subject || "Notification EduPay",
      text: payload.body
    })
    : await sendSms({ to: parent.phone, text: payload.body });

  return res.status(201).json({ id: `log-${Date.now()}`, status });
});

// Routes: Forgot password (always responds success to avoid leaking account existence)
app.post("/api/auth/forgot-password", async (req: any, res) => {
  const { email } = req.body;
  const user = mockUsers.find((item) => item.email.toLowerCase() === String(email || "").trim().toLowerCase());
  if (user) {
    await sendEmail({
      to: user.email,
      subject: "Recuperation de mot de passe EduPay",
      text: `Bonjour ${user.fullName},\n\nUne demande de recuperation de mot de passe a ete recue pour votre compte EduPay.\nContactez l'administration si vous n'etes pas a l'origine de cette demande.`
    });
  }
  return res.json({ message: "If this email exists, a reset link was sent." });
});

// Health check
app.get("/health", (_req, res) => {
  return res.json({ status: "ok", service: "api-simplified" });
});

app.listen(Number(env.API_PORT), () => {
  console.log(`✓ API server running on http://localhost:${env.API_PORT}`);
  console.log(`✓ Admin login: admin@school.com / password123`);
  console.log(`✓ Parent login: parent@school.com / password123`);
});
