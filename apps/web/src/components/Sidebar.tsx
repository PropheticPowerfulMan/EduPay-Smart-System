import type { ReactNode } from "react";
import {
  BadgeDollarSign,
  Bot,
  BriefcaseBusiness,
  ChartColumnBig,
  CreditCard,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  UserRoundSearch
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { useAuthStore } from "../store/auth";
import { useUiStore } from "../store/ui";
import { warmStaffRoute } from "../utils/staffRouteWarmup";

type SidebarLink = {
  to: string;
  label: string;
  icon: ReactNode;
};

export function Sidebar() {
  const { t } = useI18n();
  const role = useAuthStore((state) => state.role);
  const isDesktopSidebarOpen = useUiStore((state) => state.isDesktopSidebarOpen);
  const isMobileNavOpen = useUiStore((state) => state.isMobileNavOpen);
  const setDesktopSidebarOpen = useUiStore((state) => state.setDesktopSidebarOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);

  const links: SidebarLink[] = role === "PARENT"
    ? [{ to: "/parent", label: t("navParent"), icon: <BadgeDollarSign className="h-4 w-4" aria-hidden="true" /> }]
    : [
        { to: "/", label: t("navDashboard"), icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> },
        { to: "/operations", label: t("navOperations"), icon: <Landmark className="h-4 w-4" aria-hidden="true" /> },
        { to: "/reports", label: t("navReports"), icon: <ChartColumnBig className="h-4 w-4" aria-hidden="true" /> },
        { to: "/payments", label: t("navPayments"), icon: <CreditCard className="h-4 w-4" aria-hidden="true" /> },
        { to: "/messages", label: t("navMessages"), icon: <MessageSquareText className="h-4 w-4" aria-hidden="true" /> },
        { to: "/parent-payments", label: t("navParentPayments"), icon: <UserRoundSearch className="h-4 w-4" aria-hidden="true" /> },
        { to: "/students", label: t("navStudents"), icon: <GraduationCap className="h-4 w-4" aria-hidden="true" /> },
        { to: "/employees", label: t("navEmployees"), icon: <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" /> },
        { to: "/parents", label: t("navParents"), icon: <Users className="h-4 w-4" aria-hidden="true" /> },
        { to: "/ai", label: t("navAI"), icon: <Bot className="h-4 w-4" aria-hidden="true" /> }
      ];

  const prefetchLink = (path: string) => {
    void warmStaffRoute(path);
  };

  const railLinks = (prefix: string) => links.map((link) => (
    <NavLink
      key={`${prefix}-${link.to}`}
      to={link.to}
      title={link.label}
      onMouseEnter={() => prefetchLink(link.to)}
      onFocus={() => prefetchLink(link.to)}
      onTouchStart={() => prefetchLink(link.to)}
      className={({ isActive }) =>
        `group relative flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 ${
          isActive
            ? "border-brand-300/45 bg-gradient-to-br from-brand-500/30 to-white/10 text-white shadow-[0_16px_34px_rgba(20,184,222,0.18)]"
            : "border-white/10 bg-white/[0.04] text-brand-100 hover:border-brand-300/35 hover:bg-brand-500/10 hover:text-white"
        }`
      }
    >
      <span className="pointer-events-none absolute inset-x-2 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-300/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      {link.icon}
    </NavLink>
  ));

  return (
    <>
      <nav className={`fixed inset-x-3 bottom-3 z-50 pb-[env(safe-area-inset-bottom)] transition-all duration-300 md:hidden ${isMobileNavOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-24 opacity-0"}`}>
        <div className="glass edupay-mobile-nav flex items-center gap-1 overflow-x-auto rounded-2xl p-2 shadow-2xl">
          {links.map((link) => (
            <NavLink
              key={`mobile-open-${link.to}`}
              to={link.to}
              onMouseEnter={() => prefetchLink(link.to)}
              onFocus={() => prefetchLink(link.to)}
              onTouchStart={() => prefetchLink(link.to)}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `flex min-w-[4.75rem] flex-none flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition-all ${
                  isActive
                    ? "bg-brand-500/25 text-white ring-1 ring-brand-300/35"
                    : "text-ink-dim hover:bg-white/[0.06] hover:text-white"
                }`
              }
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-black text-brand-200">
                {link.icon}
              </span>
              <span className="max-w-full truncate">{link.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {!isMobileNavOpen && (
        <div className="fixed left-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-3 rounded-[2rem] bg-slate-950/78 px-2 py-3 shadow-[0_24px_48px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-300/32 bg-brand-500/10 text-brand-100 transition-all hover:border-brand-300/55 hover:bg-brand-500/18 hover:text-white"
            aria-label="Afficher la navigation mobile"
            title="Afficher la navigation"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
          <div className="h-px w-8 bg-gradient-to-r from-transparent via-brand-300/45 to-transparent" />
          <div className="edupay-scrollbar flex max-h-[58vh] flex-col gap-2 overflow-y-auto pr-0.5">
            {links.map((link) => (
              <NavLink
                key={`mobile-rail-${link.to}`}
                to={link.to}
                title={link.label}
                onMouseEnter={() => prefetchLink(link.to)}
                onFocus={() => prefetchLink(link.to)}
                onTouchStart={() => prefetchLink(link.to)}
                className={({ isActive }) =>
                  `flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-200 ${
                    isActive
                      ? "border-brand-300/45 bg-gradient-to-br from-brand-500/28 to-white/10 text-white shadow-[0_14px_28px_rgba(20,184,222,0.18)]"
                      : "border-white/10 bg-white/[0.04] text-brand-100 hover:border-brand-300/35 hover:bg-brand-500/10 hover:text-white"
                  }`
                }
              >
                {link.icon}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {isDesktopSidebarOpen ? (
        <aside className="hidden w-72 shrink-0 md:flex md:flex-col">
          <div className="glass sticky top-20 flex h-[calc(100vh-6.5rem)] flex-col gap-6 overflow-hidden rounded-3xl p-4 transition-all duration-300">
            <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full border border-brand-300/20 bg-brand-500/10 blur-sm" />
            <div className="relative space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-brand-300/20 bg-white/[0.06] p-3 transition-all duration-200 hover:border-brand-300/40 hover:bg-brand-500/10">
                <img
                  src={schoolBranding.logoSrc}
                  alt={`Logo ${schoolBranding.schoolName}`}
                  className="h-12 w-12 rounded-full border border-white/30 bg-white p-1 shadow-glow"
                />
                <div>
                  <p className="font-display text-sm font-semibold leading-tight text-white">{schoolBranding.schoolName}</p>
                  <p className="text-xs font-medium text-brand-200">{schoolBranding.tagline}</p>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-brand-300/35 to-transparent" />
            </div>

            <nav className="edupay-scrollbar relative flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto pr-1">
              <p className="px-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{t("navigation")}</p>
              <div className="space-y-1">
                {links.map((link) => (
                  <NavLink
                    key={`desktop-open-${link.to}`}
                    to={link.to}
                    onMouseEnter={() => prefetchLink(link.to)}
                    onFocus={() => prefetchLink(link.to)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "border border-brand-300/40 bg-gradient-to-r from-brand-500/24 to-white/10 text-white shadow-[inset_4px_0_0_#7de8ff,0_12px_30px_rgba(20,184,222,0.12)]"
                          : "border border-transparent text-ink-dim hover:border-brand-300/20 hover:bg-white/[0.06] hover:text-white"
                      }`
                    }
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-black text-brand-200">
                      {link.icon}
                    </span>
                    <span>{link.label}</span>
                  </NavLink>
                ))}
              </div>
            </nav>

            <div className="relative space-y-3 border-t border-brand-300/15 pt-4">
              <div className="text-center text-xs text-ink-dim">
                <p className="font-semibold text-brand-200">EduPay Smart System</p>
                <p className="text-xs opacity-70">v1.0</p>
              </div>
            </div>
          </div>
        </aside>
      ) : (
        <div className="hidden w-[5.25rem] shrink-0 md:flex md:flex-col">
          <div className="sticky top-20 flex h-[calc(100vh-6.5rem)] justify-center">
            <div className="edupay-nav-rail relative flex w-full flex-col items-center rounded-[2rem] bg-slate-950/78 px-2 py-4 shadow-[0_24px_48px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
              <button
                type="button"
                onClick={() => setDesktopSidebarOpen(true)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-300/32 bg-brand-500/10 text-brand-100 transition-all hover:border-brand-300/55 hover:bg-brand-500/18 hover:text-white"
                aria-label="Afficher la navigation latérale"
                title="Afficher la navigation"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
              <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <img
                  src={schoolBranding.logoSrc}
                  alt={`Logo ${schoolBranding.schoolName}`}
                  className="h-full w-full rounded-xl border border-white/20 bg-white object-contain p-1"
                />
              </div>
              <div className="mt-4 h-px w-8 bg-gradient-to-r from-transparent via-brand-300/45 to-transparent" />
              <div className="edupay-scrollbar mt-4 flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                {railLinks("desktop-rail")}
              </div>
              <button
                type="button"
                onClick={() => setDesktopSidebarOpen(true)}
                className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-brand-100 transition-all hover:border-brand-300/35 hover:bg-brand-500/10 hover:text-white"
                aria-label="Déployer la navigation"
                title="Déployer la navigation"
              >
                <PanelLeftClose className="h-4 w-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
