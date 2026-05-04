import { LanguageSwitch } from "./LanguageSwitch";
import { FontSwitch } from "./FontSwitch";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";
import { useEffect, useRef, useState, type FormEvent } from "react";

function imageFileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Veuillez choisir une image valide."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 360;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Image non lisible."));
          return;
        }
        const minSide = Math.min(image.width, image.height);
        const sx = (image.width - minSide) / 2;
        const sy = (image.height - minSide) / 2;
        ctx.drawImage(image, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = () => reject(new Error("Image non lisible."));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Image non lisible."));
    reader.readAsDataURL(file);
  });
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
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
      setError(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setMessage(t("passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passwordChangeFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onSubmit={submit} className="glass relative w-full max-w-sm rounded-2xl p-7 space-y-4 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-display text-xl font-bold text-white">{t("changePasswordTitle")}</h3>
          <p className="mt-1 text-sm text-ink-dim">{t("changePasswordSubtitle")}</p>
        </div>
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder={t("currentPassword")}
          className="w-full"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder={t("newPasswordField")}
          className="w-full"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder={t("confirmNewPassword")}
          className="w-full"
        />
        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {message && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</p>}
        <div className="flex gap-3">
          <button disabled={saving} className="flex-1 btn-primary py-3 text-sm font-bold disabled:opacity-60">
            {saving ? t("pmSaving") : t("pmSave")}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">
            {t("close")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Navbar() {
  const { t } = useI18n();
  const { fullName, role, photoUrl, setPhotoUrl, logout } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && userMenuRef.current?.contains(target)) return;
      setIsUserMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsUserMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isUserMenuOpen]);

  const updatePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError("");
    try {
      const nextPhotoUrl = await imageFileToAvatar(file);
      if (role === "PARENT") {
        await api<{ photoUrl: string }>("/api/parents/me/photo", {
          method: "PUT",
          body: JSON.stringify({ photoUrl: nextPhotoUrl })
        });
      }
      setPhotoUrl(nextPhotoUrl);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t("profilePhotoFailed"));
    }
  };

  const removePhoto = async () => {
    setPhotoError("");
    try {
      if (role === "PARENT") {
        await api<{ photoUrl: string }>("/api/parents/me/photo", {
          method: "PUT",
          body: JSON.stringify({ photoUrl: "" })
        });
      }
      setPhotoUrl(null);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t("profilePhotoFailed"));
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-brand-300/20 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
      <div className="mx-auto max-w-[1440px] px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          {/* Logo Section */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
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
              <p className="text-xs font-semibold text-brand-300 uppercase tracking-[0.18em]">{schoolBranding.shortName} - Excellence</p>
            </div>
          </div>

          {/* Center - Branding */}
          <div className="hidden md:flex items-center justify-center flex-1 mx-8">
            <div className="text-center">
              <p className="rounded-full border border-brand-300/20 bg-white/[0.06] px-4 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">{schoolBranding.schoolName}</p>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <div className="hidden items-center gap-3 lg:flex">
              <FontSwitch />
              <LanguageSwitch />
            </div>

            {/* User Menu */}
            <div className="relative z-[70]" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full border border-brand-300/20 bg-white/[0.07] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-200 hover:border-brand-300/40 hover:bg-brand-500/10 sm:gap-3 sm:px-3"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold text-white">{fullName || t("user")}</p>
                  <p className="text-xs text-ink-dim capitalize">{role || t("guest")}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-white via-brand-200 to-brand-500 text-sm font-bold text-slate-950 ring-1 ring-white/30">
                  {photoUrl ? (
                    <img src={photoUrl} alt={fullName || t("user")} className="h-full w-full object-cover" />
                  ) : (
                    (fullName || t("user")).charAt(0).toUpperCase()
                  )}
                </div>
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="glass absolute right-0 top-full z-[90] mt-2 w-[min(92vw,15rem)] overflow-hidden rounded-2xl py-2 shadow-2xl animate-fadeInDown sm:w-60">
                  <div className="px-4 py-3 border-b border-brand-300/15">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-200 to-brand-500 text-sm font-bold text-slate-950">
                        {photoUrl ? (
                          <img src={photoUrl} alt={fullName || t("user")} className="h-full w-full object-cover" />
                        ) : (
                          (fullName || t("user")).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{fullName || t("user")}</p>
                        <p className="text-xs text-ink-dim">{role || t("guest")}</p>
                      </div>
                    </div>
                    {photoError && <p className="mt-2 text-xs text-danger">{photoError}</p>}
                  </div>
                  <label className="block w-full cursor-pointer px-4 py-2 text-sm text-ink-dim transition-all duration-200 hover:bg-brand-500/10 hover:text-white">
                    {photoUrl ? t("changeProfilePhoto") : t("addProfilePhoto")}
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => void updatePhoto(event.target.files?.[0])} />
                  </label>
                  {photoUrl && (
                    <button
                      onClick={() => void removePhoto()}
                      className="w-full text-left px-4 py-2 text-sm text-ink-dim transition-all duration-200 hover:bg-brand-500/10 hover:text-white"
                    >
                      {t("removeProfilePhoto")}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowPasswordModal(true);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-ink-dim transition-all duration-200 hover:bg-brand-500/10 hover:text-white"
                  >
                    {t("changePassword")}
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

        <div className="mt-2 flex items-center justify-end gap-2 rounded-xl border border-brand-300/15 bg-white/[0.04] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] lg:hidden">
          <FontSwitch />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
