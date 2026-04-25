import { NavLink } from "react-router-dom";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { useAuthStore } from "../store/auth";

export function Sidebar() {
  const { t } = useI18n();
  const role = useAuthStore((s) => s.role);

  const links = role === "PARENT"
    ? [{ to: "/parent", label: t("navParent"), icon: "👨‍👩‍👧" }]
    : [
        { to: "/", label: t("navDashboard"), icon: "📊" },
        { to: "/payments", label: t("navPayments"), icon: "💳" },
        { to: "/parents", label: t("navParents"), icon: "👥" },
        { to: "/ai", label: t("navAI"), icon: "🤖" }
      ];

  return (
    <aside className="hidden md:flex md:w-72 md:shrink-0 md:flex-col">
      <div className="glass sticky top-20 h-[calc(100vh-6.5rem)] space-y-6 overflow-hidden rounded-3xl p-4">
        <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full border border-brand-300/20 bg-brand-500/10 blur-sm" />
        {/* Header */}
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
          <div className="h-px bg-gradient-to-r from-transparent via-brand-300/35 to-transparent"></div>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 space-y-3">
          <p className="px-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{t("navigation")}</p>
          <div className="space-y-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? "border border-brand-300/40 bg-gradient-to-r from-brand-500/24 to-white/10 text-white shadow-[inset_4px_0_0_#7de8ff,0_12px_30px_rgba(20,184,222,0.12)]" 
                      : "border border-transparent text-ink-dim hover:border-brand-300/20 hover:bg-white/[0.06] hover:text-white"
                  }`
                }
              >
                <span className="text-lg">{link.icon}</span>
                <span>{link.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="relative space-y-3 border-t border-brand-300/15 pt-4">
          <div className="text-xs text-ink-dim text-center">
            <p className="font-semibold text-brand-200">EduPay Smart System</p>
            <p className="text-xs opacity-70">v1.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
