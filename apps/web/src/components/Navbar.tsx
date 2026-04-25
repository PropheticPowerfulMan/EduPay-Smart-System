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
    <header className="sticky top-0 z-50 border-b border-brand-300/20 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
      <div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-brand-300/20 blur-md" />
              <img 
                src={schoolBranding.logoSrc} 
                alt={`Logo ${schoolBranding.schoolName}`} 
                className="relative h-11 w-11 rounded-full border border-white/25 bg-white p-1 shadow-glow transition-all duration-200 hover:scale-105" 
              />
            </div>
            <div className="hidden sm:block">
              <p className="font-display text-base font-semibold text-white leading-tight">{schoolBranding.appName}</p>
              <p className="text-xs font-semibold text-brand-300 uppercase tracking-[0.18em]">{schoolBranding.shortName} · Excellence</p>
            </div>
          </div>

          {/* Center - Branding */}
          <div className="hidden md:flex items-center justify-center flex-1 mx-8">
            <div className="text-center">
              <p className="rounded-full border border-brand-300/20 bg-white/[0.06] px-4 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">{schoolBranding.schoolName}</p>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <FontSwitch />
            <LanguageSwitch />

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 rounded-full border border-brand-300/20 bg-white/[0.07] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-200 hover:border-brand-300/40 hover:bg-brand-500/10"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold text-white">{fullName || t("user")}</p>
                  <p className="text-xs text-ink-dim capitalize">{role || t("guest")}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-white via-brand-200 to-brand-500 text-sm font-bold text-slate-950 ring-1 ring-white/30">
                  {(fullName || t("user")).charAt(0).toUpperCase()}
                </div>
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="glass absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl py-2 shadow-xl animate-fadeInDown">
                  <div className="px-4 py-3 border-b border-brand-300/15">
                    <p className="text-sm font-semibold text-white">{fullName || t("user")}</p>
                    <p className="text-xs text-ink-dim">{role || t("guest")}</p>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-ink-dim transition-all duration-200 hover:bg-brand-500/10 hover:text-danger"
                  >
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
