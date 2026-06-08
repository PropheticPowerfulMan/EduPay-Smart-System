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
    fullName: "Rachel Kabongo",
    schoolId: "school-1"
  }
];

const OFFICIAL_DEMO_COUNTS = { parents: 29, students: 44, employees: 10 };
const unifiedParentNames = [
  ["Kabongo", "Rachel"], ["Mbuyi", "Mireille"], ["Lukusa", "Cedric"], ["Ilunga", "Nadine"], ["Tshibangu", "Patrick"],
  ["Mavungu", "Aline"], ["Kalala", "Samuel"], ["Moke", "Sarah"], ["Banza", "Grace"], ["Kanku", "David"],
  ["Mukendi", "Chantal"], ["Tshomba", "Daniel"], ["Mbala", "Esther"], ["Kasongo", "Joel"], ["Ngoy", "Carine"],
  ["Kitenge", "Fabrice"], ["Mulumba", "Ruth"], ["Nkulu", "Benedicte"], ["Beya", "Jonathan"], ["Lunda", "Prisca"],
  ["Tshimanga", "Arnaud"], ["Kayembe", "Rose"], ["Mutombo", "Lionel"], ["Kabasele", "Diane"], ["Nsimba", "Marc"],
  ["Mpoyi", "Sandrine"], ["Lwamba", "Eric"], ["Makiese", "Gloria"], ["Kalonji", "Herve"]
];
const unifiedStudentGivenNames = [
  "Elise", "David", "Amani", "Noah", "Naomi", "Ethan", "Sarah", "Joshua", "Deborah", "Samuel", "Rebecca",
  "Nathan", "Esther", "Daniel", "Merveille", "Joanna", "Grace", "Aaron", "Rachelle", "Jonathan", "Prisca",
  "Emmanuel", "Christelle", "Benjamin", "Ruth", "Joel", "Benedicte", "Isaac", "Naomie", "Joseph", "Judith",
  "Caleb", "Hadassa", "Ezekiel", "Miriam", "Levi", "Rachel", "Elie", "Abigail", "Matthieu", "Anne", "Simeon",
  "Tabitha", "Timothee"
];

function classIdForStudent(index: number) {
  if (index < 3) return `section-k${index + 3}`;
  return `section-grade-${((index - 3) % 12) + 1}`;
}

function buildUnifiedDemoDirectory() {
  const students: any[] = [];
  let studentIndex = 0;
  const parents = unifiedParentNames.map(([nom, prenom], parentIndex) => {
    const parentId = `PAR-KCS-${String(parentIndex + 1).padStart(3, "0")}`;
    const studentCount = parentIndex < 15 ? 2 : 1;
    Array.from({ length: studentCount }).forEach(() => {
      const current = studentIndex;
      studentIndex += 1;
      students.push({
        id: `STU-KCS-${String(current + 1).padStart(3, "0")}`,
        orbitId: `STU-KCS-${String(current + 1).padStart(3, "0")}`,
        displayId: `KCS-STU-${String(current + 1).padStart(3, "0")}`,
        studentNumber: `KCS-STU-${String(current + 1).padStart(3, "0")}`,
        parentId,
        classId: classIdForStudent(current),
        fullName: `${unifiedStudentGivenNames[current]} ${nom}`,
        annualFee: 1800 + ((current % 6) * 120),
        schoolId: "school-1",
        createdAt: `2026-01-${String((current % 24) + 2).padStart(2, "0")}T08:00:00.000Z`
      });
    });
    return {
      id: parentId,
      nom,
      postnom: "",
      prenom,
      fullName: `${prenom} ${nom}`,
      phone: `+243 812 45${String(parentIndex + 1).padStart(4, "0")}`,
      email: `${String(prenom).toLowerCase()}.${String(nom).toLowerCase()}@kcs.local`,
      schoolId: "school-1",
      userId: parentIndex === 0 ? "user-2" : null,
      preferredLanguage: "fr",
      physicalAddress: `Kinshasa - ${["Gombe", "Ngaliema", "Limete", "Lemba", "Kintambo"][parentIndex % 5]}`,
      createdAt: `2026-01-${String((parentIndex % 24) + 2).padStart(2, "0")}T07:30:00.000Z`
    };
  });
  return { parents, students };
}

