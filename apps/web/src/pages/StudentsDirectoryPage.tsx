import { useEffect, useMemo, useState } from "react";
import { Edit3, Eye, Trash2, X } from "lucide-react";
import { SearchField } from "../components/SearchField";
import { api } from "../services/api";

type SharedDirectoryStudent = {
  id: string;
  displayId?: string;
  studentNumber?: string;
  externalStudentId?: string;
  fullName: string;
  classId?: string;
  className?: string;
  parentId?: string;
  annualFee?: number;
};

type SharedDirectoryParent = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  students?: SharedDirectoryStudent[];
};

type SharedDirectoryResponse = {
  source: string;
  visibility: string;
  counts: { families: number; parents: number; students: number; teachers: number };
  parents: SharedDirectoryParent[];
  students: SharedDirectoryStudent[];
};

type SchoolClass = { id: string; name: string };

type StudentFormState = {
  fullName: string;
  classId: string;
  parentId: string;
  annualFee: string;
};

const SCHOOL_SECTIONS: SchoolClass[] = [
  ...Array.from({ length: 3 }, (_v, index) => {
    const name = `K${index + 3}`;
    return { id: `section-${name.toLowerCase()}`, name };
  }),
  ...Array.from({ length: 12 }, (_v, index) => ({ id: `section-grade-${index + 1}`, name: `G${index + 1}` }))
];

function getCanonicalSchoolClass(entry: SchoolClass): SchoolClass | null {
  const normalized = entry.name.trim().toLowerCase();
  const kindergarten = normalized.match(/\bk\s*([3-5])\b/) || entry.id.toLowerCase().match(/\bk\s*([3-5])\b/);
  if (kindergarten) return { ...entry, name: `K${kindergarten[1]}` };

  const grade = normalized.match(/\b(?:grade|g)\s*([1-9]|1[0-2])\b/) || entry.id.toLowerCase().match(/\b(?:grade|g)[-\s]*([1-9]|1[0-2])\b/);
  if (grade) return { ...entry, name: `G${Number(grade[1])}` };

  return null;
}

function getSchoolClassOptions(classes: SchoolClass[]) {
  const byName = new Map<string, SchoolClass>();
  for (const fallbackClass of SCHOOL_SECTIONS) {
    const canonical = getCanonicalSchoolClass(fallbackClass);
    if (canonical) byName.set(canonical.name, canonical);
  }
  for (const classEntry of classes) {
    const canonical = getCanonicalSchoolClass(classEntry);
    if (canonical) byName.set(canonical.name, canonical);
  }

  return [...byName.values()].sort((a, b) => {
    const rank = (name: string) => name.startsWith("K") ? Number(name.slice(1)) : 10 + Number(name.slice(1));
    return rank(a.name) - rank(b.name);
  });
}

