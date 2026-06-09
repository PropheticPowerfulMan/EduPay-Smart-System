import { api } from "../services/api";

type ParentPreview = { id: string };

const warmupTasks = new Map<string, Promise<void>>();

function rememberWarmup(key: string, loader: () => Promise<void>) {
  const existing = warmupTasks.get(key);
  if (existing) return existing;

  const task = loader().catch(() => undefined);
  warmupTasks.set(key, task);
  return task;
}

async function warmFinanceDashboard() {
  await Promise.allSettled([
    import("../pages/FinanceDashboardPage"),
    api("/api/finance/overview"),
    api("/api/expenses/overview")
  ]);
}

async function warmReports() {
  await Promise.allSettled([
    import("../pages/ReportsPage"),
    api("/api/finance/overview"),
    api("/api/expenses/overview"),
    api("/api/expenses/accounting-entries"),
    api("/api/expenses/cashflow-entries"),
    api("/api/expenses/payroll/runs")
  ]);
}

async function warmParentFollowUp() {
  await import("../pages/FinanceParentAdminPage");

  const [parents] = await Promise.all([
    api<ParentPreview[]>("/api/parents").catch(() => []),
    api("/api/finance/catalog").catch(() => null)
  ]);

  const firstParentId = Array.isArray(parents) ? parents[0]?.id : "";
  if (firstParentId) {
    await api(`/api/finance/parents/${firstParentId}/profile`).catch(() => undefined);
  }
}

export function warmStaffRoute(path: string) {
  switch (path) {
    case "/":
      return rememberWarmup("dashboard", warmFinanceDashboard);
    case "/reports":
      return rememberWarmup("reports", warmReports);
    case "/parent-payments":
      return rememberWarmup("parent-payments", warmParentFollowUp);
    default:
      return Promise.resolve();
  }
}