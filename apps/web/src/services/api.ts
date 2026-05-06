const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "edupay_token";
const ROLE_STORAGE_KEY = "edupay_role";
const NAME_STORAGE_KEY = "edupay_name";
const PARENT_ID_STORAGE_KEY = "edupay_parent_id";
const SESSION_ACTIVE_KEY = "edupay_session_active";
const DEMO_PARENTS_KEY = "edupay_demo_parents_v2";
const DEMO_PAYMENTS_KEY = "edupay_payments_v3";
const DEMO_NOTIFICATIONS_KEY = "edupay-payment-notifications-enabled";
const DEMO_PARENT_CREDENTIALS_KEY = "edupay_demo_parent_credentials_v1";
const DEMO_FALLBACK_ENABLED = (import.meta.env.VITE_ENABLE_DEMO_FALLBACK ?? "").trim().toLowerCase() === "true";
const STATIC_APP_FALLBACK_ENABLED = ["demo", "github-pages", "pages"].includes((import.meta.env.VITE_ENVIRONMENT ?? "").trim().toLowerCase());
const PLACEHOLDER_API_URL = /MON-BACKEND|example\.com/i.test(API_BASE_URL);
const LOCAL_API_FALLBACK_ENABLED =
  DEMO_FALLBACK_ENABLED ||
  STATIC_APP_FALLBACK_ENABLED ||
  PLACEHOLDER_API_URL ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL);

type DemoStudent = { id: string; fullName: string; classId: string; className: string; annualFee: number; payments?: DemoPayment[] };
type DemoParent = { id: string; nom: string; postnom: string; prenom: string; fullName: string; phone: string; email: string; photoUrl?: string; students: DemoStudent[]; createdAt: string };
type DemoPayment = { id: string; transactionNumber: string; parentId?: string; parentFullName: string; reason: string; method: string; amount: number; status: string; createdAt: string; date: string };
type DemoParentCredential = { parentId: string; email: string; password: string };

const demoClasses = [
  ...Array.from({ length: 5 }, (_v, index) => ({ id: `section-k${index + 1}`, name: `K${index + 1}` })),
  ...Array.from({ length: 12 }, (_v, index) => ({ id: `section-grade-${index + 1}`, name: `Grade ${index + 1}` }))
];

const seedParents: DemoParent[] = [
  {
    id: "PAR-KCS-RACHEL-KABONGO",
    nom: "Kabongo",
    postnom: "",
    prenom: "Rachel",
    fullName: "Rachel Kabongo",
    phone: "+243 812 450 221",
    email: "rachel.kabongo@kcs.local",
    createdAt: new Date().toISOString(),
    students: [
      { id: "STU-KCS-ELISE-KABONGO", fullName: "Elise Kabongo", classId: "section-grade-11", className: "Grade 11A", annualFee: 2200 },
      { id: "STU-KCS-DAVID-KABONGO", fullName: "David Kabongo", classId: "section-grade-8", className: "Grade 8B", annualFee: 1800 }
    ]
  },
  {
    id: "PAR-KCS-MIREILLE-MBUYI",
    nom: "Mbuyi",
    postnom: "",
    prenom: "Mireille",
    fullName: "Mireille Mbuyi",
    phone: "+243 899 120 882",
    email: "mireille.mbuyi@kcs.local",
    createdAt: new Date().toISOString(),
    students: [
      { id: "STU-KCS-AMANI-MBUYI", fullName: "Amani Mbuyi", classId: "section-grade-10", className: "Grade 10A", annualFee: 2400 }
    ]
  }
];

const seedPayments: DemoPayment[] = [
  { id: "pay-1", transactionNumber: "TXN-20260420-10001", parentId: "PAR-KCS-RACHEL-KABONGO", parentFullName: "Rachel Kabongo", reason: "Frais scolaires - Elise Kabongo", method: "CASH", amount: 1600, status: "COMPLETED", createdAt: new Date().toISOString(), date: new Date().toLocaleString("fr-FR") },
  { id: "pay-2", transactionNumber: "TXN-20260421-10002", parentId: "PAR-KCS-RACHEL-KABONGO", parentFullName: "Rachel Kabongo", reason: "Frais scolaires - David Kabongo", method: "MPESA", amount: 980, status: "COMPLETED", createdAt: new Date().toISOString(), date: new Date().toLocaleString("fr-FR") },
  { id: "pay-3", transactionNumber: "TXN-20260422-10003", parentId: "PAR-KCS-MIREILLE-MBUYI", parentFullName: "Mireille Mbuyi", reason: "Frais scolaires - Amani Mbuyi", method: "MPESA", amount: 800, status: "PENDING", createdAt: new Date().toISOString(), date: new Date().toLocaleString("fr-FR") }
];

