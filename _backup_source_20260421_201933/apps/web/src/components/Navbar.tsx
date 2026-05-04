import { LanguageSwitch } from "./LanguageSwitch";
import { FontSwitch } from "./FontSwitch";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { useAuthStore } from "../store/auth";
import { useState } from "react";

export function Navbar() {
  const { t } = useI18n();
  const { fullName, role, logout } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 backdrop-blur-md bg-slate-950/80">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <img 
                src={schoolBranding.logoSrc} 
                alt={`Logo ${schoolBranding.schoolName}`} 
                className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 p-2 shadow-lg hover:shadow-brand-glow transition-all duration-300" 
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-500 to-transparent opacity-0 group-hover:opacity-20 transition-all"></div>
            </div>
            <div className="hidden sm:block">
              <p className="font-display text-lg font-bold text-white leading-tight">{schoolBranding.appName}</p>
              <p className="text-xs font-semibold text-brand-300 uppercase tracking-[0.15em]">{schoolBranding.shortName}</p>
            </div>
          </div>

          {/* Center - Branding */}
          <div className="hidden md:flex items-center justify-center flex-1 mx-8">
            <div className="text-center">
              <p className="text-sm font-medium text-ink-dim">{schoolBranding.schoolName}</p>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-6">
            <FontSwitch />
            <LanguageSwitch />

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 px-4 py-2 rounded-lg glass hover:bg-slate-700/50 transition-all duration-300"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold text-white">{fullName || t("user")}</p>
                  <p className="text-xs text-ink-dim capitalize">{role || t("guest")}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-dark flex items-center justify-center text-white font-bold text-sm">
                  {(fullName || t("user")).charAt(0).toUpperCase()}
                </div>
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 glass rounded-lg shadow-xl py-2 animate-fadeInDown">
                  <div className="px-4 py-3 border-b border-slate-700/50">
                    <p className="text-sm font-semibold text-white">{fullName || t("user")}</p>
                    <p className="text-xs text-ink-dim">{role || t("guest")}</p>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-ink-dim hover:text-danger hover:bg-slate-700/30 transition-all duration-200"
                  >
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Accent Line */}
      <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"></div>
    </header>
  );
}