const unifiedDemoDirectory = buildUnifiedDemoDirectory();
const mockParents: any[] = unifiedDemoDirectory.parents;

let parentCounter = OFFICIAL_DEMO_COUNTS.parents;

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

const mockStudents: any[] = unifiedDemoDirectory.students;

const mockEmployees: any[] = [
  ["EMP-KCS-001", "Mireille Ilunga", "Academique", "Teacher", "General", "TEACHING"],
  ["EMP-KCS-002", "Patrick Nsenga", "Administration", "Accountant", "", "ADMINISTRATIVE"],
  ["EMP-KCS-003", "Anita Mbuyi", "Academique", "Teacher", "Mathematiques", "TEACHING"],
  ["EMP-KCS-004", "Daniel Kayembe", "Finances", "Finance Officer", "", "ADMINISTRATIVE"],
  ["EMP-KCS-005", "Nadine Ilunga", "Administration", "Director", "", "ADMINISTRATIVE"],
  ["EMP-KCS-006", "Cedric Lukusa", "Academique", "Teacher", "Sciences", "TEACHING"],
  ["EMP-KCS-007", "Grace Banza", "Vie scolaire", "Student Life Officer", "", "ADMINISTRATIVE"],
  ["EMP-KCS-008", "Joel Kasongo", "Operations", "Logistics Officer", "", "STAFF"],
  ["EMP-KCS-009", "Carine Ngoy", "Academique", "Teacher", "Francais", "TEACHING"],
  ["EMP-KCS-010", "Herve Kalonji", "Technologie", "IT Officer", "", "STAFF"]
].map(([id, fullName, department, jobTitle, subject, employeeType], index) => ({
  id,
  orbitId: id,
  displayId: `KCS-EMP-${String(index + 1).padStart(3, "0")}`,
  employeeId: `KCS-EMP-${String(index + 1).padStart(3, "0")}`,
  fullName,
  email: `${String(fullName).toLowerCase().replace(/\s+/g, ".")}@kcs.local`,
  phone: `+243 899 56${String(index + 1).padStart(4, "0")}`,
  department,
  jobTitle,
  subject,
  employeeType,
  physicalAddress: "Kinshasa",
  externalIds: [{ appSlug: "edupay", externalId: id }, { appSlug: "savanex", externalId: id }],
  createdAt: `2026-01-${String(index + 2).padStart(2, "0")}T07:00:00.000Z`
}));

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

const mockPayments: any[] = mockParents.slice(0, 12).map((parent, index) => {
  const relatedStudents = mockStudents.filter((student) => student.parentId === parent.id);
  const completed = index % 4 !== 3;
  return {
    id: `payment-${String(index + 1).padStart(3, "0")}`,
    transactionNumber: `TXN-202604${String(index + 10).padStart(2, "0")}-${10001 + index}`,
    parentId: parent.id,
    reason: `Frais scolaires - ${relatedStudents[0]?.fullName || parent.fullName}`,
    amount: completed ? Math.round(relatedStudents.reduce((sum, student) => sum + Number(student.annualFee || 0), 0) * (0.35 + (index % 3) * 0.12)) : 0,
    amountInWords: "montant demo",
    method: ["CASH", "MPESA", "AIRTEL_MONEY"][index % 3],
    status: completed ? "COMPLETED" : "PENDING",
    createdAt: new Date(`2026-04-${String(index + 10).padStart(2, "0")}T10:00:00.000Z`),
    schoolId: "school-1",
    students: relatedStudents.map((student) => student.id)
  };
});

const mockFinanceAgreements: any[] = [];

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
    }))
    .sort((a, b) => compareByName(a, b));
  return { ...parent, students };
}

function compareByName(a: any, b: any) {
  return String(a.fullName || a.name || a.id || "").localeCompare(String(b.fullName || b.name || b.id || ""), "fr", { sensitivity: "base" });
}

