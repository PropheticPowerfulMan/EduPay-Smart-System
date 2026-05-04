import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

/* ─── Types ─────────────────────────────────────────────────────── */
type Student = {
  id: string;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
};

type Parent = {
  id: string;
  nom: string;
  postnom: string;
  prenom: string;
  fullName: string;
  phone: string;
  email: string;
  students: Student[];
  createdAt: string;
};

type SchoolClass = { id: string; name: string };

type FormState = {
  nom: string;
  postnom: string;
  prenom: string;
  phone: string;
  email: string;
  students: { fullName: string; classId: string; annualFee: string }[];
};

const EMPTY_FORM: FormState = {
  nom: "",
  postnom: "",
  prenom: "",
  phone: "",
  email: "",
  students: []
};

const EMPTY_STUDENT = { fullName: "", classId: "", annualFee: "" };

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

/* ─── Sub-components ─────────────────────────────────────────────── */
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {text}
    </span>
  );
}

/* ─── Detail Modal ───────────────────────────────────────────────── */
function DetailModal({ parent, onClose, t }: { parent: Parent; onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg glass rounded-2xl p-8 space-y-6 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300 mb-1">{t("pmParentId")}: {parent.id}</p>
          <h2 className="font-display text-2xl font-bold text-white">{parent.fullName}</h2>
          <p className="text-xs text-ink-dim mt-1">{t("pmRegisteredOn")} {new Date(parent.createdAt).toLocaleDateString()}</p>
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
                    {new Intl.NumberFormat().format(st.annualFee)} FC
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

  const setStudent = (idx: number, key: string, value: string) => {
    setForm((f) => {
      const students = [...f.students];
      students[idx] = { ...students[idx], [key]: value };
      return { ...f, students };
    });
  };

  const addStudent = () => setForm((f) => ({ ...f, students: [...f.students, { ...EMPTY_STUDENT }] }));
  const removeStudent = (idx: number) => setForm((f) => ({ ...f, students: f.students.filter((_, i) => i !== idx) }));

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
      <div className="relative w-full max-w-2xl glass rounded-2xl p-8 space-y-6 animate-fadeInUp my-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        {/* Children section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
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
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-slate-700/50 bg-slate-900/30">
              <div className="space-y-1">
                <label className="text-xs text-ink-dim">{t("pmChildName")}</label>
                <input value={st.fullName} onChange={(e) => setStudent(idx, "fullName", e.target.value)} className="w-full" placeholder={t("pmChildNamePlaceholder")} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-dim">{t("pmChildClass")}</label>
                <select value={st.classId} onChange={(e) => setStudent(idx, "classId", e.target.value)} className="w-full">
                  <option value="">{t("pmSelectClass")}</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-dim">{t("pmAnnualFee")} (FC)</label>
                <div className="flex gap-2">
                  <input type="number" value={st.annualFee} onChange={(e) => setStudent(idx, "annualFee", e.target.value)} className="flex-1" placeholder="50000" />
                  <button type="button" onClick={() => removeStudent(idx)}
                    className="p-2 rounded-lg bg-danger/20 border border-danger/40 text-danger hover:bg-danger/30 transition-all active:scale-95">
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
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

  const load = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [p, c] = await Promise.all([
        api<Parent[]>("/api/parents"),
        api<SchoolClass[]>("/api/classes")
      ]);
      setParents(p);
      setClasses(c);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return parents;
    return parents.filter((p) =>
      p.fullName.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      p.email.toLowerCase().includes(q)
    );
  }, [parents, search]);

  const handleSave = async (form: FormState, id?: string) => {
    const fullName = [form.nom, form.postnom, form.prenom].filter(Boolean).join(" ");
    const body = { ...form, fullName };
    try {
      setApiError(null);
      if (id) {
        await api(`/api/parents/${id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/parents", { method: "POST", body: JSON.stringify(body) });
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

  const openEdit = (p: Parent) => { setEditTarget(p); setShowForm(true); };

  const stats = useMemo(() => ({
    total: parents.length,
    totalStudents: parents.reduce((s, p) => s + p.students.length, 0)
  }), [parents]);

  return (
    <div className="space-y-6 pb-8">
      {/* Modals */}
      {viewTarget && <DetailModal parent={viewTarget} onClose={() => setViewTarget(null)} t={t} />}
      {deleteTarget && <DeleteModal parent={deleteTarget} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} t={t} />}
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
                        {parent.id}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent shrink-0 flex items-center justify-center text-white text-xs font-bold">
                          {parent.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{parent.fullName}</p>
                          <p className="text-xs text-ink-dim">{new Date(parent.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-ink-dim hidden md:table-cell">{parent.phone || "—"}</td>
                    <td className="py-4 px-5 text-ink-dim hidden lg:table-cell truncate max-w-[180px]">{parent.email || "—"}</td>
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
