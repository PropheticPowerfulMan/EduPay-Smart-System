"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const amount_words_1 = require("../src/utils/amount-words");
(0, vitest_1.describe)("amountToWords", () => {
    (0, vitest_1.it)("should convert number to french words", () => {
        (0, vitest_1.expect)((0, amount_words_1.amountToWords)(25, "fr")).toContain("vingt");
    });
    (0, vitest_1.it)("should convert number to english words", () => {
        (0, vitest_1.expect)((0, amount_words_1.amountToWords)(42, "en")).toContain("forty");
    });
});
//# sourceMappingURL=amount-words.test.js.map