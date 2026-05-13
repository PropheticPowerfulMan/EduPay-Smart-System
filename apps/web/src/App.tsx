import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { AIAssistantPage } from "./pages/AIAssistantPage";
import { FinanceDashboardPage } from "./pages/FinanceDashboardPage";
import { FinancialOperationsPage } from "./pages/FinancialOperationsPage";
import { FinanceParentAdminPage } from "./pages/FinanceParentAdminPage";
import { FinanceParentPage } from "./pages/FinanceParentPage";
import { LoginPage } from "./pages/LoginPage";
import { ParentsManagementPage } from "./pages/ParentsManagementPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ReceiptVerificationPage } from "./pages/ReceiptVerificationPage";
import { ReportsPage } from "./pages/ReportsPage";
import { StudentsDirectoryPage } from "./pages/StudentsDirectoryPage";
import { STAFF_ROLES, useAuthStore } from "./store/auth";
import type { Role } from "./store/auth";

function getHomePathByRole(role: Role | null) {
  if (!role) return "/login";
  return role === "PARENT" ? "/parent" : "/";
}

function ProtectedLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-ink">
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1440px] gap-6 px-3 pb-28 pt-4 sm:px-6 sm:py-6 md:pb-6 lg:px-8">
        <Sidebar />
        <section className="min-w-0 flex-1">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  if (!token || !role) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RoleRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const role = useAuthStore((s) => s.role);
  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to={getHomePathByRole(role)} replace />;
  }
  return <Outlet />;
}

function RoleHome() {
  const role = useAuthStore((s) => s.role);
  if (role === "PARENT") {
    return <Navigate to="/parent" replace />;
  }
  if (role && STAFF_ROLES.includes(role)) {
    return <FinanceDashboardPage />;
  }
  return <Navigate to="/login" replace />;
}

function NotFoundPage() {
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const homePath = token ? getHomePathByRole(role) : "/login";

  return (
    <div className="flex min-h-[65vh] items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl border border-brand-500/20 p-8 text-center shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-300">Page introuvable</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white">Cette section n'existe pas</h1>
        <p className="mt-3 text-sm text-ink-dim">
          La navigation EduPay est toujours disponible. Revenez a l'espace adapte a votre role.
        </p>
        <a href={`#${homePath}`} className="btn-primary mt-6 inline-flex px-5 py-3 text-sm font-semibold">
          Retour a l'accueil
        </a>
      </div>
    </div>
  );
}

export function App() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  return (
    <Routes>
      <Route path="/login" element={token && role ? <Navigate to={getHomePathByRole(role)} replace /> : <LoginPage />} />
      <Route path="/receipt/verify" element={<ReceiptVerificationPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<RoleHome />} />
          <Route element={<RoleRoute allowedRoles={STAFF_ROLES} />}>
            <Route path="operations" element={<FinancialOperationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="parent-payments" element={<FinanceParentAdminPage />} />
            <Route path="students" element={<StudentsDirectoryPage />} />
            <Route path="ai" element={<AIAssistantPage />} />
            <Route path="parents" element={<ParentsManagementPage />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["PARENT"]} />}>
            <Route path="parent" element={<FinanceParentPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={token ? <NotFoundPage /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
