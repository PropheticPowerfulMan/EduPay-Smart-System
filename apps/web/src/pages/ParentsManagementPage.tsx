import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

/* ─── Types ─────────────────────────────────────────────────────── */
type Student = {
  id: string;
  displayId?: string;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
};

type Parent = {
  id: string;
  displayId?: string;
  nom: string;
  postnom: string;
  prenom: string;
  fullName: string;
  phone: string;
  email: string;
  photoUrl?: string;
  students: Student[];
  createdAt: string;
};

type ParentCredentials = {
  parentId: string;
  parentName: string;
  email: string;
  accessCode?: string;
  temporaryPassword: string;
  notificationStatus?: {
    email?: string;
    sms?: string;
  };
};

type SchoolClass = { id: string; name: string };

type FormState = {
  nom: string;
  postnom: string;
  prenom: string;
  phone: string;
  email: string;
  photoUrl: string;
  notifyEmail: boolean;
  notifySms: boolean;
  students: { fullName: string; classId: string; annualFee: string }[];
};

const EMPTY_FORM: FormState = {
  nom: "",
  postnom: "",
  prenom: "",
  phone: "",
  email: "",
  photoUrl: "",
  notifyEmail: true,
  notifySms: true,
  students: []
};

const EMPTY_STUDENT = { fullName: "", classId: "", annualFee: "" };

const SCHOOL_SECTIONS: SchoolClass[] = [
  ...Array.from({ length: 5 }, (_v, index) => {
    const name = `K${index + 1}`;
    return { id: `section-${name.toLowerCase()}`, name };
  }),
  ...Array.from({ length: 12 }, (_v, index) => {
    const grade = index + 1;
    return { id: `section-grade-${grade}`, name: `Grade ${grade}` };
  })
];

/* ─── Icons ──────────────────────────────────────────────────────── */
function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l8-8 3 3-2 2-2-2-2 2 2 2-2 2" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 4h16v16H4z" /><path d="m22 6-10 7L2 6" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.6a2 2 0 0 1-.45 2.11L8 9.72a16 16 0 0 0 6.29 6.29l1.29-1.29a2 2 0 0 1 2.11-.45c.83.3 1.7.51 2.6.63A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {text}
    </span>
  );
}

