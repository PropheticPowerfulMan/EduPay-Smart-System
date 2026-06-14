import { Suspense, lazy, useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { LoginPage } from "./pages/LoginPage";
import { ReceiptVerificationPage } from "./pages/ReceiptVerificationPage";
import { STAFF_ROLES, useAuthStore } from "./store/auth";
import type { Role } from "./store/auth";

const loadAIAssistantPage = () => import("./pages/AIAssistantPage");
const loadFinanceDashboardPage = () => import("./pages/FinanceDashboardPage");
const loadFinancialOperationsPage = () => import("./pages/FinancialOperationsPage");
const loadReportsPage = () => import("./pages/ReportsPage");
const loadFinanceParentAdminPage = () => import("./pages/FinanceParentAdminPage");

const AIAssistantPage = lazy(() => loadAIAssistantPage().then((module) => ({ default: module.AIAssistantPage })));
const FinanceDashboardPage = lazy(() => loadFinanceDashboardPage().then((module) => ({ default: module.FinanceDashboardPage })));
const FinancialOperationsPage = lazy(() => loadFinancialOperationsPage().then((module) => ({ default: module.FinancialOperationsPage })));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage").then((module) => ({ default: module.EmployeesPage })));
const EmployeeFinancePage = lazy(() => import("./pages/EmployeeFinancePage").then((module) => ({ default: module.EmployeeFinancePage })));
const FinanceParentAdminPage = lazy(() => import("./pages/FinanceParentAdminPage").then((module) => ({ default: module.FinanceParentAdminPage })));
const FinanceParentPage = lazy(() => import("./pages/FinanceParentPage").then((module) => ({ default: module.FinanceParentPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage").then((module) => ({ default: module.MessagesPage })));
const ParentsManagementPage = lazy(() => import("./pages/ParentsManagementPage").then((module) => ({ default: module.ParentsManagementPage })));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage").then((module) => ({ default: module.PaymentsPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const StudentsDirectoryPage = lazy(() => import("./pages/StudentsDirectoryPage").then((module) => ({ default: module.StudentsDirectoryPage })));

function PageLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="glass flex items-center gap-3 rounded-2xl border border-brand-300/20 px-5 py-4 text-sm font-semibold text-ink-dim shadow-xl">
        <div className="h-3 w-3 animate-pulse rounded-full bg-brand-300" />
        Chargement de l'espace EduPay...
      </div>
    </div>
  );
}

function withPageLoader(element: React.ReactNode) {
  return <Suspense fallback={<PageLoadingFallback />}>{element}</Suspense>;
}

function getHomePathByRole(role: Role | null) {
  if (!role) return "/login";
  if (role === "EMPLOYEE") return "/employee";
  return role === "PARENT" ? "/parent" : "/";
}

function ProtectedLayout() {
  const role = useAuthStore((s) => s.role);

  useEffect(() => {
    if (!role || role === "PARENT" || role === "EMPLOYEE") return;

    const warmupTimer = window.setTimeout(() => {
      void loadFinancialOperationsPage();
      void loadAIAssistantPage();
    }, 2500);

    return () => {
      window.clearTimeout(warmupTimer);
    };
  }, [role]);

  return (
    <div className="edupay-app-shell min-h-screen bg-slate-950 text-ink">
      <Navbar />
      <main className="flex w-full gap-6 px-3 pb-32 pt-4 sm:px-5 sm:py-6 md:pb-6 lg:px-6 xl:px-8">
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
  if (role === "EMPLOYEE") {
    return <Navigate to="/employee" replace />;
  }
  if (role && STAFF_ROLES.includes(role)) {
    return withPageLoader(<FinanceDashboardPage />);
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
            <Route path="operations" element={withPageLoader(<FinancialOperationsPage />)} />
            <Route path="reports" element={withPageLoader(<ReportsPage />)} />
            <Route path="payments" element={withPageLoader(<PaymentsPage />)} />
            <Route path="messages" element={withPageLoader(<MessagesPage />)} />
            <Route path="parent-payments" element={withPageLoader(<FinanceParentAdminPage />)} />
            <Route path="students" element={withPageLoader(<StudentsDirectoryPage />)} />
            <Route path="employees" element={withPageLoader(<EmployeesPage />)} />
            <Route path="ai" element={withPageLoader(<AIAssistantPage />)} />
            <Route path="parents" element={withPageLoader(<ParentsManagementPage />)} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["PARENT"]} />}>
            <Route path="parent" element={withPageLoader(<FinanceParentPage />)} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["EMPLOYEE"]} />}>
            <Route path="employee" element={withPageLoader(<EmployeeFinancePage />)} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={token ? <NotFoundPage /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