function clearLocalSession() {
  sessionStorage.removeItem(SESSION_ACTIVE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(NAME_STORAGE_KEY);
  localStorage.removeItem(PARENT_ID_STORAGE_KEY);
  localStorage.removeItem("edupay_fullName");
}

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getDemoParents() {
  const parents = readJson<DemoParent[]>(DEMO_PARENTS_KEY, seedParents);
  writeJson(DEMO_PARENTS_KEY, parents);
  return parents;
}

function getDemoPayments() {
  const payments = readJson<DemoPayment[]>(DEMO_PAYMENTS_KEY, seedPayments);
  writeJson(DEMO_PAYMENTS_KEY, payments);
  return payments;
}

function getDemoParentCredentials() {
  const credentials = readJson<DemoParentCredential[]>(DEMO_PARENT_CREDENTIALS_KEY, []);
  writeJson(DEMO_PARENT_CREDENTIALS_KEY, credentials);
  return credentials;
}

function saveDemoParentCredential(credential: DemoParentCredential) {
  const email = credential.email.trim().toLowerCase();
  const credentials = getDemoParentCredentials().filter((item) => item.email.trim().toLowerCase() !== email);
  writeJson(DEMO_PARENT_CREDENTIALS_KEY, [{ ...credential, email }, ...credentials]);
}

function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return {} as Record<string, unknown>;
  try { return JSON.parse(init.body) as Record<string, unknown>; } catch { return {}; }
}

function overview() {
  const payments = getDemoPayments();
  const parents = getDemoParents();
  const totalExpected = parents.reduce((sum, parent) => sum + parent.students.reduce((s, st) => s + Number(st.annualFee || 0), 0), 0);
  const completed = payments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + payment.amount, 0);
  return {
    totalRevenue: completed,
    monthlyRevenue: completed,
    paymentSuccessRate: payments.length ? (payments.filter((p) => p.status === "COMPLETED").length / payments.length) * 100 : 0,
    outstandingDebt: Math.max(totalExpected - completed, 0)
  };
}

function parentMe() {
  const parents = getDemoParents();
  const parentId = localStorage.getItem(PARENT_ID_STORAGE_KEY);
  const fullName = localStorage.getItem(NAME_STORAGE_KEY);
  const parent = parents.find((item) => item.id === parentId)
    ?? parents.find((item) => item.fullName === fullName)
    ?? parents[0];
  const payments = getDemoPayments().filter((payment) => payment.parentId === parent.id || payment.parentFullName === parent.fullName);
  return {
    id: parent.id,
    fullName: parent.fullName,
    phone: parent.phone,
    email: parent.email,
    photoUrl: parent.photoUrl || "",
    students: parent.students.map((student) => ({ ...student, payments }))
  };
}

