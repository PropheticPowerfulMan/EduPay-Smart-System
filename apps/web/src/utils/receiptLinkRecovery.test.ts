import { describe, expect, it } from "vitest";
import { resolveLegacyReceiptVerificationUrl } from "./receiptLinkRecovery";

describe("resolveLegacyReceiptVerificationUrl", () => {
  it("redirige un ancien lien path-based vers la route hash du reçu", () => {
    const redirect = resolveLegacyReceiptVerificationUrl({
      origin: "https://edupay.example.com",
      pathname: "/EduPay-Smart-System/receipt/verify",
      search: "?tx=TX-1001&c=EDP-22FB-4D92",
      hash: ""
    }, "/EduPay-Smart-System/");

    expect(redirect).toBe("https://edupay.example.com/EduPay-Smart-System/#/receipt/verify?tx=TX-1001&c=EDP-22FB-4D92");
  });

  it("répare un hash reçu sans slash initial", () => {
    const redirect = resolveLegacyReceiptVerificationUrl({
      origin: "https://edupay.example.com",
      pathname: "/EduPay-Smart-System/",
      search: "",
      hash: "#receipt/verify?tx=TX-1001&c=EDP-22FB-4D92"
    }, "/EduPay-Smart-System/");

    expect(redirect).toBe("https://edupay.example.com/EduPay-Smart-System/#/receipt/verify?tx=TX-1001&c=EDP-22FB-4D92");
  });

  it("convertit une ouverture à la racine avec paramètres en route hash reçue", () => {
    const redirect = resolveLegacyReceiptVerificationUrl({
      origin: "https://edupay.example.com",
      pathname: "/EduPay-Smart-System/",
      search: "?tx=TX-1001&c=EDP-22FB-4D92",
      hash: ""
    }, "/EduPay-Smart-System/");

    expect(redirect).toBe("https://edupay.example.com/EduPay-Smart-System/#/receipt/verify?tx=TX-1001&c=EDP-22FB-4D92");
  });

  it("ne redirige pas une URL déjà canonique", () => {
    const redirect = resolveLegacyReceiptVerificationUrl({
      origin: "https://edupay.example.com",
      pathname: "/EduPay-Smart-System/",
      search: "",
      hash: "#/receipt/verify?tx=TX-1001&c=EDP-22FB-4D92"
    }, "/EduPay-Smart-System/");

    expect(redirect).toBeNull();
  });
});