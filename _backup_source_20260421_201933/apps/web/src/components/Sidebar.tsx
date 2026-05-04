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
    <aside className="hidden md:flex md:w-72 md:flex-col md:shrink-0">
      <div className="h-full glass rounded-2xl p-6 space-y-8 sticky top-20">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl glass hover:bg-slate-700/40 transition-all duration-300">
            <img 
              src={schoolBranding.logoSrc} 
              alt={`Logo ${schoolBranding.schoolName}`} 
              className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-accent-dark p-2" 
            />
            <div>
              <p className="font-display font-bold text-white text-sm leading-tight">{schoolBranding.schoolName}</p>
              <p className="text-xs text-brand-300">{schoolBranding.tagline}</p>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-brand-500/20 via-brand-500/40 to-brand-500/20"></div>
        </div>

        {/* Navigation */}
        <nav className="space-y-3 flex-1">
          <p className="font-display text-xs font-bold text-ink-dim uppercase tracking-[0.1em] px-2">{t("navigation")}</p>
          <div className="space-y-2">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-300 ${
                    isActive 
                      ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30" 
                      : "text-ink-dim hover:bg-slate-700/50 hover:text-white"
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
        <div className="pt-4 border-t border-slate-700/50 space-y-3">
          <div className="text-xs text-ink-dim text-center">
            <p className="font-semibold text-brand-300">EduPay Smart System</p>
            <p className="text-xs opacity-70">v1.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