function StudentDetailModal({ student, parent, onClose }: { student: SharedDirectoryStudent; parent?: SharedDirectoryParent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-ink-dim hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Fiche eleve</p>
        <h2 className="mt-2 pr-10 font-display text-2xl font-bold text-white">{student.fullName}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">ID eleve</p>
            <p className="mt-1 break-words font-mono text-sm font-bold text-cyan-200">{student.displayId || student.studentNumber || student.id}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Classe</p>
            <p className="mt-1 font-semibold text-white">{student.className || student.classId || "Classe non renseignee"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Parent</p>
            <p className="mt-1 font-semibold text-white">{parent?.fullName || "Parent non retrouve"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Frais annuels</p>
            <p className="mt-1 font-mono font-bold text-emerald-300">{typeof student.annualFee === "number" ? `$ ${student.annualFee.toFixed(2)}` : "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentEditModal({
  student,
  parent,
  parents,
  classes,
  saving,
  onSave,
  onClose
}: {
  student: SharedDirectoryStudent;
  parent?: SharedDirectoryParent;
  parents: SharedDirectoryParent[];
  classes: SchoolClass[];
  saving: boolean;
  onSave: (state: StudentFormState) => Promise<void>;
  onClose: () => void;
}) {
  const classOptions = useMemo(() => getSchoolClassOptions(classes), [classes]);
  const [form, setForm] = useState<StudentFormState>({
    fullName: student.fullName,
    classId: student.classId || "",
    parentId: parent?.id || student.parentId || "",
    annualFee: typeof student.annualFee === "number" ? String(student.annualFee) : ""
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-ink-dim hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-10 font-display text-2xl font-bold text-white">Modifier l'eleve</h2>
        <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); void onSave(form); }}>
          <input className="input" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nom complet" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <select className="input" value={form.classId} onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value }))} required>
              <option value="">Classe</option>
              <optgroup label="Maternelle">
                {classOptions.filter((item) => item.name.startsWith("K")).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
              <optgroup label="G1 - G12">
                {classOptions.filter((item) => item.name.startsWith("G")).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            </select>
            <input className="input" type="number" min="0" step="0.01" value={form.annualFee} onChange={(event) => setForm((current) => ({ ...current, annualFee: event.target.value }))} placeholder="Frais annuels" required />
          </div>
          <select className="input" value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))} required>
            <option value="">Parent</option>
            {parents.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
          </select>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-60">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentDeleteModal({ student, deleting, onConfirm, onClose }: { student: SharedDirectoryStudent; deleting: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-danger/30 bg-slate-950 p-5 shadow-2xl">
        <h2 className="font-display text-xl font-bold text-white">Supprimer l'eleve</h2>
        <p className="mt-3 text-sm text-ink-dim">Cette action supprimera {student.fullName} de la liste des eleves.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">Annuler</button>
          <button type="button" onClick={() => void onConfirm()} disabled={deleting} className="flex-1 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudentsDirectoryPage() {
  const [directory, setDirectory] = useState<SharedDirectoryResponse | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<SharedDirectoryStudent | null>(null);
  const [editTarget, setEditTarget] = useState<SharedDirectoryStudent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SharedDirectoryStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setApiError(null);

    const [directoryResult, classesResult] = await Promise.allSettled([
      api<SharedDirectoryResponse>("/api/shared-directory"),
      api<SchoolClass[]>("/api/classes")
    ]);

    if (directoryResult.status === "fulfilled") {
      setDirectory(directoryResult.value);
    } else {
      setApiError(directoryResult.reason instanceof Error ? directoryResult.reason.message : "Impossible de charger l'annuaire des eleves.");
    }

    setClasses(classesResult.status === "fulfilled" && classesResult.value.length ? classesResult.value : SCHOOL_SECTIONS);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const parentByStudentId = useMemo(() => {
    const lookup = new Map<string, SharedDirectoryParent>();
    for (const parent of directory?.parents ?? []) {
      for (const student of parent.students ?? []) {
        lookup.set(student.id, parent);
      }
    }
    return lookup;
  }, [directory]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const students = directory?.students ?? [];
    if (!query) return students;

    return students.filter((student) => {
      const parent = parentByStudentId.get(student.id);
      const haystack = [
        student.fullName,
        student.displayId,
        student.studentNumber,
        student.externalStudentId,
        student.className,
        student.classId,
        parent?.fullName,
        parent?.phone,
        parent?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [directory, parentByStudentId, search]);

  const handleUpdateStudent = async (state: StudentFormState) => {
    if (!editTarget) return;
    try {
      setSaving(true);
      setApiError(null);
      await api(`/api/students/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: state.fullName,
          classId: state.classId,
          parentId: state.parentId,
          annualFee: Number(state.annualFee)
        })
      });
      setEditTarget(null);
      await load();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de modifier l'eleve.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setApiError(null);
      await api(`/api/students/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de supprimer l'eleve.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {viewTarget && <StudentDetailModal student={viewTarget} parent={parentByStudentId.get(viewTarget.id)} onClose={() => setViewTarget(null)} />}
      {editTarget && (
        <StudentEditModal
          student={editTarget}
          parent={parentByStudentId.get(editTarget.id)}
          parents={directory?.parents ?? []}
          classes={classes}
          saving={saving}
          onSave={handleUpdateStudent}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && <StudentDeleteModal student={deleteTarget} deleting={deleting} onConfirm={handleDeleteStudent} onClose={() => setDeleteTarget(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-4 animate-fadeInDown">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Annuaire des eleves</h1>
          <p className="mt-1 text-ink-dim">
            Liste centralisee des eleves venant du registre partage Orbit via Savanex, comme pour les parents.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-right">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Source</p>
          <p className="mt-1 text-sm font-semibold text-white">{directory?.source ?? "Chargement..."}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 animate-fadeInUp">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Eleves</p>
          <p className="mt-1 font-display text-3xl font-bold text-cyan-300">{directory?.counts.students ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Parents</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand-300">{directory?.counts.parents ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Familles</p>
          <p className="mt-1 font-display text-3xl font-bold text-emerald-300">{directory?.counts.families ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Resultats</p>
          <p className="mt-1 font-display text-3xl font-bold text-white">{filteredStudents.length}</p>
        </div>
      </div>

      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un eleve, une classe, un parent ou un identifiant..." wrapperClassName="animate-fadeInUp" />

      {apiError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {apiError}
        </div>
      )}

      <div className="card !p-0 overflow-hidden animate-fadeInUp">
        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-ink-dim">Aucun eleve trouve.</div>
        ) : (
          <div className="edupay-scrollbar overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">ID eleve</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Nom complet</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Classe</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Parent</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Frais annuels</th>
                  <th className="px-5 py-4 text-center text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => {
                  const parent = parentByStudentId.get(student.id);
                  return (
                    <tr key={student.id} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors" style={{ animationDelay: `${index * 0.03}s` }}>
                      <td className="px-5 py-4">
                        <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-xs font-bold text-cyan-200">
                          {student.displayId || student.studentNumber || student.id}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">{student.fullName}</p>
                        <p className="text-xs text-ink-dim">{student.externalStudentId || student.id}</p>
                      </td>
                      <td className="px-5 py-4 text-ink-dim">{student.className || student.classId || "Classe non renseignee"}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-white">{parent?.fullName || "Parent non retrouve"}</p>
                        <p className="text-xs text-ink-dim">{parent?.phone || parent?.email || "Aucun contact"}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-emerald-300">
                        {typeof student.annualFee === "number" ? `$ ${student.annualFee.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => setViewTarget(student)} className="rounded-lg bg-slate-700/50 p-2 text-ink-dim transition-all hover:bg-slate-600/50 hover:text-white" title="Voir">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setEditTarget(student)} className="rounded-lg bg-brand-500/20 p-2 text-brand-300 transition-all hover:bg-brand-500/30" title="Modifier">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteTarget(student)} className="rounded-lg bg-danger/20 p-2 text-danger transition-all hover:bg-danger/30" title="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
