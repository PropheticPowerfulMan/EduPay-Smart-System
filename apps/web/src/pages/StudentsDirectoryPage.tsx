import { useEffect, useMemo, useState } from "react";
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

export function StudentsDirectoryPage() {
  const [directory, setDirectory] = useState<SharedDirectoryResponse | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setApiError(null);

    api<SharedDirectoryResponse>("/api/shared-directory")
      .then((response) => {
        if (!active) return;
        setDirectory(response);
      })
      .catch((error) => {
        if (!active) return;
        setApiError(error instanceof Error ? error.message : "Impossible de charger l'annuaire des eleves.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
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

  return (
    <div className="space-y-6 pb-8">
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