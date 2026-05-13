import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { schoolBranding } from "../config/branding";
import { resolveApiUrl } from "../services/api";
import {
  parseReceiptVerificationToken,
  type ReceiptVerificationRecord,
  validateReceiptVerificationRecord
} from "../utils/receiptVerification";

type VerificationApiResponse = {
  source: "database";
  payment: {
    id: string;
    transactionNumber: string;
    parentFullName: string;
    paymentSubjectName: string;
    studentNames: string[];
    reason: string;
    amount: number;
    amountInWords: string;
    method: string;
    status: string;
    date: string;
    createdAt: string;
    schoolName: string;
    receiptNumber: string | null;
    downloads: {
      pdfPath: string;
      pngPath: string;
      pdfUrl: string;
      pngUrl: string;
    } | null;
  };
};

function compareReceiptWithApi(receipt: ReceiptVerificationRecord, apiPayment: VerificationApiResponse["payment"]) {
  const mismatches: string[] = [];
  if (receipt.transaction.transactionNumber !== apiPayment.transactionNumber) mismatches.push("Numéro de transaction");
  if (receipt.transaction.amount !== apiPayment.amount.toFixed(5)) mismatches.push("Montant");
  if (receipt.transaction.reason.trim() !== apiPayment.reason.trim()) mismatches.push("Motif");
  if (receipt.transaction.methodCode !== apiPayment.method) mismatches.push("Méthode");
  if (receipt.transaction.statusCode !== apiPayment.status) mismatches.push("Statut");
  if (receipt.parties.parentFullName.trim() !== apiPayment.parentFullName.trim()) mismatches.push("Parent");
  if (receipt.parties.paymentSubjectName.trim() !== apiPayment.paymentSubjectName.trim()) mismatches.push("Paiement pour");

  const scannedStudents = receipt.parties.studentNames.join(" | ").trim();
  const apiStudents = apiPayment.studentNames.join(" | ").trim();
  if (scannedStudents !== apiStudents) mismatches.push("Liste des élèves");

  return {
    matched: mismatches.length === 0,
    mismatches
  };
}

