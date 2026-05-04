// Serveur Express simplifié sans Prisma - mode démo/développement
import cors from "cors";
import express, { Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { z } from "zod";

const env = {
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-key-change-me-in-prod",
  API_PORT: process.env.API_PORT || "4000"
};

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Mock Data
const mockUsers = [
  {
    id: "user-1",
    email: "admin@school.com",
    passwordHash: bcrypt.hashSync("password123", 10),
    role: "ADMIN",
    fullName: "Admin User",
    schoolId: "school-1"
  },
  {
    id: "user-2",
    email: "parent@school.com",
    passwordHash: bcrypt.hashSync("password123", 10),
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

const mockStudents: any[] = [
  { id: "student-1", parentId: "PAR-2025-0001", classId: "class-1", fullName: "Alice Dupont", annualFee: 50000, schoolId: "school-1" },
  { id: "student-2", parentId: "PAR-2025-0001", classId: "class-1", fullName: "Bob Dupont", annualFee: 50000, schoolId: "school-1" },
  { id: "student-3", parentId: "PAR-2025-0002", classId: "class-2", fullName: "Charlie Pierre", annualFee: 55000, schoolId: "school-1" }
];

const mockClasses = [
  { id: "class-1", name: "Grade 1", level: "1st", schoolId: "school-1" },
  { id: "class-2", name: "Grade 2", level: "2nd", schoolId: "school-1" }
];

const mockPayments: any[] = [
  {
    id: "payment-1",
    transactionNumber: "TX-1000000-1234",
    parentId: "PAR-2025-0001",
    reason: "Monthly tuition",
    amount: 25000,
    amountInWords: "vingt-cinq mille",
    method: "CASH",
    status: "COMPLETED",
    createdAt: new Date(),
    schoolId: "school-1",
    students: ["student-1", "student-2"]
  }
];

// Routes: Auth
const loginSchema = z.object({ email: z.string().email(), password: z.string() });

app.post("/api/auth/login", async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const user = mockUsers.find((u) => u.email === payload.email);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const ok = await bcrypt.compare(payload.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });
  const token = jwt.sign({ sub: user.id, role: user.role, schoolId: user.schoolId }, env.JWT_SECRET);
  return res.json({ token, role: user.role, fullName: user.fullName });
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

app.get("/api/parents", authGuard, (req: any, res) => {
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

app.post("/api/parents", authGuard, (req: any, res) => {
  const { nom, postnom, prenom, fullName, phone, email, students: reqStudents } = req.body;
  const id = generateParentId();
  const parent = {
    id,
    nom: nom || "",
    postnom: postnom || "",
    prenom: prenom || "",
    fullName: fullName || [nom, postnom, prenom].filter(Boolean).join(" "),
    phone: phone || "",
    email: email || "",
    schoolId: "school-1",
    userId: null,
    preferredLanguage: "fr",
    createdAt: new Date().toISOString()
  };
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
  return res.status(201).json(parentWithStudents(parent));
});

app.put("/api/parents/:id", authGuard, (req: any, res) => {
  const idx = mockParents.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Parent not found" });
  const { nom, postnom, prenom, fullName, phone, email, students: reqStudents } = req.body;
  mockParents[idx] = {
    ...mockParents[idx],
    nom: nom ?? mockParents[idx].nom,
    postnom: postnom ?? mockParents[idx].postnom,
    prenom: prenom ?? mockParents[idx].prenom,
    fullName: fullName || [nom, postnom, prenom].filter(Boolean).join(" "),
    phone: phone ?? mockParents[idx].phone,
    email: email ?? mockParents[idx].email
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

app.delete("/api/parents/:id", authGuard, (req: any, res) => {
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
app.get("/api/students", authGuard, (_req: any, res) => {
  return res.json(mockStudents);
});

// Routes: Classes
app.get("/api/classes", authGuard, (_req: any, res) => {
  return res.json(mockClasses);
});

// Routes: Payments
app.post("/api/payments", authGuard, (req: any, res) => {
  const { parentId, studentIds, reason, amount, method } = req.body;
  const payment = {
    id: `payment-${Date.now()}`,
    transactionNumber: `TX-${Date.now()}-${Math.random() * 10000}`,
    parentId,
    reason,
    amount,
    amountInWords: `${amount} (words placeholder)`,
    method,
    status: "COMPLETED",
    createdAt: new Date(),
    schoolId: "school-1",
    students: studentIds
  };
  mockPayments.push(payment);
  return res.status(201).json({ payment, receipt: { id: `receipt-${Date.now()}` } });
});

app.get("/api/payments", authGuard, (_req: any, res) => {
  return res.json(mockPayments);
});

// Routes: Analytics
app.get("/api/analytics/overview", authGuard, (_req: any, res) => {
  const totalRevenue = mockPayments.reduce((s, p) => s + (p.status === "COMPLETED" ? p.amount : 0), 0);
  const monthlyRevenue = totalRevenue * 0.3;
  const paymentSuccessRate = 85;
  const outstandingDebt = 450000;
  return res.json({ totalRevenue, monthlyRevenue, paymentSuccessRate, outstandingDebt });
});

// Routes: AI Assistant
app.post("/api/ai/assistant", authGuard, (req: any, res) => {
  const { query } = req.body;
  return res.json({
    answer: "Query understood. Here is your answer from the AI assistant.",
    suggestions: ["Try another question", "Check dashboard insights"]
  });
});

app.get("/api/ai/insights", authGuard, (_req: any, res) => {
  return res.json({
    anomalies: [{ class: "Grade 3", unpaid_rate: 0.40 }],
    suggestions: ["Send reminder to 25 parents", "Review payment plan"],
    summary: "High unpaid rates detected in Grade 3"
  });
});

// Routes: Notifications (stub)
app.post("/api/notifications/send", authGuard, (req: any, res) => {
  return res.status(201).json({ id: `log-${Date.now()}`, status: "SENT" });
});

// Routes: Forgot password (always responds success to avoid leaking account existence)
app.post("/api/auth/forgot-password", (req: any, res) => {
  const { email } = req.body;
  // In production this would send a real email with a reset link.
  // For demo we just acknowledge the request.
  console.log(`[forgot-password] Reset requested for: ${email || "unknown"}`);
  return res.json({ message: "If this email exists, a reset link was sent." });
});

// Health check
app.get("/health", (_req, res) => {
  return res.json({ status: "ok", service: "api-simplified" });
});

app.listen(Number(env.API_PORT), () => {
  console.log(`✓ API server running on http://localhost:${env.API_PORT}`);
  console.log(`✓ Default login: admin@school.com / password123`);
  console.log(`✓ Parent login: parent@school.com / password123`);
});
