import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { AIAssistantPage } from "./pages/AIAssistantPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ParentTrackingPage } from "./pages/ParentTrackingPage";
import { ParentsManagementPage } from "./pages/ParentsManagementPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { useAuthStore } from "./store/auth";
import type { Role } from "./store/auth";

function getHomePathByRole(role: Role | null) {
  return role === "PARENT" ? "/parent" : "/";
}

function ProtectedLayout() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <main className="flex">
        <Sidebar />
        <section className="flex-1 p-6 md:p-8 max-w-7xl">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
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
  return <DashboardPage />;
}

export function App() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to={getHomePathByRole(role)} replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<RoleHome />} />
          <Route element={<RoleRoute allowedRoles={["ADMIN", "ACCOUNTANT"]} />}>
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="ai" element={<AIAssistantPage />} />
            <Route path="parents" element={<ParentsManagementPage />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["PARENT"]} />}>
            <Route path="parent" element={<ParentTrackingPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={token ? getHomePathByRole(role) : "/login"} replace />} />
    </Routes>
  );
}
