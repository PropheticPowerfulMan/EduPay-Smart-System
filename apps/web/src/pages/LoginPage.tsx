import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FontSwitch } from "../components/FontSwitch";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";

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
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

        {step === "form" ? (
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
  const [quickLoginRole, setQuickLoginRole] = useState<"ADMIN" | "PARENT" | null>(null);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: demoCredentials
  });

  const loginWithCredentials = async (values: LoginInput) => {
    setApiError(null);
    const result = await api<{ token: string; role: "ADMIN" | "ACCOUNTANT" | "PARENT"; fullName: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: values.email.trim().toLowerCase(),
        password: values.password.trim()
      })
    });
    setAuth(result.token, result.role, result.fullName);
    window.location.replace(result.role === "PARENT" ? "/parent" : "/");
  };

  const onSubmit = async (values: LoginInput) => {
    try {
      await loginWithCredentials(values);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("loginFailedHint");
      setApiError(message);
    }
  };

  const handleQuickLogin = async (role: "ADMIN" | "PARENT") => {
    const creds = role === "PARENT" ? parentDemoCredentials : demoCredentials;
    setApiError(null);
    setQuickLoginRole(role);
    setValue("email", creds.email, { shouldValidate: true });
    setValue("password", creds.password, { shouldValidate: true });
    try {
      await loginWithCredentials(creds);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("loginFailedHint");
      setApiError(message);
      setQuickLoginRole(null);
    }
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
            
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-4">
                <img 
                  src={schoolBranding.logoSrc} 
                  alt={`Logo ${schoolBranding.schoolName}`} 
                  className="h-16 w-16 rounded-xl border-2 border-white/30 bg-white/10 p-2 shadow-lg" 
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{schoolBranding.shortName}</p>
                  <h1 className="font-display text-2xl font-bold text-white leading-tight">{schoolBranding.schoolName}</h1>
                </div>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8 space-y-6">
            {/* Language Switch */}
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">{t("loginTitle")}</h2>
                <p className="text-sm text-ink-dim mt-1">{t("loginSubtitle")}</p>
              </div>
              <div className="flex items-center gap-2">
                <FontSwitch />
                <LanguageSwitch />
              </div>
            </div>

            {/* Demo Button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleQuickLogin("ADMIN")}
                disabled={isSubmitting || quickLoginRole !== null}
                className="w-full p-3 rounded-lg border border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 hover:border-brand-500/50 active:scale-95 active:brightness-90 active:shadow-inner transition-all duration-150 text-sm font-semibold select-none disabled:opacity-60"
              >
                {quickLoginRole === "ADMIN" ? t("signingIn") : t("fillDemoAdmin")}
              </button>
              <button
                type="button"
                onClick={() => void handleQuickLogin("PARENT")}
                disabled={isSubmitting || quickLoginRole !== null}
                className="w-full p-3 rounded-lg border border-accent/40 bg-accent/10 text-pink-300 hover:bg-accent/20 hover:border-accent/60 active:scale-95 active:brightness-90 active:shadow-inner transition-all duration-150 text-sm font-semibold select-none disabled:opacity-60"
              >
                {quickLoginRole === "PARENT" ? t("signingIn") : t("fillDemoParent")}
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
