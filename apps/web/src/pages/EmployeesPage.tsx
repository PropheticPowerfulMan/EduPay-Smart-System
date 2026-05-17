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
    <div className="space-y-6">
      <section className="glass relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8">
        <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-300">Ressources humaines connectées</p>
            <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Employés synchronisés depuis SAVANEX</h1>
            <p className="max-w-2xl text-sm leading-6 text-ink-dim sm:text-base">
              Cette vue centralise les employés de l'école enregistrés dans l'écosystème. Vous pouvez consulter leurs informations, corriger leur profil et supprimer un employé devenu obsolète.
            </p>
          </div>
          <button
            onClick={() => void loadEmployees()}
            className="inline-flex items-center justify-center rounded-2xl border border-brand-300/25 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:border-brand-300/45 hover:bg-brand-500/12"
          >
            Actualiser la liste
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-3xl border border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Total employés</p>
          <p className="mt-3 font-display text-3xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="glass rounded-3xl border border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Départements couverts</p>
          <p className="mt-3 font-display text-3xl font-bold text-white">{stats.departments}</p>
        </div>
        <div className="glass rounded-3xl border border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Codes d'accès présents</p>
          <p className="mt-3 font-display text-3xl font-bold text-white">{stats.withAccessCode}</p>
        </div>
      </section>

      <section className="glass rounded-3xl border border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Répertoire du personnel</h2>
            <p className="mt-1 text-sm text-ink-dim">Recherche par nom, matricule, département, poste, email ou téléphone.</p>
          </div>
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un employé..."
            wrapperClassName="w-full lg:w-[380px]"
          />
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-10 text-center text-sm text-ink-dim">
            Chargement des employés...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-10 text-center text-sm text-ink-dim">
            Aucun employé ne correspond à votre recherche.
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[1.35fr_0.8fr_0.9fr_1fr_180px] gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim md:grid">
              <span>Employé</span>
              <span>Département</span>
              <span>Type</span>
              <span>Contact</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-white/10">
              {filteredEmployees.map((employee) => (
                <div key={employee.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1.35fr_0.8fr_0.9fr_1fr_180px] md:items-center">
                  <div>
                    <p className="font-semibold text-white">{employee.fullName}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-brand-300/30 bg-brand-500/10 px-2.5 py-1 text-brand-100">
                        {employee.displayId || employee.employeeId || employee.id}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-ink-dim">
                        {infoValue(employee.jobTitle)}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-ink-dim">{infoValue(employee.department)}</div>
                  <div className="text-sm text-ink-dim">{infoValue(employee.employeeType)}</div>
                  <div className="space-y-1 text-sm text-ink-dim">
                    <p>{infoValue(employee.email)}</p>
                    <p>{infoValue(employee.phone)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <button
                      onClick={() => setSelectedEmployee(employee)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                    >
                      <EyeIcon />
                      Voir
                    </button>
                    {canManageEmployees ? (
                      <>
                        <button
                          onClick={() => openEditModal(employee)}
                          className="inline-flex items-center gap-2 rounded-xl border border-brand-300/25 bg-brand-500/12 px-3 py-2 text-sm font-medium text-brand-100 transition hover:border-brand-300/40 hover:bg-brand-500/18"
                        >
                          <EditIcon />
                          Modifier
                        </button>
                        <button
                          onClick={() => setDeleteTarget(employee)}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/18"
                        >
                          <TrashIcon />
                          Supprimer
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

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