export function ReceiptVerificationPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("d");
  const [apiResult, setApiResult] = useState<VerificationApiResponse | null>(null);
  const [apiState, setApiState] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");

  const receipt = useMemo(() => parseReceiptVerificationToken(token), [token]);
  const validation = useMemo(() => (receipt ? validateReceiptVerificationRecord(receipt) : null), [receipt]);
  const apiComparison = useMemo(
    () => (receipt && apiResult ? compareReceiptWithApi(receipt, apiResult.payment) : null),
    [receipt, apiResult]
  );

  useEffect(() => {
    if (!receipt) {
      setApiResult(null);
      setApiState("idle");
      return;
    }

    let active = true;
    setApiState("loading");

    fetch(resolveApiUrl(`/api/payments/verify/${encodeURIComponent(receipt.transaction.transactionNumber)}`))
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) {
          setApiResult(null);
          setApiState("missing");
          return;
        }
        if (!response.ok) {
          setApiResult(null);
          setApiState("error");
          return;
        }
        const data = await response.json() as VerificationApiResponse;
        if (!active) return;
        setApiResult(data);
        setApiState("ready");
      })
      .catch(() => {
        if (!active) return;
        setApiResult(null);
        setApiState("error");
      });

    return () => {
      active = false;
    };
  }, [receipt]);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="glass overflow-hidden rounded-[28px] border border-brand-400/20 shadow-2xl">
          <div className="border-b border-white/10 bg-white/5 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <img src={schoolBranding.logoSrc} alt={schoolBranding.schoolName} className="h-16 w-16 rounded-2xl border border-brand-200/20 bg-white object-contain p-2" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-300">Vérification EduPay</p>
                  <h1 className="mt-2 font-display text-3xl font-bold text-white">Reçu de transaction</h1>
                  <p className="mt-2 max-w-2xl text-sm text-ink-dim">
                    Cette page confirme les données encodées dans le QR du reçu et vérifie la cohérence interne des codes de sécurité.
                  </p>
                </div>
              </div>
              <a href="#/login" className="btn-primary inline-flex items-center justify-center px-5 py-3 text-sm font-semibold">
                Ouvrir EduPay
              </a>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            {!receipt || !validation ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-red-100">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-red-200">QR invalide</p>
                <h2 className="mt-3 font-display text-2xl font-bold text-white">Aucune donnée de reçu exploitable</h2>
                <p className="mt-3 text-sm leading-6 text-red-100/90">
                  Le lien scanné ne contient pas un jeton de vérification EduPay valide ou les données ont été altérées.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className={`rounded-3xl border p-5 ${validation.valid ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-amber-400/30 bg-amber-500/10 text-amber-100"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.22em]">
                    {validation.valid ? "Reçu cohérent" : "Vérification partielle"}
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-bold text-white">
                    {validation.valid ? "Les codes du reçu correspondent aux données scannées" : "Les données du reçu ne correspondent pas entièrement aux codes de sécurité"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-current/90">
                    {validation.valid
                      ? "La transaction, le montant, le statut et les identifiants de sécurité du reçu sont cohérents dans ce lien de vérification interne."
                      : "Les informations visibles ont été lues, mais au moins un code de sécurité ne correspond plus. Vérifiez le document source avant validation manuelle."}
                  </p>
                </div>

                <div className={`rounded-3xl border p-5 ${apiState === "ready" && apiComparison?.matched ? "border-sky-400/30 bg-sky-500/10 text-sky-100" : "border-white/10 bg-white/5 text-ink"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Recoupement base de données</p>
                  {apiState === "loading" && <p className="mt-3 text-sm text-ink-dim">Vérification de la transaction dans l'API EduPay en cours...</p>}
                  {apiState === "missing" && <p className="mt-3 text-sm text-amber-100">Aucune transaction correspondante n'a été trouvée en base pour ce numéro.</p>}
                  {apiState === "error" && <p className="mt-3 text-sm text-red-200">La vérification en base est indisponible pour le moment.</p>}
                  {apiState === "ready" && apiResult && apiComparison && (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm leading-6 text-current/90">
                        {apiComparison.matched
                          ? "Les données scannées correspondent aux données récupérées en base pour cette transaction."
                          : `Des écarts ont été détectés entre le QR et la base: ${apiComparison.mismatches.join(", ")}.`}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Transaction API</p>
                          <p className="mt-1 font-mono text-sm font-bold text-white">{apiResult.payment.transactionNumber}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Montant API</p>
                          <p className="mt-1 text-sm font-bold text-white">$ {apiResult.payment.amount.toFixed(5)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Statut API</p>
                          <p className="mt-1 text-sm font-bold text-white">{apiResult.payment.status}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Reçu stocké</p>
                          <p className="mt-1 text-sm font-bold text-white">{apiResult.payment.receiptNumber ?? "Aucun"}</p>
                        </div>
                      </div>
                      {apiResult.payment.downloads ? (
                        <div className="flex flex-wrap gap-3 pt-2">
                          <a
                            href={resolveApiUrl(apiResult.payment.downloads.pdfPath)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-primary inline-flex items-center justify-center px-5 py-3 text-sm font-semibold"
                          >
                            Télécharger PDF
                          </a>
                          <a
                            href={resolveApiUrl(apiResult.payment.downloads.pngPath)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-full border border-brand-300/40 bg-brand-500/10 px-5 py-3 text-sm font-semibold text-brand-100 transition hover:border-brand-200 hover:bg-brand-500/20"
                          >
                            Télécharger PNG
                          </a>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                  <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Détails transaction</p>
                    <div className="mt-5 grid gap-3">
                      {[
                        ["Transaction", receipt.transaction.transactionNumber],
                        ["Date", receipt.transaction.date],
                        ["Parent", receipt.parties.parentFullName],
                        ["Paiement pour", receipt.parties.paymentSubjectName],
                        ["Élèves", receipt.parties.studentNames.join(" / ") || "N/A"],
                        ["Motif", receipt.transaction.reason],
                        ["Montant", `$ ${receipt.transaction.amount}`],
                        ["Montant en lettres", receipt.transaction.amountWords],
                        ["Méthode", receipt.transaction.methodLabel],
                        ["Statut", receipt.transaction.statusLabel]
                      ].map(([label, value]) => (
                        <div key={label} className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:grid-cols-[170px_1fr] sm:items-start">
                          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
                          <span className="text-sm font-semibold text-white">{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <aside className="space-y-6">
                    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Émetteur</p>
                      <div className="mt-4 space-y-2 text-sm text-ink-dim">
                        <p className="font-semibold text-white">{receipt.issuer.schoolName}</p>
                        <p>{receipt.issuer.appName}</p>
                        <p>{receipt.issuer.tagline}</p>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Codes sécurité</p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Code de vérification</p>
                          <p className="mt-1 font-mono text-base font-bold text-white">{receipt.security.verificationCode}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Sceau</p>
                          <p className="mt-1 font-mono text-base font-bold text-white">{receipt.security.sealCode}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Hash</p>
                          <p className="mt-1 break-all font-mono text-sm font-bold text-white">{receipt.security.hash}</p>
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}