async function demoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = parseBody(init);

  await new Promise((resolve) => setTimeout(resolve, 80));

  if (normalizedPath === "/api/auth/login" && method === "POST") {
    const email = String(body.email ?? "").toLowerCase();
    const password = String(body.password ?? "");
    if (email === "parent@school.com" && password === "password123") {
      const parent = getDemoParents().find((item) => item.id === "PAR-KCS-RACHEL-KABONGO");
      return { token: "demo-parent-token", role: "PARENT", fullName: "Rachel Kabongo", parentId: "PAR-KCS-RACHEL-KABONGO", photoUrl: parent?.photoUrl || "" } as T;
    }

    const credential = getDemoParentCredentials().find((item) => item.email === email && item.password === password);
    if (credential) {
      const parent = getDemoParents().find((item) => item.id === credential.parentId);
      if (parent) {
        return {
          token: `demo-parent-token-${parent.id}`,
          role: "PARENT",
          fullName: parent.fullName,
          parentId: parent.id,
          photoUrl: parent.photoUrl || ""
        } as T;
      }
    }

    if (email === "admin@school.com" && password === "password123") {
      return { token: "local-admin-token", role: "ADMIN", fullName: "Administrateur" } as T;
    }

    throw new Error("Identifiants invalides.");
  }

  if (normalizedPath === "/api/auth/forgot-password") return { message: "OK" } as T;
  if (normalizedPath === "/api/auth/change-password") return { message: "OK" } as T;
  if (normalizedPath === "/api/auth/recover-admin-password" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const recoveryCode = String(body.recoveryCode ?? "");
    const newPassword = String(body.newPassword ?? "");
    const configuredCode = String(import.meta.env.VITE_ADMIN_RECOVERY_CODE ?? "");
    if (!configuredCode || configuredCode.startsWith("CHANGE_ME")) {
      throw new Error("La recuperation administrateur n'est pas configuree.");
    }
    if (recoveryCode !== configuredCode || email !== "admin@school.com" || newPassword.length < 10) {
      throw new Error("Informations de recuperation invalides.");
    }
    return { message: "Mot de passe administrateur reinitialise en mode local." } as T;
  }
  if (normalizedPath === "/api/parents/me/photo" && method === "PUT") {
    const parentId = localStorage.getItem(PARENT_ID_STORAGE_KEY);
    const photoUrl = String(body.photoUrl ?? "");
    const parents = getDemoParents().map((parent) => parent.id === parentId ? { ...parent, photoUrl } : parent);
    writeJson(DEMO_PARENTS_KEY, parents);
    return { photoUrl } as T;
  }
  if (normalizedPath === "/api/ai/assistant") {
    const query = String(body.query ?? "").toLowerCase();
    const hasDebtQuestion = query.includes("impay") || query.includes("non pay") || query.includes("unpaid");
    return {
      answer: hasDebtQuestion
        ? "Mode local actif : les donnees disponibles indiquent de prioriser les familles avec le plus grand solde restant et de relancer les paiements en attente."
        : "Mode local actif : le diagnostic utilise les donnees stockees dans ce navigateur pendant que l'API distante est indisponible.",
      suggestions: hasDebtQuestion
        ? ["Voir les parents en retard", "Verifier les paiements en attente", "Preparer un echeancier"]
        : ["Analyser le tableau de bord", "Controler les paiements recents", "Generer un rapport"]
    } as T;
  }
  if (normalizedPath === "/api/classes") return demoClasses as T;
  if (normalizedPath === "/api/parents/me") return parentMe() as T;
  if (normalizedPath === "/api/analytics/overview") return overview() as T;
  if (normalizedPath === "/api/analytics/overdue-parents") return { overdueParents: 1 } as T;
  if (normalizedPath === "/api/analytics/payment-anomalies") return { anomalies: 0 } as T;
  if (normalizedPath === "/api/analytics/system-health") return { dbOk: true, lastBackup: new Date().toLocaleDateString("fr-FR") } as T;
  if (normalizedPath === "/api/analytics/forecast") return { nextMonthRevenue: overview().monthlyRevenue, risk: 0.18 } as T;

  if (normalizedPath === "/api/payments/settings/notifications") {
    if (method === "PUT") localStorage.setItem(DEMO_NOTIFICATIONS_KEY, String(Boolean(body.paymentNotificationsEnabled)));
    return { paymentNotificationsEnabled: localStorage.getItem(DEMO_NOTIFICATIONS_KEY) !== "false" } as T;
  }

  if (normalizedPath === "/api/payments" && method === "GET") return getDemoPayments() as T;
  if (normalizedPath === "/api/payments" && method === "POST") {
    const parentId = String(body.parentId ?? "");
    const parent = parentId
      ? getDemoParents().find((item) => item.id === parentId)
      : getDemoParents().find((item) => item.fullName === String(body.parentFullName ?? ""));
    const payment: DemoPayment = {
      id: `pay-${Date.now()}`,
      transactionNumber: `TXN-${Date.now()}`,
      parentId: parent?.id || parentId || undefined,
      parentFullName: parent?.fullName || String(body.parentFullName ?? "Parent"),
      reason: String(body.reason ?? "Paiement"),
      method: String(body.method ?? "CASH"),
      amount: Number(body.amount ?? 0),
      status: String(body.status ?? "COMPLETED"),
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleString("fr-FR")
    };
    writeJson(DEMO_PAYMENTS_KEY, [payment, ...getDemoPayments()]);
    return { payment, receipt: { id: `receipt-${Date.now()}` }, notificationStatus: { email: "SIMULATED", sms: "SIMULATED" } } as T;
  }

  if (normalizedPath === "/api/parents" && method === "GET") return getDemoParents() as T;
  if (normalizedPath === "/api/parents" && method === "POST") {
    const id = `PAR-2025-${String(Date.now()).slice(-4)}`;
    const parent: DemoParent = {
      id,
      nom: String(body.nom ?? ""),
      postnom: String(body.postnom ?? ""),
      prenom: String(body.prenom ?? ""),
      fullName: String(body.fullName ?? `${body.nom ?? ""} ${body.prenom ?? ""}`).trim() || "Nouveau parent",
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
      photoUrl: String(body.photoUrl ?? ""),
      createdAt: new Date().toISOString(),
      students: Array.isArray(body.students) ? body.students as DemoStudent[] : []
    };
    const notifyEmail = body.notifyEmail !== false;
    const notifySms = body.notifySms !== false;
    const temporaryPassword = `KCS-${String(Date.now()).slice(-4)}`;
    if (parent.email) {
      saveDemoParentCredential({ parentId: parent.id, email: parent.email, password: temporaryPassword });
    }
    writeJson(DEMO_PARENTS_KEY, [parent, ...getDemoParents()]);
    return {
      ...parent,
      temporaryPassword,
      notificationStatus: {
        email: notifyEmail && parent.email ? "SIMULATED" : "SKIPPED",
        sms: notifySms && parent.phone ? "SIMULATED" : "SKIPPED"
      }
    } as T;
  }

  const parentMatch = normalizedPath.match(/^\/api\/parents\/([^/]+)$/);
  if (parentMatch && method === "PUT") {
    const parents = getDemoParents().map((parent) => parent.id === parentMatch[1] ? { ...parent, ...body } as DemoParent : parent);
    writeJson(DEMO_PARENTS_KEY, parents);
    return parents.find((parent) => parent.id === parentMatch[1]) as T;
  }
  if (parentMatch && method === "DELETE") {
    writeJson(DEMO_PARENTS_KEY, getDemoParents().filter((parent) => parent.id !== parentMatch[1]));
    return undefined as T;
  }

  const resetMatch = normalizedPath.match(/^\/api\/parents\/([^/]+)\/reset-password$/);
  if (resetMatch) {
    const parent = getDemoParents().find((item) => item.id === resetMatch[1]);
    const temporaryPassword = `KCS-${String(Date.now()).slice(-4)}`;
    const notifyEmail = body.notifyEmail !== false;
    const notifySms = body.notifySms !== false;
    if (parent?.email) {
      saveDemoParentCredential({ parentId: resetMatch[1], email: parent.email, password: temporaryPassword });
    }
    return {
      parentId: resetMatch[1],
      email: parent?.email ?? "parent@school.com",
      temporaryPassword,
      notificationStatus: {
        email: notifyEmail && parent?.email ? "SIMULATED" : "SKIPPED",
        sms: notifySms && parent?.phone ? "SIMULATED" : "SKIPPED"
      }
    } as T;
  }

  throw new Error("Endpoint demo non disponible.");
}

function shouldUseDemoApi(path: string) {
  return (!API_BASE_URL || PLACEHOLDER_API_URL) && path.startsWith("/api/");
}

function canFallbackToDemo(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (!path.startsWith("/api/")) return false;
  return method === "GET" || path === "/api/auth/login" || path === "/api/ai/assistant";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldUseDemoApi(path)) return demoApi<T>(path, init);

  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const url = resolveApiUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {})
      }
    });
  } catch {
    if (LOCAL_API_FALLBACK_ENABLED && path.startsWith("/api/")) return demoApi<T>(path, init);
    throw new Error("Impossible de joindre l'API. Verifiez que le backend est demarre.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearLocalSession();
      window.location.replace(`${import.meta.env.BASE_URL}#/login`);
      throw new Error("Session expiree. Veuillez vous reconnecter.");
    }

    if (LOCAL_API_FALLBACK_ENABLED && response.status >= 500 && canFallbackToDemo(path, init)) {
      return demoApi<T>(path, init);
    }

    const errorFromJson = await response.json().catch(() => null) as { message?: string } | null;
    if (errorFromJson?.message) throw new Error(errorFromJson.message);

    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Erreur API (${response.status})`);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}
