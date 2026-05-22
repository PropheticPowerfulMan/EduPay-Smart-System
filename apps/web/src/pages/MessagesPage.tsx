import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquare, Send, Users } from "lucide-react";
import { api } from "../services/api";

type ParentOption = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  students?: Array<{ id: string; fullName: string; className?: string }>;
};

type ManualMessageLog = {
  id: string;
  parentId: string;
  parentName: string;
  parentPhone?: string;
  parentEmail?: string;
  type: string;
  language: string;
  channel: string;
  content: string;
  status: string;
  createdAt: string;
};

export function MessagesPage() {
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [logs, setLogs] = useState<ManualMessageLog[]>([]);
  const [search, setSearch] = useState("");
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [parentsResult, logsResult] = await Promise.all([
      api<ParentOption[]>("/api/parents").catch(() => []),
      api<ManualMessageLog[]>("/api/notifications/messages").catch(() => []),
    ]);
    setParents(Array.isArray(parentsResult) ? parentsResult : []);
    setLogs(Array.isArray(logsResult) ? logsResult : []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredParents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return parents;
    return parents.filter((parent) => [
      parent.fullName,
      parent.phone || "",
      parent.email || "",
      ...(parent.students ?? []).map((student) => `${student.fullName} ${student.className ?? ""}`)
    ].join(" ").toLowerCase().includes(query));
  }, [parents, search]);

  const selectedParents = useMemo(
    () => parents.filter((parent) => selectedParentIds.includes(parent.id)),
    [parents, selectedParentIds]
  );

  const stats = useMemo(() => ({
    total: logs.length,
    parents: new Set(logs.map((log) => log.parentId)).size,
    email: logs.filter((log) => log.status.includes("EMAIL:SENT") || log.status.includes("EMAIL:SIMULATED")).length,
    sms: logs.filter((log) => log.status.includes("SMS:SENT") || log.status.includes("SMS:SIMULATED")).length,
  }), [logs]);

  const toggleParent = (parentId: string) => {
    setSelectedParentIds((current) => current.includes(parentId)
      ? current.filter((id) => id !== parentId)
      : [...current, parentId]);
  };

  const submit = async () => {
    setError(null);
    setStatus(null);

    if (selectedParentIds.length === 0) {
      setError("Sélectionnez au moins un parent.");
      return;
    }
    if (!body.trim()) {
      setError("Le message est obligatoire.");
      return;
    }
    if (!sendEmail && !sendSms) {
      setError("Choisissez au moins un canal direct: e-mail ou SMS.");
      return;
    }

    setSending(true);
    try {
      const response = await api<{ sentCount: number }>("/api/notifications/messages", {
        method: "POST",
        body: JSON.stringify({
          parentIds: selectedParentIds,
          subject: subject.trim(),
          body: body.trim(),
          language: "fr",
          channels: [sendEmail ? "EMAIL" : null, sendSms ? "SMS" : null].filter(Boolean)
        })
      });

      setStatus(`${response.sentCount} message(s) envoyé(s) et déposés dans Messages reçus.`);
      setSubject("");
      setBody("");
      setSelectedParentIds([]);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Impossible d'envoyer le message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="glass rounded-3xl border border-brand-300/20 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">Messagerie financière</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white">Messages entre le financier et les parents</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          Le message saisi ici peut être transmis à un ou plusieurs parents, envoyé par e-mail et/ou SMS, puis conservé dans leur espace EduPay sous Messages reçus.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="glass rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Messages envoyés</p>
          <p className="mt-2 text-3xl font-black text-white">{stats.total}</p>
        </article>
        <article className="glass rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Parents contactés</p>
          <p className="mt-2 text-3xl font-black text-cyan-300">{stats.parents}</p>
        </article>
        <article className="glass rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Envois e-mail</p>
          <p className="mt-2 text-3xl font-black text-brand-100">{stats.email}</p>
        </article>
        <article className="glass rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Envois SMS</p>
          <p className="mt-2 text-3xl font-black text-emerald-300">{stats.sms}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="glass rounded-3xl border border-white/10 p-5">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-brand-200" />
              <div>
                <h2 className="font-display text-xl font-bold text-white">Choisir les parents</h2>
                <p className="text-sm text-ink-dim">Sélection multiple autorisée.</p>
              </div>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un parent, un téléphone ou un élève..."
              className="mt-4 w-full"
            />

            <div className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {filteredParents.map((parent) => {
                const active = selectedParentIds.includes(parent.id);
                return (
                  <button
                    key={parent.id}
                    type="button"
                    onClick={() => toggleParent(parent.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-brand-300/40 bg-brand-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{parent.fullName}</p>
                        <p className="mt-1 text-xs text-ink-dim">{parent.phone || "Téléphone non renseigné"} · {parent.email || "Email non renseigné"}</p>
                        {(parent.students?.length ?? 0) > 0 ? (
                          <p className="mt-2 text-xs text-ink-dim">
                            {(parent.students ?? []).map((student) => `${student.fullName}${student.className ? ` (${student.className})` : ""}`).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-brand-300 text-slate-950" : "bg-white/[0.08] text-ink-dim"}`}>
                        {active ? "Sélectionné" : "Choisir"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-3xl border border-white/10 p-5">
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-emerald-300" />
              <div>
                <h2 className="font-display text-xl font-bold text-white">Rédiger et transmettre</h2>
                <p className="text-sm text-ink-dim">Le tableau de bord parent est toujours alimenté en même temps.</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedParents.length > 0 ? selectedParents.map((parent) => (
                <span key={parent.id} className="rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-100">
                  {parent.fullName}
                </span>
              )) : <span className="text-sm text-ink-dim">Aucun parent sélectionné.</span>}
            </div>

            <div className="mt-4 grid gap-4">
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full"
                placeholder="Objet du message (facultatif)"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-[12rem] w-full"
                placeholder="Écrivez ici le message à transmettre aux parents sélectionnés..."
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white">
                <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
                <Mail className="h-4 w-4 text-brand-200" /> E-mail
              </label>
              <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white">
                <input type="checkbox" checked={sendSms} onChange={(event) => setSendSms(event.target.checked)} />
                <MessageSquare className="h-4 w-4 text-emerald-300" /> SMS
              </label>
              <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200">
                Dashboard parent: actif automatiquement
              </span>
            </div>

            {error ? <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
            {status ? <p className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{status}</p> : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="btn-primary mt-5 inline-flex items-center gap-2 px-5 py-3 text-sm font-bold disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {sending ? "Envoi en cours..." : "Envoyer le message"}
            </button>
          </div>
        </div>

        <div className="glass rounded-3xl border border-white/10 p-5">
          <h2 className="font-display text-xl font-bold text-white">Historique des messages transmis</h2>
          <p className="mt-1 text-sm text-ink-dim">Tous les envois manuels du financier vers les parents sont conservés ici.</p>

          <div className="mt-5 space-y-3">
            {logs.length === 0 ? <p className="text-sm text-ink-dim">Aucun message manuel n’a encore été enregistré.</p> : logs.map((log) => (
              <article key={log.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{log.parentName}</p>
                    <p className="mt-1 text-xs text-ink-dim">{log.parentPhone || "Téléphone non renseigné"} · {log.parentEmail || "Email non renseigné"}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-100">{log.type}</span>
                    <p className="mt-2 text-xs text-ink-dim">{new Date(log.createdAt).toLocaleString("fr-FR")}</p>
                  </div>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-ink">{log.content}</pre>
                <p className="mt-3 text-xs font-semibold text-cyan-200">{log.status}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}