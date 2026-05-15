import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { schoolBranding } from "../config/branding";
import { resolveApiUrl } from "../services/api";
import {
  buildReceiptSecurity,
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
  if (receipt.transaction.transactionNumber !== apiPayment.transactionNumber) mismatches.push("Transaction");
  if (receipt.transaction.amount !== apiPayment.amount.toFixed(5)) mismatches.push("Montant");
  if (receipt.transaction.reason.trim() !== apiPayment.reason.trim()) mismatches.push("Motif");
  if (receipt.transaction.methodCode !== apiPayment.method) mismatches.push("Methode");
  if (receipt.transaction.statusCode !== apiPayment.status) mismatches.push("Statut");
  if (receipt.parties.parentFullName.trim() !== apiPayment.parentFullName.trim()) mismatches.push("Parent");
  if (receipt.parties.paymentSubjectName.trim() !== apiPayment.paymentSubjectName.trim()) mismatches.push("Paiement pour");

  const scannedStudents = receipt.parties.studentNames.join(" | ").trim();
  const apiStudents = apiPayment.studentNames.join(" | ").trim();
  if (scannedStudents !== apiStudents) mismatches.push("Eleves");

  return { matched: mismatches.length === 0, mismatches };
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="mt-5 grid gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:grid-cols-[170px_1fr] sm:items-start">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
          <span className="text-sm font-semibold text-white">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function ReceiptVerificationPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const token = params.get("d");
  const txParam = params.get("tx");
  const codeParam = params.get("c");
  const [apiResult, setApiResult] = useState<VerificationApiResponse | null>(null);
  const [apiState, setApiState] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");

  const receipt = useMemo(() => parseReceiptVerificationToken(token), [token]);
  const validation = useMemo(() => (receipt ? validateReceiptVerificationRecord(receipt) : null), [receipt]);
  const transactionNumber = receipt?.transaction.transactionNumber || txParam || "";
  const apiComparison = useMemo(
    () => (receipt && apiResult ? compareReceiptWithApi(receipt, apiResult.payment) : null),
    [receipt, apiResult]
  );

  useEffect(() => {
    if (!transactionNumber) {
      setApiResult(null);
      setApiState("idle");
      return;
    }

    let active = true;
    setApiState("loading");

    fetch(resolveApiUrl(`/api/payments/verify/${encodeURIComponent(transactionNumber)}`))
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
  }, [transactionNumber]);

  const apiSecurity = useMemo(() => {
    if (!apiResult) return null;
    return buildReceiptSecurity({
      transactionNumber: apiResult.payment.transactionNumber,
      date: apiResult.payment.date,
      parentFullName: apiResult.payment.parentFullName,
      paymentSubjectName: apiResult.payment.paymentSubjectName,
      studentNames: apiResult.payment.studentNames,
      reason: apiResult.payment.reason,
      amount: apiResult.payment.amount,
      amountWords: apiResult.payment.amountInWords,
      method: apiResult.payment.method as "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY",
      status: apiResult.payment.status as "COMPLETED" | "PENDING" | "FAILED"
    });
  }, [apiResult]);

  const shortQrCodeMatches = Boolean(codeParam && apiSecurity && codeParam === apiSecurity.verificationCode);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="glass overflow-hidden rounded-[28px] border border-brand-400/20 shadow-2xl">
          <div className="border-b border-white/10 bg-white/5 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <img src={schoolBranding.logoSrc} alt={schoolBranding.schoolName} className="h-16 w-16 rounded-2xl border border-brand-200/20 bg-white object-contain p-2" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-300">Verification EduPay</p>
                  <h1 className="mt-2 font-display text-3xl font-bold text-white">Recu de transaction</h1>
                  <p className="mt-2 max-w-2xl text-sm text-ink-dim">
                    Cette page confirme le QR, verifie la transaction dans EduPay et signale toute difference avec la base.
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
              <div className="space-y-6">
                <div className={`rounded-3xl border p-6 ${txParam ? "border-sky-400/20 bg-sky-500/10 text-sky-100" : "border-red-400/20 bg-red-500/10 text-red-100"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.22em]">{txParam ? "QR transaction" : "QR invalide"}</p>
                  <h2 className="mt-3 font-display text-2xl font-bold text-white">
                    {txParam ? "Verification directe dans EduPay" : "Aucune donnee de recu exploitable"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-current/90">
                    {txParam
                      ? `Le QR a ouvert la verification de la transaction ${txParam}. EduPay recherche maintenant ce paiement dans la base.`
                      : "Le lien scanne ne contient pas de reference EduPay valide."}
                  </p>
                </div>

                {apiState === "loading" && <p className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-ink-dim">Verification de la transaction dans l'API EduPay en cours...</p>}
                {apiState === "missing" && <p className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">Aucune transaction correspondante n'a ete trouvee en base pour ce numero.</p>}
                {apiState === "error" && <p className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">La verification en base est indisponible pour le moment.</p>}
                {apiState === "ready" && apiResult && (
                  <div className="space-y-6">
                    <div className={`rounded-3xl border p-5 ${shortQrCodeMatches ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}>
                      <p className="text-xs font-black uppercase tracking-[0.22em]">Transaction retrouvee</p>
                      <h2 className="mt-3 font-display text-2xl font-bold text-white">
                        {shortQrCodeMatches ? "Le code QR correspond a la transaction EduPay" : "La transaction existe dans EduPay"}
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-current/90">
                        Le scan renvoie vers la fiche publique et confirme la transaction {apiResult.payment.transactionNumber}.
                      </p>
                    </div>
                    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Details transaction</p>
                      <DetailGrid rows={[
                        ["Transaction", apiResult.payment.transactionNumber],
                        ["Date", apiResult.payment.date],
                        ["Parent", apiResult.payment.parentFullName],
                        ["Paiement pour", apiResult.payment.paymentSubjectName],
                        ["Eleves", apiResult.payment.studentNames.join(" / ") || "N/A"],
                        ["Motif", apiResult.payment.reason],
                        ["Montant", `$ ${apiResult.payment.amount.toFixed(5)}`],
                        ["Methode", apiResult.payment.method],
                        ["Statut", apiResult.payment.status],
                        ["Code QR", codeParam || "N/A"]
                      ]} />
                    </section>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className={`rounded-3xl border p-5 ${validation.valid ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-amber-400/30 bg-amber-500/10 text-amber-100"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.22em]">
                    {validation.valid ? "Recu coherent" : "Verification partielle"}
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-bold text-white">
                    {validation.valid ? "Les codes du recu correspondent aux donnees scannees" : "Les donnees du recu ne correspondent pas entierement aux codes"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-current/90">
                    {validation.valid
                      ? "La transaction, le montant, le statut et les identifiants de securite du recu sont coherents."
                      : "Les informations visibles ont ete lues, mais au moins un code de securite ne correspond plus."}
                  </p>
                </div>

                <div className={`rounded-3xl border p-5 ${apiState === "ready" && apiComparison?.matched ? "border-sky-400/30 bg-sky-500/10 text-sky-100" : "border-white/10 bg-white/5 text-ink"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Recoupement base de donnees</p>
                  {apiState === "loading" && <p className="mt-3 text-sm text-ink-dim">Verification de la transaction dans l'API EduPay en cours...</p>}
                  {apiState === "missing" && <p className="mt-3 text-sm text-amber-100">Aucune transaction correspondante n'a ete trouvee en base pour ce numero.</p>}
                  {apiState === "error" && <p className="mt-3 text-sm text-red-200">La verification en base est indisponible pour le moment.</p>}
                  {apiState === "ready" && apiResult && apiComparison && (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm leading-6 text-current/90">
                        {apiComparison.matched
                          ? "Les donnees scannees correspondent aux donnees recuperees en base pour cette transaction."
                          : `Des ecarts ont ete detectes entre le QR et la base: ${apiComparison.mismatches.join(", ")}.`}
                      </p>
                      {apiResult.payment.downloads ? (
                        <div className="flex flex-wrap gap-3 pt-2">
                          <a href={resolveApiUrl(apiResult.payment.downloads.pdfPath)} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center justify-center px-5 py-3 text-sm font-semibold">
                            Telecharger PDF
                          </a>
                          <a href={resolveApiUrl(apiResult.payment.downloads.pngPath)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full border border-brand-300/40 bg-brand-500/10 px-5 py-3 text-sm font-semibold text-brand-100 transition hover:border-brand-200 hover:bg-brand-500/20">
                            Telecharger PNG
                          </a>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                  <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Details transaction</p>
                    <DetailGrid rows={[
                      ["Transaction", receipt.transaction.transactionNumber],
                      ["Date", receipt.transaction.date],
                      ["Parent", receipt.parties.parentFullName],
                      ["Paiement pour", receipt.parties.paymentSubjectName],
                      ["Eleves", receipt.parties.studentNames.join(" / ") || "N/A"],
                      ["Motif", receipt.transaction.reason],
                      ["Montant", `$ ${receipt.transaction.amount}`],
                      ["Montant en lettres", receipt.transaction.amountWords],
                      ["Methode", receipt.transaction.methodLabel],
                      ["Statut", receipt.transaction.statusLabel]
                    ]} />
                  </section>

                  <aside className="space-y-6">
                    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Emetteur</p>
                      <div className="mt-4 space-y-2 text-sm text-ink-dim">
                        <p className="font-semibold text-white">{receipt.issuer.schoolName}</p>
                        <p>{receipt.issuer.appName}</p>
                        <p>{receipt.issuer.tagline}</p>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-300">Codes securite</p>
                      <DetailGrid rows={[
                        ["Verification", receipt.security.verificationCode],
                        ["Sceau", receipt.security.sealCode],
                        ["Hash", receipt.security.hash]
                      ]} />
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
