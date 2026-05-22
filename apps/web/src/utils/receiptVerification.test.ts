import { describe, expect, it } from "vitest";
import { buildReceiptVerificationQrUrl, buildReceiptVerificationUrl, type ReceiptVerificationInput } from "./receiptVerification";

const sampleReceipt: ReceiptVerificationInput = {
  transactionNumber: "TX-1001",
  date: "2026-05-19",
  parentFullName: "Parent Test",
  paymentSubjectName: "Eleve Test",
  studentNames: ["Eleve Test"],
  reason: "Paiement tuition mai",
  amount: 125,
  amountWords: "Cent vingt-cinq dollars",
  method: "CASH",
  status: "COMPLETED"
};

describe("buildReceiptVerificationUrl", () => {
  it("construit un lien stable sur l'origine locale sans réutiliser la route courante", () => {
    const url = buildReceiptVerificationUrl(sampleReceipt, { origin: "http://localhost:5174" });

    expect(url).toMatch(/^http:\/\/localhost:5174\/EduPay-Smart-System\/#\/receipt\/verify\?tx=TX-1001&c=EDP-22FB-4D92&d=/);
  });

  it("conserve une base déployée absolue quand elle est configurée", () => {
    const url = buildReceiptVerificationUrl(
      sampleReceipt,
      { origin: "http://localhost:5174" },
      "https://edupay.example.com/app"
    );

    expect(url).toMatch(/^https:\/\/edupay.example.com\/app\/#\/receipt\/verify\?tx=TX-1001&c=EDP-22FB-4D92&d=/);
  });
  it("corrige une base publique configuree directement sur la page de verification", () => {
    const url = buildReceiptVerificationUrl(
      sampleReceipt,
      { origin: "http://localhost:5174" },
      "https://edupay.example.com/EduPay-Smart-System/receipt/verify"
    );

    expect(url).toMatch(/^https:\/\/edupay.example.com\/EduPay-Smart-System\/#\/receipt\/verify\?tx=TX-1001&c=EDP-22FB-4D92&d=/);
  });
});

describe("buildReceiptVerificationQrUrl", () => {
  it("génère un QR court avec seulement la transaction et le code", () => {
    const url = buildReceiptVerificationQrUrl(sampleReceipt, { origin: "http://localhost:5174" });

    expect(url).toBe("http://localhost:5174/EduPay-Smart-System/#/receipt/verify?tx=TX-1001&c=EDP-22FB-4D92");
  });
});
