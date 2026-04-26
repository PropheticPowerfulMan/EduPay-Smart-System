import { LanguageSwitch } from "./LanguageSwitch";
import { FontSwitch } from "./FontSwitch";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";
import { useState, type FormEvent } from "react";

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setMessage("Mot de passe modifie avec succes.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de modifier le mot de passe.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onSubmit={submit} className="glass relative w-full max-w-sm rounded-2xl p-7 space-y-4 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-display text-xl font-bold text-white">Changer mon mot de passe</h3>
          <p className="mt-1 text-sm text-ink-dim">Remplacez votre mot de passe temporaire par un mot de passe personnel.</p>
        </div>
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Mot de passe actuel"
          className="w-full"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Nouveau mot de passe"
          className="w-full"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirmer le nouveau mot de passe"
          className="w-full"
        />
        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {message && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</p>}
        <div className="flex gap-3">
          <button disabled={saving} className="flex-1 btn-primary py-3 text-sm font-bold disabled:opacity-60">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">
            Fermer
          </button>
        </div>
      </form>
    </div>
  );
}

export function Navbar() {
  const { t } = useI18n();
  const { fullName, role, logout } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-brand-300/20 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
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
                      setShowPasswordModal(true);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-ink-dim transition-all duration-200 hover:bg-brand-500/10 hover:text-white"
                  >
                    Changer mon mot de passe
                  </button>
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