function sortByName<T>(items: T[]) {
  return [...items].sort((a: any, b: any) => compareByName(a, b));
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function classNameFor(classId: string) {
  return (mockClasses.find((c) => c.id === classId) || {}).name || classId || "Classe non renseignee";
}

function studentForDirectory(student: any) {
  return {
    ...student,
    orbitId: student.orbitId || student.id,
    displayId: student.displayId || student.id,
    studentNumber: student.studentNumber || student.id,
    externalStudentId: student.externalStudentId || student.id,
    className: classNameFor(student.classId),
    parentId: student.parentId,
    annualFee: Number(student.annualFee) || 0,
    annualFeeDisplay: Number(student.annualFee) || 0,
    originalAnnualFee: Number(student.annualFee) || 0,
    reductionTotal: Number(student.reductionTotal) || 0,
    createdAt: student.createdAt || new Date().toISOString()
  };
}

function buildSharedDirectory() {
  const parents = sortByName(mockParents.map(parentWithStudents));
  const students = sortByName(mockStudents.map(studentForDirectory));
  const teachers = sortByName(mockEmployees);
  return {
    source: "edupay-demo",
    visibility: "shared-directory",
    counts: {
      families: parents.length,
      parents: parents.length,
      students: students.length,
      teachers: teachers.length
    },
    families: parents.map((parent) => ({
      id: parent.id,
      fullName: parent.fullName,
      parentIds: [parent.id],
      studentIds: parent.students.map((student: any) => student.id)
    })),
    parents,
    students,
    teachers
  };
}

function gradeGroupFor(classId: string) {
  const name = classNameFor(classId).toUpperCase();
  if (name.startsWith("K")) return "KINDERGARTEN";
  const grade = Number(name.match(/\d+/)?.[0] || 0);
  if (grade <= 5) return "PRIMARY";
  if (grade <= 8) return "MIDDLE_SCHOOL";
  return "HIGH_SCHOOL";
}

function paymentOptionLabel(paymentOptionType: string) {
  const labels: Record<string, string> = {
    STANDARD_MONTHLY: "Mensualite standard",
    THREE_INSTALLMENTS: "Paiement en 3 tranches",
    SPECIAL_OWNER_AGREEMENT: "Accord special parent-ecole",
    ANNUAL: "Paiement annuel"
  };
  return labels[paymentOptionType] || paymentOptionType;
}

function paymentShareForStudent(payment: any, student: any, siblings: any[]) {
  if (payment.status !== "COMPLETED") return 0;
  const studentIds = Array.isArray(payment.students) ? payment.students : [];
  if (studentIds.includes(student.id)) {
    const selectedCount = Math.max(studentIds.length, 1);
    return Number(payment.amount || 0) / selectedCount;
  }
  return 0;
}

function buildFinanceProfile(parentId: string) {
  const parent = mockParents.find((p) => p.id === parentId);
  if (!parent) return null;

  const students = mockStudents
    .filter((student) => student.parentId === parent.id)
    .map((student) => ({ ...student, className: classNameFor(student.classId) }));
  const parentPayments = mockPayments
    .filter((payment) => payment.parentId === parent.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const completedPayments = parentPayments.filter((payment) => payment.status === "COMPLETED");
  const pendingPayments = parentPayments.filter((payment) => payment.status === "PENDING");
  const failedPayments = parentPayments.filter((payment) => payment.status === "FAILED");

  const studentRows = students.map((student) => {
    const paid = roundMoney(parentPayments.reduce((sum, payment) => sum + paymentShareForStudent(payment, student, students), 0));
    const expectedTotal = roundMoney(Number(student.annualFee || 0));
    const balance = roundMoney(Math.max(expectedTotal - paid, 0));
    const paymentOptionType = student.paymentOptionType || "STANDARD_MONTHLY";
    return {
      id: student.id,
      fullName: student.fullName,
      className: student.className,
      gradeGroup: gradeGroupFor(student.classId),
      expectedTotal,
      originalAmount: expectedTotal,
      reductionTotal: 0,
      paid,
      balance,
      completionRate: expectedTotal > 0 ? roundMoney((paid / expectedTotal) * 100) : 0,
      overdueInstallments: balance > 0 ? 1 : 0,
      paymentOptionType,
      paymentOptionLabel: paymentOptionLabel(paymentOptionType),
      planName: paymentOptionLabel(paymentOptionType)
    };
  });

  const totalExpected = roundMoney(studentRows.reduce((sum, row) => sum + row.expectedTotal, 0));
  const totalPaid = roundMoney(completedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const totalDebt = roundMoney(Math.max(totalExpected - totalPaid, 0));
  const activeTuitionPlan = studentRows.length
    ? Array.from(new Set(studentRows.map((student) => student.planName))).join(" / ")
    : "Aucun plan actif";
  const debts = studentRows
    .filter((student) => student.balance > 0)
    .map((student) => ({
      id: `debt-${parent.id}-${student.id}`,
      title: `Solde scolaire - ${student.fullName}`,
      reason: "Frais scolaires restants",
      originalAmount: student.expectedTotal,
      amountRemaining: student.balance,
      status: "OPEN",
      academicYearId: "demo-2026",
      academicYearName: "2026-2027",
      carriedOverFromYearId: null,
      carriedOverFromYearName: null,
      dueDate: new Date(new Date().getFullYear(), 8, 30).toISOString(),
      settledAt: null,
      createdAt: new Date().toISOString()
    }));

  return {
    academicYear: {
      id: "demo-2026",
      name: "2026-2027",
      startDate: new Date(new Date().getFullYear(), 8, 1).toISOString(),
      endDate: new Date(new Date().getFullYear() + 1, 5, 30).toISOString()
    },
    parent: {
      id: parent.id,
      fullName: parent.fullName,
      phone: parent.phone || "",
      email: parent.email || "",
      preferredLanguage: parent.preferredLanguage || "fr"
    },
    profile: {
      id: `profile-${parent.id}`,
      activeTuitionPlan,
      activeTuitionPlanId: null,
      activeAgreementId: null,
      totalPaid,
      totalDebt,
      totalReduction: 0,
      carriedOverDebt: 0,
      overdueInstallments: debts.length,
      pendingPaymentsTotal: roundMoney(pendingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
      failedPaymentsTotal: roundMoney(failedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
      paymentBehaviorScore: totalExpected > 0 ? roundMoney(Math.max(0, 100 - (totalDebt / totalExpected) * 100)) : 100,
      lastPaymentAt: completedPayments[0]?.createdAt ? new Date(completedPayments[0].createdAt).toISOString() : null,
      childrenLinkedToAccount: students.length,
      expectedNetRevenue: totalExpected,
      completionRate: totalExpected > 0 ? roundMoney((totalPaid / totalExpected) * 100) : 0
    },
    students: studentRows,
    installments: [],
    reductions: [],
    debts,
    agreements: mockFinanceAgreements.filter((agreement) => agreement.parentId === parent.id),
    alerts: debts.length ? [{
      id: `alert-${parent.id}`,
      type: "PAYMENT_DELAY",
      title: "Solde parent a suivre",
      message: `${parent.fullName} a encore ${totalDebt.toFixed(2)} USD a regulariser.`,
      severity: totalDebt > 0 ? "HIGH" : "LOW",
      status: "OPEN",
      createdAt: new Date().toISOString()
    }] : [],
    paymentHistory: parentPayments.map((payment) => ({
      id: payment.id,
      transactionNumber: payment.transactionNumber,
      amount: Number(payment.amount || 0),
      reason: payment.reason || "Paiement",
      method: payment.method || "CASH",
      status: payment.status || "COMPLETED",
      createdAt: new Date(payment.createdAt).toISOString(),
      receiptNumber: payment.transactionNumber,
      allocationTrace: null,
      students: mockStudents
        .filter((student) => Array.isArray(payment.students) ? payment.students.includes(student.id) : student.parentId === parent.id)
        .map((student) => ({ id: student.id, fullName: student.fullName }))
    }))
  };
}

app.get("/api/parents", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const q = (req.query.search as string || "").toLowerCase();
  let list = sortByName(mockParents.map(parentWithStudents));
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
  const accessCode = `ACC-${id.slice(-6)}`;
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
    createdAt: new Date().toISOString(),
    accessCode
  };
  mockUsers.push({
    id: userId,
    email: email || `${id.toLowerCase()}@parent.local`,
    password: temporaryPassword,
    role: "PARENT",
    fullName: parentFullName,
    schoolId: "school-1",
    accessCode
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
    accessCode,
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
      if (!s.fullName) continue;
      if (s.id) {
        const existing = mockStudents.find((student) => student.id === s.id && student.parentId === req.params.id);
        if (existing) {
          existing.fullName = s.fullName;
          existing.classId = s.classId || existing.classId || "";
          existing.annualFee = Number(s.annualFee) || 0;
          existing.paymentOptionType = s.paymentOptionType || existing.paymentOptionType;
          existing.tuitionPlanName = s.tuitionPlanName || existing.tuitionPlanName;
        }
        continue;
      }
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
  return res.json(sortByName(mockStudents.map(studentForDirectory)));
});

app.put("/api/students/:id", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const student = mockStudents.find((item) => item.id === req.params.id || item.orbitId === req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });

  const parent = mockParents.find((item) => item.id === req.body?.parentId);
  if (req.body?.parentId && !parent) return res.status(404).json({ message: "Parent not found" });

  const nextClassId = String(req.body?.classId ?? student.classId ?? "");
  if (nextClassId && !mockClasses.some((item) => item.id === nextClassId)) {
    return res.status(400).json({ message: "Classe introuvable" });
  }

  student.fullName = String(req.body?.fullName ?? student.fullName).trim() || student.fullName;
  student.classId = nextClassId;
  student.parentId = parent?.id || student.parentId;
  student.annualFee = Number(req.body?.annualFee ?? student.annualFee) || 0;
  student.updatedAt = new Date().toISOString();

  return res.json({
    ...studentForDirectory(student),
    notificationStatus: {
      dashboard: "UPDATED",
      email: parent?.email ? "QUEUED" : "SKIPPED",
      sms: parent?.phone ? "QUEUED" : "SKIPPED",
      adminEmail: "QUEUED"
    }
  });
});

app.delete("/api/students/:id", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const idx = mockStudents.findIndex((item) => item.id === req.params.id || item.orbitId === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Student not found" });
  mockStudents.splice(idx, 1);
  return res.status(204).send();
});

// Routes: Classes
app.get("/api/classes", authGuard, (_req: any, res) => {
  return res.json(mockClasses);
});

// Routes: Shared directory
app.get("/api/shared-directory", authGuard, requireRole("ADMIN", "ACCOUNTANT", "HR_MANAGER", "OWNER", "SUPER_ADMIN"), (_req: any, res) => {
  return res.json(buildSharedDirectory());
});

app.get("/api/shared-directory/teachers", authGuard, requireRole("ADMIN", "ACCOUNTANT", "HR_MANAGER", "OWNER", "SUPER_ADMIN"), (_req: any, res) => {
  return res.json(sortByName(mockEmployees));
});

app.put("/api/shared-directory/teachers/:id", authGuard, requireRole("ADMIN", "HR_MANAGER", "OWNER", "SUPER_ADMIN"), (req: any, res) => {
  const employee = mockEmployees.find((item) => [item.id, item.orbitId, item.employeeId].includes(req.params.id));
  if (!employee) return res.status(404).json({ message: "Employee not found" });
  Object.assign(employee, {
    fullName: String(req.body?.fullName ?? employee.fullName),
    email: String(req.body?.email ?? employee.email ?? ""),
    phone: String(req.body?.phone ?? employee.phone ?? ""),
    physicalAddress: String(req.body?.physicalAddress ?? employee.physicalAddress ?? ""),
    department: String(req.body?.department ?? employee.department ?? ""),
    jobTitle: String(req.body?.jobTitle ?? employee.jobTitle ?? ""),
    subject: String(req.body?.subject ?? employee.subject ?? ""),
    employeeType: String(req.body?.employeeType ?? employee.employeeType ?? "TEACHING"),
    updatedAt: new Date().toISOString()
  });
  return res.json({
    ...employee,
    notificationStatus: { email: employee.email ? "QUEUED" : "SKIPPED", sms: employee.phone ? "QUEUED" : "SKIPPED", adminEmail: "QUEUED" }
  });
});

app.delete("/api/shared-directory/teachers/:id", authGuard, requireRole("ADMIN", "HR_MANAGER", "OWNER", "SUPER_ADMIN"), (req: any, res) => {
  const idx = mockEmployees.findIndex((item) => [item.id, item.orbitId, item.employeeId].includes(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Employee not found" });
  mockEmployees.splice(idx, 1);
  return res.status(204).send();
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
  const selectedStudentIds = Array.from(new Set(Array.isArray(studentIds) ? studentIds.filter(Boolean) : []));
  const parentStudents = mockStudents.filter((student) => student.parentId === resolvedParentId);
  const invalidStudentIds = selectedStudentIds.filter((studentId) => !parentStudents.some((student) => student.id === studentId));
  if (parentStudents.length > 0 && selectedStudentIds.length === 0) {
    return res.status(400).json({ message: "Selectionnez au moins un eleve pour ce paiement de scolarite." });
  }
  if (invalidStudentIds.length > 0) {
    return res.status(400).json({ message: "Un ou plusieurs eleves selectionnes ne sont pas rattaches a ce parent." });
  }
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
    students: selectedStudentIds
  };
  mockPayments.push(payment);
  const shouldNotify = notifyParent ?? paymentNotificationsEnabled;
  const relatedStudents = mockStudents.filter((s) => selectedStudentIds.includes(s.id));
  const notificationStatus = shouldNotify
    ? await sendDemoPaymentNotifications(payment, parent, relatedStudents)
    : { email: "DISABLED", sms: "DISABLED" };
  return res.status(201).json({ payment, receipt: { id: `receipt-${Date.now()}` }, notificationStatus });
});

app.get("/api/payments", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (_req: any, res) => {
  return res.json(mockPayments);
});

// Routes: Finance demo
app.get("/api/finance/catalog", authGuard, requireRole("ADMIN", "ACCOUNTANT", "PARENT"), (_req: any, res) => {
  return res.json({
    academicYear: {
      id: "demo-2026",
      name: "2026-2027",
      startDate: new Date(new Date().getFullYear(), 8, 1).toISOString(),
      endDate: new Date(new Date().getFullYear() + 1, 5, 30).toISOString()
    },
    plans: [
      { id: "plan-standard-monthly", paymentOptionType: "STANDARD_MONTHLY", gradeGroup: "PRIMARY", name: "Mensualite standard" },
      { id: "plan-three-installments", paymentOptionType: "THREE_INSTALLMENTS", gradeGroup: "PRIMARY", name: "Paiement en 3 tranches" },
      { id: "plan-owner-agreement", paymentOptionType: "SPECIAL_OWNER_AGREEMENT", gradeGroup: "CUSTOM", name: "Accord special parent-ecole" },
      { id: "plan-annual", paymentOptionType: "ANNUAL", gradeGroup: "PRIMARY", name: "Paiement annuel" }
    ]
  });
});

app.get("/api/finance/parents/:parentId/profile", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const profile = buildFinanceProfile(req.params.parentId);
  if (!profile) return res.status(404).json({ message: "Parent finance profile not found." });
  return res.json(profile);
});

app.get("/api/finance/me/profile", authGuard, requireRole("PARENT"), (req: any, res) => {
  const parent = mockParents.find((p) => p.userId === req.user?.sub);
  if (!parent) return res.status(404).json({ message: "Parent not found" });
  const profile = buildFinanceProfile(parent.id);
  if (!profile) return res.status(404).json({ message: "Parent finance profile not found." });
  return res.json(profile);
});

app.post("/api/finance/assignments", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const { parentId, studentId, paymentOptionType } = req.body || {};
  const parent = mockParents.find((p) => p.id === parentId);
  if (!parent) return res.status(404).json({ message: "Parent not found" });
  const targets = mockStudents.filter((student) =>
    student.parentId === parent.id && (!studentId || student.id === studentId)
  );
  for (const student of targets) {
    student.paymentOptionType = paymentOptionType || "STANDARD_MONTHLY";
  }
  return res.status(201).json({
    parentId: parent.id,
    assignedStudents: targets.length,
    paymentOptionType: paymentOptionType || "STANDARD_MONTHLY"
  });
});

app.post("/api/finance/agreements", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (req: any, res) => {
  const { parentId, studentId, title, customTotal, reductionAmount, status, installments } = req.body || {};
  const parent = mockParents.find((p) => p.id === parentId);
  if (!parent) return res.status(404).json({ message: "Parent not found" });
  const balanceDue = roundMoney((Number(customTotal || 0) - Number(reductionAmount || 0)));
  const agreement = {
    id: `agreement-${Date.now()}`,
    parentId,
    studentId,
    title: title || "Accord special",
    status: status || "PENDING_APPROVAL",
    customTotal: roundMoney(Number(customTotal || 0)),
    reductionAmount: roundMoney(Number(reductionAmount || 0)),
    balanceDue: Math.max(balanceDue, 0),
    paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
    gradeGroup: req.body?.gradeGroup || "CUSTOM",
    approvedAt: status === "APPROVED" ? new Date().toISOString() : null,
    approvalRequestedAt: new Date().toISOString(),
    notes: req.body?.notes || "",
    privateNotes: req.body?.privateNotes || "",
    installments: Array.isArray(installments) ? installments : [],
    createdAt: new Date().toISOString()
  };
  mockFinanceAgreements.push(agreement);
  const student = mockStudents.find((entry) => entry.id === studentId && entry.parentId === parent.id);
  if (student) student.paymentOptionType = "SPECIAL_OWNER_AGREEMENT";
  return res.status(201).json(agreement);
});

// Routes: Analytics
app.get("/api/analytics/overview", authGuard, requireRole("ADMIN", "ACCOUNTANT"), (_req: any, res) => {
  const totalRevenue = mockPayments.reduce((s, p) => s + (p.status === "COMPLETED" ? p.amount : 0), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = mockPayments.reduce(
    (sum, payment) => sum + (payment.status === "COMPLETED" && String(payment.createdAt || payment.date || "").slice(0, 7) === currentMonth ? payment.amount : 0),
    0
  );
  const paymentSuccessRate = mockPayments.length
    ? Math.round((mockPayments.filter((payment) => payment.status === "COMPLETED").length / mockPayments.length) * 100)
    : 0;
  const expectedRevenue = mockStudents.reduce((sum, student) => sum + Number(student.annualFee || 0), 0);
  const outstandingDebt = Math.max(expectedRevenue - totalRevenue, 0);
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
  const completedRevenue = mockPayments.reduce((sum, payment) => sum + (payment.status === "COMPLETED" ? Number(payment.amount || 0) : 0), 0);
  const expectedRevenue = mockStudents.reduce((sum, student) => sum + Number(student.annualFee || 0), 0);
  const unpaidRate = expectedRevenue > 0 ? Math.max(expectedRevenue - completedRevenue, 0) / expectedRevenue : 0;
  return res.json({
    anomalies: unpaidRate > 0 ? [{ scope: "all-classes", unpaid_rate: unpaidRate }] : [],
    suggestions: unpaidRate > 0 ? ["Send reminders to parents with remaining balances", "Review payment plan"] : ["No unpaid anomaly detected in demo data"],
    summary: unpaidRate > 0 ? "Unpaid balances detected from the loaded EduPay demo data" : "No unpaid balances detected from the loaded EduPay demo data"
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
