const frUnits = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const enUnits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];

function twoDigits(n: number, lang: "fr" | "en") {
  const units = lang === "fr" ? frUnits : enUnits;
  if (n <= 16) return units[n];
  const tensMapFr: Record<number, string> = { 20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante", 70: "soixante-dix", 80: "quatre-vingt", 90: "quatre-vingt-dix" };
  const tensMapEn: Record<number, string> = { 20: "twenty", 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety" };
  const map = lang === "fr" ? tensMapFr : tensMapEn;
  const tens = Math.floor(n / 10) * 10;
  const rest = n % 10;
  if (n < 20) return lang === "fr" ? `dix-${units[rest]}` : `ten-${units[rest]}`;
  return rest === 0 ? map[tens] : `${map[tens]}-${units[rest]}`;
}

export function amountToWords(value: number, lang: "fr" | "en" = "fr") {
  if (value < 100) return twoDigits(value, lang);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const hundredWord = lang === "fr" ? "cent" : "hundred";
  const prefix = hundreds === 1 ? hundredWord : `${twoDigits(hundreds, lang)} ${hundredWord}`;
  return rest ? `${prefix} ${twoDigits(rest, lang)}` : prefix;
}