function CredentialsModal({ credentials, onClose }: { credentials: ParentCredentials; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copyText = `Identifiant: ${credentials.email}\nCode d'accès: ${credentials.accessCode || "Non renseigne"}\nMot de passe temporaire: ${credentials.temporaryPassword}`;

  const copy = async () => {
    await navigator.clipboard?.writeText(copyText).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md glass rounded-2xl p-8 space-y-5 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/20 text-brand-200">
            <KeyIcon />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">{t("parentAccessGenerated")}</p>
            <h3 className="font-display text-xl font-bold text-white">{credentials.parentName}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {t("parentAccessHelp")}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-dim">{t("loginEmail")}</p>
            <p className="mt-1 font-mono text-sm font-bold text-white">{credentials.email}</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-dim">Code d'accès</p>
            <p className="mt-1 font-mono text-sm font-bold text-cyan-300">{credentials.accessCode || "Non renseigne"}</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-dim">Mot de passe temporaire</p>
            <p className="mt-1 font-mono text-lg font-black text-emerald-300">{credentials.temporaryPassword}</p>
          </div>
          {credentials.notificationStatus && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-ink-dim">Email</p>
                <p className="mt-1 text-sm font-bold text-cyan-300">{credentials.notificationStatus.email || "SKIPPED"}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-ink-dim">SMS</p>
                <p className="mt-1 text-sm font-bold text-cyan-300">{credentials.notificationStatus.sms || "SKIPPED"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={copy} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 transition-all">
            {copied ? "Copie" : "Copier les acces"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Modal ───────────────────────────────────────────────── */
function AccessNotificationModal({
  parent,
  onClose,
  onConfirm,
  loading
}: {
  parent: Parent;
  onClose: () => void;
  onConfirm: (channels: { notifyEmail: boolean; notifySms: boolean }) => void;
  loading: boolean;
}) {
  const [notifyEmail, setNotifyEmail] = useState(Boolean(parent.email));
  const [notifySms, setNotifySms] = useState(Boolean(parent.phone));
  const disabled = loading || (!notifyEmail && !notifySms);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md glass rounded-2xl p-6 space-y-5 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-dim hover:text-white">
          <XIcon />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Notifications d'accès</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-white">{parent.fullName}</h2>
          <p className="mt-2 text-sm text-ink-dim">
            Regénérer un mot de passe temporaire et envoyer les accès au parent par les canaux activés.
          </p>
        </div>

        <div className="grid gap-3">
          <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-all ${notifyEmail ? "border-cyan-500/40 bg-cyan-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-white/[0.05] p-2 text-cyan-300"><MailIcon /></span>
              <span>
                <span className="block text-sm font-bold text-white">Email</span>
                <span className="block truncate text-xs text-ink-dim">{parent.email || "Aucun email renseigné"}</span>
              </span>
            </span>
            <input type="checkbox" checked={notifyEmail} disabled={!parent.email} onChange={(e) => setNotifyEmail(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
          </label>

          <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-all ${notifySms ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-white/[0.05] p-2 text-emerald-300"><PhoneIcon /></span>
              <span>
                <span className="block text-sm font-bold text-white">SMS</span>
                <span className="block truncate text-xs text-ink-dim">{parent.phone || "Aucun téléphone renseigné"}</span>
              </span>
            </span>
            <input type="checkbox" checked={notifySms} disabled={!parent.phone} onChange={(e) => setNotifySms(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-600 py-3 text-sm font-semibold text-ink-dim hover:text-white">
            Annuler
          </button>
          <button
            onClick={() => onConfirm({ notifyEmail, notifySms })}
            disabled={disabled}
            className="flex-1 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Envoi..." : "Envoyer les accès"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ parent, onClose, t }: { parent: Parent; onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg glass rounded-2xl p-8 space-y-6 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300 mb-1">{t("pmParentId")}: {parent.displayId || parent.id}</p>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-brand-500 to-accent shrink-0">
              {parent.photoUrl ? (
                <img src={parent.photoUrl} alt={parent.fullName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-black text-white">
                  {parent.fullName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-white">{parent.fullName}</h2>
              <p className="text-xs text-ink-dim mt-1">{t("pmRegisteredOn")} {new Date(parent.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
            <p className="text-xs text-ink-dim">{t("pmPhone")}</p>
            <p className="text-sm font-semibold text-white mt-1">{parent.phone || "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
            <p className="text-xs text-ink-dim">{t("email")}</p>
            <p className="text-sm font-semibold text-white mt-1 truncate">{parent.email || "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
            <p className="text-xs text-ink-dim">{t("pmNom")}</p>
            <p className="text-sm font-semibold text-white mt-1">{parent.nom}</p>
          </div>
          <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
            <p className="text-xs text-ink-dim">{t("pmPostnom")}</p>
            <p className="text-sm font-semibold text-white mt-1">{parent.postnom}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-ink-dim uppercase tracking-[0.1em] mb-3">
            {t("pmChildren")} ({parent.students.length})
          </p>
          {parent.students.length === 0 ? (
            <p className="text-sm text-ink-dim italic">{t("pmNoChildren")}</p>
          ) : (
            <div className="space-y-2">
              {parent.students.map((st) => (
                <div key={st.id} className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-slate-700/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{st.fullName}</p>
                    <p className="text-xs text-ink-dim">{st.className || st.classId}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-300">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(st.annualFee)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Confirm Modal ───────────────────────────────────────── */
function DeleteModal({ parent, onConfirm, onClose, t }: {
  parent: Parent; onConfirm: () => void; onClose: () => void; t: (k: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm glass rounded-2xl p-8 space-y-6 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-14 h-14 rounded-full bg-danger/20 flex items-center justify-center">
          <TrashIcon />
        </div>
        <div className="text-center">
          <h3 className="font-display text-xl font-bold text-white">{t("pmDeleteTitle")}</h3>
          <p className="text-sm text-ink-dim mt-2">{t("pmDeleteConfirm")} <span className="text-white font-semibold">{parent.fullName}</span> ?</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-slate-600 text-ink-dim hover:text-white hover:border-slate-500 transition-all font-semibold text-sm">
            {t("pmCancel")}
          </button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-lg bg-danger/90 hover:bg-danger text-white font-semibold text-sm transition-all active:scale-95">
            {t("pmDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form Modal ─────────────────────────────────────────────────── */
function FormModal({ initial, classes, onSave, onClose, t }: {
  initial: Parent | null;
  classes: SchoolClass[];
  onSave: (form: FormState, id?: string) => Promise<void>;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return EMPTY_FORM;
    return {
      nom: initial.nom,
      postnom: initial.postnom,
      prenom: initial.prenom,
      phone: initial.phone,
      email: initial.email,
      photoUrl: initial.photoUrl || "",
      notifyEmail: true,
      notifySms: true,
      students: initial.students.map((s) => ({
        fullName: s.fullName,
        classId: s.classId,
        annualFee: String(s.annualFee)
      }))
    };
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const setBool = (key: "notifyEmail" | "notifySms", value: boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const setStudent = (idx: number, key: string, value: string) => {
    setForm((f) => {
      const students = [...f.students];
      students[idx] = { ...students[idx], [key]: value };
      return { ...f, students };
    });
  };

  const addStudent = () => setForm((f) => ({ ...f, students: [...f.students, { ...EMPTY_STUDENT }] }));
  const removeStudent = (idx: number) => setForm((f) => ({ ...f, students: f.students.filter((_, i) => i !== idx) }));

  const handlePhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((e) => ({ ...e, photoUrl: "Veuillez choisir une image valide." }));
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
        if (!ctx) return;
        const minSide = Math.min(image.width, image.height);
        const sx = (image.width - minSide) / 2;
        const sy = (image.height - minSide) / 2;
        ctx.drawImage(image, sx, sy, minSide, minSide, 0, 0, size, size);
        set("photoUrl", canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nom.trim()) e.nom = t("pmRequired");
    if (!form.prenom.trim()) e.prenom = t("pmRequired");
    if (!form.phone.trim()) e.phone = t("pmRequired");
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    await onSave(form, initial?.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative my-4 max-h-[92vh] w-full max-w-2xl overflow-y-auto glass rounded-2xl p-4 space-y-5 animate-fadeInUp sm:p-8 sm:space-y-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold text-white">
            {initial ? t("pmEditParent") : t("pmAddParent")}
          </h2>
          {!initial && (
            <p className="text-xs text-ink-dim mt-1">{t("pmIdAutoGenerated")}</p>
          )}
        </div>

        {/* Parent fields */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
          <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-brand-500 to-accent shrink-0">
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="Photo du parent" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                {(form.prenom || form.nom || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{t("parentPhoto")}</p>
            <p className="mt-1 text-xs text-ink-dim">{t("parentPhotoHelp")}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-500/20 px-4 py-2 text-sm font-semibold text-brand-200 hover:bg-brand-500/30">
            <CameraIcon /> {t("choose")}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.target.files?.[0])} />
          </label>
          {form.photoUrl && (
            <button type="button" onClick={() => set("photoUrl", "")} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-ink-dim hover:text-white">
              Retirer
            </button>
          )}
          {errors.photoUrl && <p className="w-full text-xs text-danger">{errors.photoUrl}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmNom")} *</label>
            <input value={form.nom} onChange={(e) => set("nom", e.target.value)} className="w-full" placeholder={t("pmNom")} />
            {errors.nom && <p className="text-xs text-danger">{errors.nom}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmPostnom")}</label>
            <input value={form.postnom} onChange={(e) => set("postnom", e.target.value)} className="w-full" placeholder={t("pmPostnom")} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmPrenom")} *</label>
            <input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} className="w-full" placeholder={t("pmPrenom")} />
            {errors.prenom && <p className="text-xs text-danger">{errors.prenom}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmPhone")} *</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full" placeholder="+243 xxx xxx xxx" />
            {errors.phone && <p className="text-xs text-danger">{errors.phone}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("email")}</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" className="w-full" placeholder="email@exemple.com" />
          </div>
        </div>

        {!initial && (
          <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold text-white">Notifications de création du compte</p>
              <p className="text-xs text-ink-dim">Choisissez les canaux utilisés pour envoyer les accès au parent.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${form.notifyEmail ? "border-cyan-500/40 bg-cyan-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-white"><MailIcon /> Email</span>
                <input type="checkbox" checked={form.notifyEmail} onChange={(e) => setBool("notifyEmail", e.target.checked)} className="h-5 w-5 accent-cyan-400" />
              </label>
              <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${form.notifySms ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-white"><PhoneIcon /> SMS</span>
                <input type="checkbox" checked={form.notifySms} onChange={(e) => setBool("notifySms", e.target.checked)} className="h-5 w-5 accent-emerald-400" />
              </label>
            </div>
          </div>
        )}

        {/* Children section */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-white uppercase tracking-[0.08em]">{t("pmChildren")}</p>
            <button type="button" onClick={addStudent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/40 text-brand-300 hover:bg-brand-500/30 text-xs font-semibold transition-all active:scale-95">
              <PlusIcon /> {t("pmAddChild")}
            </button>
          </div>
          {form.students.length === 0 && (
            <p className="text-sm text-ink-dim italic">{t("pmNoChildrenForm")}</p>
          )}
          {form.students.map((st, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700/50 bg-slate-900/30 p-3 sm:grid-cols-[1.2fr_0.9fr_0.9fr] sm:p-4">
              <div className="space-y-1">
                <label className="text-xs text-ink-dim">{t("pmChildName")}</label>
                <input value={st.fullName} onChange={(e) => setStudent(idx, "fullName", e.target.value)} className="w-full" placeholder={t("pmChildNamePlaceholder")} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-dim">{t("pmChildClass")}</label>
                <select value={st.classId} onChange={(e) => setStudent(idx, "classId", e.target.value)} className="w-full">
                  <option value="">{t("pmSelectClass")}</option>
                  <optgroup label="Kindergarten">
                    {classes.filter((c) => c.name.toLowerCase().startsWith("k")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                  <optgroup label="Grade 1 - Grade 12">
                    {classes.filter((c) => c.name.toLowerCase().startsWith("grade")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                  {classes.some((c) => !c.name.toLowerCase().startsWith("k") && !c.name.toLowerCase().startsWith("grade")) && (
                    <optgroup label="Autres">
                      {classes
                        .filter((c) => !c.name.toLowerCase().startsWith("k") && !c.name.toLowerCase().startsWith("grade"))
                        .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-dim">{t("pmAnnualFee")} (USD)</label>
                <div className="flex gap-2">
                  <input type="number" value={st.annualFee} onChange={(e) => setStudent(idx, "annualFee", e.target.value)} className="flex-1" placeholder="500" />
                  <button type="button" onClick={() => removeStudent(idx)}
                    className="p-2 rounded-lg bg-danger/20 border border-danger/40 text-danger hover:bg-danger/30 transition-all active:scale-95">
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-slate-600 text-ink-dim hover:text-white font-semibold text-sm transition-all">
            {t("pmCancel")}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-50">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("pmSaving")}
              </span>
            ) : t("pmSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export function ParentsManagementPage() {
  const { t } = useI18n();
  const [parents, setParents] = useState<Parent[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // modals
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Parent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Parent | null>(null);
  const [viewTarget, setViewTarget] = useState<Parent | null>(null);
  const [notificationTarget, setNotificationTarget] = useState<Parent | null>(null);
  const [credentials, setCredentials] = useState<ParentCredentials | null>(null);
  const [sendingAccess, setSendingAccess] = useState(false);

  const load = async () => {
    setLoading(true);
    setApiError(null);
    let nextApiError: string | null = null;
    const [parentsResult, classesResult] = await Promise.allSettled([
      api<Parent[]>("/api/parents"),
      api<SchoolClass[]>("/api/classes")
    ]);

    if (parentsResult.status === "fulfilled") {
      setParents(parentsResult.value);
    } else {
      const message = parentsResult.reason instanceof Error ? parentsResult.reason.message : "Erreur API";
      nextApiError = message;
    }

    if (classesResult.status === "fulfilled") {
      setClasses(classesResult.value.length ? classesResult.value : SCHOOL_SECTIONS);
    } else {
      setClasses(SCHOOL_SECTIONS);
      if (!nextApiError) {
        nextApiError = classesResult.reason instanceof Error ? classesResult.reason.message : "Erreur API";
      }
    }

    setApiError(nextApiError);

    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;

    return parents.filter((parent) => {
      const studentsHaystack = parent.students
        .flatMap((student) => [student.id, student.displayId, student.fullName, student.className, student.classId])
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const haystack = [
        parent.fullName,
        parent.id,
        parent.displayId || "",
        parent.phone,
        parent.email,
        studentsHaystack,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [parents, search]);

  const handleSave = async (form: FormState, id?: string) => {
    const fullName = [form.nom, form.postnom, form.prenom].filter(Boolean).join(" ");
    const body = { ...form, fullName };
    try {
      setApiError(null);
      if (id) {
        await api(`/api/parents/${id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        const created = await api<Parent & { temporaryPassword?: string; accessCode?: string; notificationStatus?: ParentCredentials["notificationStatus"] }>("/api/parents", { method: "POST", body: JSON.stringify(body) });
        if (created.temporaryPassword) {
          setCredentials({
            parentId: created.id,
            parentName: created.fullName,
            email: created.email,
            accessCode: created.accessCode,
            temporaryPassword: created.temporaryPassword,
            notificationStatus: created.notificationStatus
          });
        }
      }
      setShowForm(false);
      setEditTarget(null);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setApiError(null);
      await api(`/api/parents/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    }
  };

  const handleResetPassword = async (parent: Parent, channels: { notifyEmail: boolean; notifySms: boolean }) => {
    try {
      setSendingAccess(true);
      setApiError(null);
      const result = await api<{ parentId: string; email: string; accessCode?: string; temporaryPassword: string; notificationStatus?: ParentCredentials["notificationStatus"] }>(`/api/parents/${parent.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify(channels)
      });
      setNotificationTarget(null);
      setCredentials({
        parentId: result.parentId,
        parentName: parent.fullName,
        email: result.email,
        accessCode: result.accessCode,
        temporaryPassword: result.temporaryPassword,
        notificationStatus: result.notificationStatus
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    } finally {
      setSendingAccess(false);
    }
  };

  const openEdit = (p: Parent) => { setEditTarget(p); setShowForm(true); };

  const stats = useMemo(() => ({
    total: parents.length,
    totalStudents: parents.reduce((s, p) => s + p.students.length, 0)
  }), [parents]);

  return (
    <div className="space-y-6 pb-8">
      {/* Modals */}
      {viewTarget && <DetailModal parent={viewTarget} onClose={() => setViewTarget(null)} t={t} />}
      {credentials && <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />}
      {deleteTarget && <DeleteModal parent={deleteTarget} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} t={t} />}
      {notificationTarget && (
        <AccessNotificationModal
          parent={notificationTarget}
          loading={sendingAccess}
          onClose={() => setNotificationTarget(null)}
          onConfirm={(channels) => void handleResetPassword(notificationTarget, channels)}
        />
      )}
      {showForm && (
        <FormModal
          initial={editTarget}
          classes={classes}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          t={t}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fadeInDown">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">{t("pmTitle")}</h1>
          <p className="text-ink-dim mt-1">{t("pmSubtitle")}</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 transition-all active:scale-95"
        >
          <PlusIcon /> {t("pmAddParent")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-fadeInUp">
        <div className="card">
          <p className="text-ink-dim text-xs uppercase tracking-[0.1em]">{t("pmTotalParents")}</p>
          <p className="font-display text-3xl font-bold text-brand-300 mt-1">{stats.total}</p>
        </div>
        <div className="card">
          <p className="text-ink-dim text-xs uppercase tracking-[0.1em]">{t("pmTotalStudents")}</p>
          <p className="font-display text-3xl font-bold text-cyan-300 mt-1">{stats.totalStudents}</p>
        </div>
        <div className="card col-span-2 md:col-span-1">
          <p className="text-ink-dim text-xs uppercase tracking-[0.1em]">{t("pmSearchResults")}</p>
          <p className="font-display text-3xl font-bold text-emerald-300 mt-1">{filtered.length}</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative animate-fadeInUp">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none">
          <SearchIcon />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("pmSearchPlaceholder")}
          className="w-full !pl-11"
        />
      </div>

      {apiError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger animate-fadeInUp">
          {apiError}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden animate-fadeInUp">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3">👨‍👩‍👧</p>
            <p className="text-ink-dim">{search ? t("pmNoResults") : t("pmEmpty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmParentId")}</th>
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmFullName")}</th>
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em] hidden md:table-cell">{t("pmPhone")}</th>
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em] hidden lg:table-cell">{t("email")}</th>
                  <th className="text-center py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmChildren")}</th>
                  <th className="text-center py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((parent, idx) => (
                  <tr
                    key={parent.id}
                    className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                    style={{ animationDelay: `${idx * 0.04}s` }}
                  >
                    <td className="py-4 px-5">
                      <span className="font-mono text-xs font-bold text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2 py-1 rounded">
                        {parent.displayId || parent.id}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-accent shrink-0 flex items-center justify-center text-white text-xs font-bold border border-slate-700/60">
                          {parent.photoUrl ? (
                            <img src={parent.photoUrl} alt={parent.fullName} className="h-full w-full object-cover" />
                          ) : (
                            parent.fullName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{parent.fullName}</p>
                          <p className="text-xs text-ink-dim">{new Date(parent.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-ink-dim hidden md:table-cell">{parent.phone || "-"}</td>
                    <td className="py-4 px-5 text-ink-dim hidden lg:table-cell truncate max-w-[180px]">{parent.email || "-"}</td>
                    <td className="py-4 px-5 text-center">
                      <Badge
                        text={`${parent.students.length} ${parent.students.length === 1 ? t("pmChild") : t("pmChildrenCount")}`}
                        color={parent.students.length > 0 ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-slate-700/50 text-ink-dim"}
                      />
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setViewTarget(parent)}
                          className="p-2 rounded-lg bg-slate-700/50 text-ink-dim hover:text-white hover:bg-slate-600/50 transition-all active:scale-90" title={t("pmView")}>
                          <EyeIcon />
                        </button>
                        <button onClick={() => openEdit(parent)}
                          className="p-2 rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-all active:scale-90" title={t("pmEdit")}>
                          <EditIcon />
                        </button>
                        <button onClick={() => setNotificationTarget(parent)}
                          className="p-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all active:scale-90" title="Envoyer les accès">
                          <KeyIcon />
                        </button>
                        <button onClick={() => setDeleteTarget(parent)}
                          className="p-2 rounded-lg bg-danger/20 text-danger hover:bg-danger/30 transition-all active:scale-90" title={t("pmDelete")}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
