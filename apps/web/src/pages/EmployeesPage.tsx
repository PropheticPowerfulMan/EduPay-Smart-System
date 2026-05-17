import { useEffect, useMemo, useState } from "react";
import { SearchField } from "../components/SearchField";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";

type Employee = {
  id: string;
  orbitId?: string;
  displayId?: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  accessCode?: string | null;
  subject?: string | null;
  employeeId?: string | null;
  employeeType?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  mustChangePassword?: boolean;
  organizationId?: string | null;
  externalIds: Array<{ appSlug: string; externalId: string }>;
};

type EmployeeFormState = {
  fullName: string;
  phone: string;
  email: string;
  accessCode: string;
  subject: string;
  employeeId: string;
  employeeType: string;
  department: string;
  jobTitle: string;
  mustChangePassword: boolean;
};

const EMPTY_FORM: EmployeeFormState = {
  fullName: "",
  phone: "",
  email: "",
  accessCode: "",
  subject: "",
  employeeId: "",
  employeeType: "",
  department: "",
  jobTitle: "",
  mustChangePassword: false,
};

function EyeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative glass w-full max-w-3xl rounded-3xl border border-white/10 p-6 shadow-2xl animate-fadeInUp" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-dim transition-colors hover:text-white">
          <XIcon />
        </button>
        <div className="mb-6 pr-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Employés</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-white">{title}</h2>
          {subtitle ? <p className="mt-2 text-sm text-ink-dim">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function toFormState(employee: Employee): EmployeeFormState {
  return {
    fullName: employee.fullName || "",
    phone: employee.phone || "",
    email: employee.email || "",
    accessCode: employee.accessCode || "",
    subject: employee.subject || "",
    employeeId: employee.employeeId || employee.displayId || "",
    employeeType: employee.employeeType || "",
    department: employee.department || "",
    jobTitle: employee.jobTitle || "",
    mustChangePassword: Boolean(employee.mustChangePassword),
  };
}

function infoValue(value?: string | null) {
  return value?.trim() ? value : "Non renseigné";
}

export function EmployeesPage() {
  const role = useAuthStore((state) => state.role);
  const canManageEmployees = ["SUPER_ADMIN", "OWNER", "ADMIN", "HR_MANAGER"].includes(role || "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  async function loadEmployees() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Employee[]>("/api/shared-directory/teachers");
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les employés.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((employee) => [
      employee.fullName,
      employee.displayId,
      employee.employeeId,
      employee.email,
      employee.phone,
      employee.department,
      employee.jobTitle,
      employee.subject,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [employees, search]);

  const stats = useMemo(() => {
    const departments = new Set(employees.map((employee) => employee.department?.trim()).filter((value): value is string => Boolean(value)));
    const withAccessCode = employees.filter((employee) => employee.accessCode?.trim()).length;
    return {
      total: employees.length,
      departments: departments.size,
      withAccessCode,
    };
  }, [employees]);

  function openEditModal(employee: Employee) {
    setEditingEmployee(employee);
    setForm(toFormState(employee));
  }

  function closeEditModal() {
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
  }

  async function handleSaveEmployee() {
    if (!editingEmployee) return;
    const identifier = editingEmployee.orbitId || editingEmployee.id;
    if (!identifier) return;

    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/shared-directory/teachers/${encodeURIComponent(identifier)}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim() ? form.phone.trim() : null,
          email: form.email.trim() ? form.email.trim() : null,
          accessCode: form.accessCode.trim() ? form.accessCode.trim() : null,
          subject: form.subject.trim() ? form.subject.trim() : null,
          employeeId: form.employeeId.trim() ? form.employeeId.trim() : null,
          employeeType: form.employeeType.trim() ? form.employeeType.trim() : null,
          department: form.department.trim() ? form.department.trim() : null,
          jobTitle: form.jobTitle.trim() ? form.jobTitle.trim() : null,
          mustChangePassword: form.mustChangePassword,
        }),
      });
      closeEditModal();
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de mettre à jour cet employé.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEmployee() {
    if (!deleteTarget) return;
    const identifier = deleteTarget.orbitId || deleteTarget.id;
    if (!identifier) return;

    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/shared-directory/teachers/${encodeURIComponent(identifier)}`, { method: "DELETE" });
      setDeleteTarget(null);
      if (selectedEmployee?.id === deleteTarget.id) {
        setSelectedEmployee(null);
      }
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer cet employé.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fadeInDown">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-white">Répertoire des employés</h1>
          <p className="mt-1 text-ink-dim">
            Liste centralisée du personnel synchronisé depuis SAVANEX, avec une lecture plus proche des surfaces Élèves et Gestion parents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-right">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Source</p>
            <p className="mt-1 text-sm font-semibold text-white">SAVANEX</p>
          </div>
          <button
            onClick={() => void loadEmployees()}
            className="inline-flex h-[52px] items-center justify-center rounded-xl border border-brand-300/25 bg-white/[0.05] px-4 text-sm font-semibold text-white transition hover:border-brand-300/45 hover:bg-brand-500/12"
          >
            Actualiser la liste
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 animate-fadeInUp">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Employés</p>
          <p className="mt-1 font-display text-3xl font-bold text-cyan-300">{stats.total}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Départements</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand-300">{stats.departments}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Codes d'accès</p>
          <p className="mt-1 font-display text-3xl font-bold text-emerald-300">{stats.withAccessCode}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Résultats</p>
          <p className="mt-1 font-display text-3xl font-bold text-white">{filteredEmployees.length}</p>
        </div>
      </div>

      <SearchField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Rechercher un employé, un matricule, un département, un poste ou un contact..."
        wrapperClassName="animate-fadeInUp"
      />

      {error ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger animate-fadeInUp">
          {error}
        </div>
      ) : null}

      <div className="card !p-0 overflow-hidden animate-fadeInUp">
        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-ink-dim">Aucun employé ne correspond à votre recherche.</div>
        ) : (
          <div className="edupay-scrollbar overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">ID employé</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Nom complet</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Département</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Profil</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Contact</th>
                  <th className="px-5 py-4 text-center text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee, index) => (
                  <tr key={employee.id} className="border-b border-slate-700/30 transition-colors hover:bg-slate-800/30" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td className="px-5 py-4">
                      <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-xs font-bold text-cyan-200">
                        {employee.displayId || employee.employeeId || employee.id}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">{employee.fullName}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-ink-dim">{infoValue(employee.jobTitle)}</span>
                        {employee.accessCode?.trim() ? (
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">Code d'accès actif</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-ink-dim">{infoValue(employee.department)}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{infoValue(employee.employeeType)}</p>
                      <p className="mt-1 text-xs text-ink-dim">{infoValue(employee.subject)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{infoValue(employee.email)}</p>
                      <p className="mt-1 text-xs text-ink-dim">{infoValue(employee.phone)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedEmployee(employee)}
                          className="rounded-lg bg-slate-700/50 p-2 text-ink-dim transition-all hover:bg-slate-600/50 hover:text-white"
                          title="Voir"
                        >
                          <EyeIcon />
                        </button>
                        {canManageEmployees ? (
                          <>
                            <button
                              onClick={() => openEditModal(employee)}
                              className="rounded-lg bg-brand-500/20 p-2 text-brand-300 transition-all hover:bg-brand-500/30"
                              title="Modifier"
                            >
                              <EditIcon />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(employee)}
                              className="rounded-lg bg-danger/20 p-2 text-danger transition-all hover:bg-danger/30"
                              title="Supprimer"
                            >
                              <TrashIcon />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedEmployee ? (
        <ModalShell title={selectedEmployee.fullName} subtitle="Fiche détaillée de l'employé dans le registre partagé." onClose={() => setSelectedEmployee(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Identifiant affiché</p>
              <p className="mt-2 text-sm font-semibold text-white">{selectedEmployee.displayId || selectedEmployee.employeeId || selectedEmployee.id}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Matricule interne</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.employeeId)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Département</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.department)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Poste</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.jobTitle)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Email</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.email)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Téléphone</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.phone)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Matière ou spécialité</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.subject)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Type d'employé</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.employeeType)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Codes externes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedEmployee.externalIds.length > 0 ? selectedEmployee.externalIds.map((item) => (
                  <span key={`${item.appSlug}-${item.externalId}`} className="rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-100">
                    {item.appSlug}: {item.externalId}
                  </span>
                )) : <span className="text-sm text-ink-dim">Aucun identifiant externe.</span>}
              </div>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {editingEmployee ? (
        <ModalShell title="Modifier un employé" subtitle="Chaque champ est explicite et peut être vidé si l'information n'est plus valable." onClose={closeEditModal}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-white">Nom complet</span>
              <input className="w-full" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Ex. Mireille Ilunga" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Email</span>
              <input className="w-full" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="nom@ecole.cd" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Téléphone</span>
              <input className="w-full" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+243 ..." />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Matricule employé</span>
              <input className="w-full" value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} placeholder="EMP-001" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Type d'employé</span>
              <input className="w-full" value={form.employeeType} onChange={(event) => setForm((current) => ({ ...current, employeeType: event.target.value }))} placeholder="TEACHING ou STAFF" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Département</span>
              <input className="w-full" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Académique" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Poste</span>
              <input className="w-full" value={form.jobTitle} onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))} placeholder="Teacher" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Matière ou spécialité</span>
              <input className="w-full" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Mathématiques" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Code d'accès</span>
              <input className="w-full" value={form.accessCode} onChange={(event) => setForm((current) => ({ ...current, accessCode: event.target.value }))} placeholder="ACC-TCH-..." />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 md:col-span-2">
              <input type="checkbox" checked={form.mustChangePassword} onChange={(event) => setForm((current) => ({ ...current, mustChangePassword: event.target.checked }))} />
              <span className="text-sm text-white">Exiger un changement de mot de passe à la prochaine connexion</span>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={closeEditModal} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-ink-dim transition hover:text-white">
              Annuler
            </button>
            <button
              onClick={() => void handleSaveEmployee()}
              disabled={submitting || !form.fullName.trim()}
              className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {deleteTarget ? (
        <ModalShell title="Supprimer cet employé" subtitle="Cette action retire l'employé du registre partagé pour l'application." onClose={() => setDeleteTarget(null)}>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            Vous êtes sur le point de supprimer <span className="font-semibold text-white">{deleteTarget.fullName}</span>. Cette opération est irréversible.
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={() => setDeleteTarget(null)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-ink-dim transition hover:text-white">
              Annuler
            </button>
            <button
              onClick={() => void handleDeleteEmployee()}
              disabled={submitting}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Suppression..." : "Supprimer définitivement"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}