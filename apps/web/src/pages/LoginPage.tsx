import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FontSwitch } from "../components/FontSwitch";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { normalizeRole, useAuthStore } from "../store/auth";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

type ForgotStep = "form" | "sent";

function ForgotPasswordModal({ onClose, t }: { onClose: () => void; t: (k: string) => string }) {
  const [step, setStep] = useState<ForgotStep>("form");
  const [adminRecovery, setAdminRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError(t("forgotInvalidEmail"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
    } catch {
      // Even on error we show success to not leak account existence
    } finally {
      setLoading(false);
      setStep("sent");
    }
  };

  const handleAdminRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError(t("forgotInvalidEmail"));
      return;
    }
    if (newPassword.length < 10) {
      setError(t("adminRecoveryPasswordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await api<{ message?: string }>("/api/auth/recover-admin-password", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          recoveryCode,
          newPassword
        })
      });
      setSuccessMessage(result.message || t("adminRecoverySuccess"));
      setRecoveryCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminRecoveryFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm glass rounded-2xl p-8 space-y-6 animate-fadeInUp"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-dim hover:text-white transition-colors"
          aria-label="Fermer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {step === "form" && !adminRecovery ? (
          <>
            <div>
              <h3 className="font-display text-xl font-bold text-white">{t("forgotTitle")}</h3>
              <p className="text-sm text-ink-dim mt-2">{t("forgotSubtitle")}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-dim">{t("email")}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("forgotEmailPlaceholder")}
                  className="w-full"
                  autoFocus
                />
                {error && <p className="text-xs text-danger">{error}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 font-semibold disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("forgotSending")}
                  </div>
                ) : t("forgotSend")}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setAdminRecovery(true);
                setError("");
                setSuccessMessage("");
              }}
              className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-500/20"
            >
              {t("adminRecoveryOpen")}
            </button>
          </>
        ) : step === "form" ? (
          <>
            <div>
              <h3 className="font-display text-xl font-bold text-white">{t("adminRecoveryTitle")}</h3>
              <p className="text-sm text-ink-dim mt-2">{t("adminRecoverySubtitle")}</p>
            </div>
            <form onSubmit={handleAdminRecovery} className="space-y-4">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} className="w-full" />
              <input type="password" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder={t("adminRecoveryCode")} className="w-full" />
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("newPasswordField")} className="w-full" />
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("confirmNewPassword")} className="w-full" />
              {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              {successMessage && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{successMessage}</p>}
              <button type="submit" disabled={loading} className="w-full btn-primary py-3 font-semibold disabled:opacity-50">
                {loading ? t("forgotSending") : t("adminRecoverySubmit")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminRecovery(false);
                  setError("");
                  setSuccessMessage("");
                }}
                className="w-full rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white"
              >
                {t("forgotClose")}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-display text-xl font-bold text-white">{t("forgotSentTitle")}</h3>
            <p className="text-sm text-ink-dim">{t("forgotSentBody").replace("{{email}}", email)}</p>
            <button onClick={onClose} className="w-full btn-primary py-3 font-semibold">{t("forgotClose")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const demoCredentials: LoginInput = {
  email: "admin@school.com",
  password: "password123"
};

const parentDemoCredentials: LoginInput = {
  email: "parent@school.com",
  password: "password123"
};

type LoginInput = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { t } = useI18n();
  const { setAuth } = useAuthStore();
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const loginWithCredentials = async (values: LoginInput) => {
    setApiError(null);
    const result = await api<{ token: string; role?: string; fullName: string; parentId?: string; photoUrl?: string | null }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: values.email.trim().toLowerCase(),
        password: values.password
      })
    });
    const role = normalizeRole(result.role, result.parentId);
    if (!role) throw new Error("Rôle utilisateur invalide.");

    setAuth(result.token, role, result.fullName, result.parentId, result.photoUrl);
    window.location.replace(`${import.meta.env.BASE_URL}#${role === "PARENT" ? "/parent" : "/"}`);
  };

  const onSubmit = async (values: LoginInput) => {
    try {
      await loginWithCredentials(values);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("loginFailedHint");
      setApiError(message);
    }
  };

  const fillDemoCredentials = (role: "ADMIN" | "PARENT") => {
    const creds = role === "PARENT" ? parentDemoCredentials : demoCredentials;
    setApiError(null);
    setValue("email", creds.email, { shouldValidate: true });
    setValue("password", creds.password, { shouldValidate: true });
  };

  return (
    <div className="min-h-screen grid place-items-center relative overflow-hidden px-4 py-8">
      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} t={t} />}
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-brand-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-accent rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10 animate-fadeInUp">
        <div className="glass rounded-2xl overflow-hidden">
          {/* Header with gradient */}
          <div className="relative overflow-hidden p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-500 opacity-90"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-brand-500/0 to-accent/20"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="logo-glass h-20 w-20 rounded-full flex items-center justify-center border-2 border-white/35 shadow-lg shadow-black/20">
                <div className="h-16 w-16 overflow-hidden rounded-full bg-white p-1.5">
                  <img 
                    src={schoolBranding.logoSrc} 
                    alt={`Logo ${schoolBranding.schoolName}`} 
                    className="h-full w-full rounded-full object-contain" 
                  />
                </div>
              </div>
              <div className="mt-3 max-w-[260px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">{schoolBranding.shortName}</p>
                <h1 className="mt-1 font-display text-lg font-bold leading-tight text-white sm:text-xl">{schoolBranding.schoolName}</h1>
                <p className="mt-1 text-xs font-medium text-white/70">{schoolBranding.tagline}</p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8 space-y-6">
            {/* Language Switch */}
            <div className="space-y-4">
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-bold text-white">{t("loginTitle")}</h2>
                <p className="text-sm text-ink-dim mt-1">{t("loginSubtitle")}</p>
              </div>
              <div className="flex max-w-full flex-wrap items-center justify-start gap-3 rounded-xl border border-slate-700/40 bg-slate-950/35 p-2 sm:flex-nowrap sm:gap-3.5">
                <FontSwitch />
                <LanguageSwitch />
              </div>
            </div>

            {/* Credential fill buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => fillDemoCredentials("ADMIN")}
                disabled={isSubmitting}
                className="w-full p-3 rounded-lg border border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 hover:border-brand-500/50 active:scale-95 active:brightness-90 active:shadow-inner transition-all duration-150 text-sm font-semibold select-none disabled:opacity-60"
              >
                {t("fillDemoAdmin")}
              </button>
              <button
                type="button"
                onClick={() => fillDemoCredentials("PARENT")}
                disabled={isSubmitting}
                className="w-full p-3 rounded-lg border border-accent/40 bg-accent/10 text-pink-300 hover:bg-accent/20 hover:border-accent/60 active:scale-95 active:brightness-90 active:shadow-inner transition-all duration-150 text-sm font-semibold select-none disabled:opacity-60"
              >
                {t("fillDemoParent")}
              </button>
            </div>

            {/* Form */}
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {/* Email Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink-dim">{t("email")}</label>
                <input 
                  {...register("email")} 
                  placeholder={t("email")}
                  className="w-full"
                  type="email"
                  autoComplete="username"
                />
                {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-ink-dim">{t("password")}</label>
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-brand-300 hover:text-brand-200 transition-colors underline underline-offset-2"
                  >
                    {t("forgotLink")}
                  </button>
                </div>
                <div className="relative">
                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder={t("password")}
                    className="w-full !pr-11"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim hover:text-white transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
              </div>

              {/* Error Message */}
              {apiError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
                  {apiError}
                </div>
              )}

              {/* Submit Button */}
              <button 
                disabled={isSubmitting} 
                className="w-full btn-primary py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {t("signingIn")}
                  </div>
                ) : (
                  t("signIn")
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700/50"></div>
              <p className="text-xs text-ink-dim">{t("or")}</p>
              <div className="flex-1 h-px bg-slate-700/50"></div>
            </div>

            {/* Footer */}
            <div className="text-center space-y-2">
              <p className="text-xs text-ink-dim">{schoolBranding.appName}</p>
              <p className="text-xs text-brand-300 font-medium">{schoolBranding.tagline}</p>
            </div>
          </div>
        </div>

        {/* Bottom decoration */}
        <div className="mt-4 text-center">
          <p className="text-xs text-ink-dim">© 2026 {schoolBranding.schoolName}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
