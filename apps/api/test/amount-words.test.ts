import { describe, expect, it } from "vitest";
import { amountToWords } from "../src/utils/amount-words";

describe("amountToWords", () => {
  it("should convert number to french words", () => {
    expect(amountToWords(25, "fr")).toContain("vingt");
  });

  it("should convert number to english words", () => {
    expect(amountToWords(42, "en")).toContain("forty");
  });
});
