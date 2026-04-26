import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

const STORAGE_KEY = "edupay_font";

type FontValue = "executif" | "scientifique" | "tech";

type FontOption = {
  value: FontValue;
  labelKey: "fontExecutif" | "fontScientifique" | "fontTech";
  icon: string;
  preview: string;
};

const options: FontOption[] = [
  { value: "executif",    labelKey: "fontExecutif",    icon: "✦", preview: "Manrope + Cormorant" },
  { value: "scientifique", labelKey: "fontScientifique", icon: "∑", preview: "EB Garamond" },
  { value: "tech",        labelKey: "fontTech",        icon: "⌥", preview: "Space Grotesk + Sora" }
];

function applyFont(font: FontValue) {
  document.documentElement.setAttribute("data-font", font);
}

export function FontSwitch() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [font, setFont] = useState<FontValue>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontValue;
    return options.some((o) => o.value === saved) ? saved : "executif";
  });

  useEffect(() => {
    applyFont(font);
    localStorage.setItem(STORAGE_KEY, font);
  }, [font]);

  const current = options.find((o) => o.value === font)!;

  const pick = (v: FontValue) => { setFont(v); setOpen(false); };

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-900/50 px-2.5 py-1.5 backdrop-blur transition-all hover:border-brand-500/50 sm:gap-2 sm:px-3"
        aria-label={t("fontLabel")}
      >
        <span className="text-sm font-bold text-brand-300">{current.icon}</span>
        <span className="text-xs font-semibold text-ink-dim hidden sm:inline">{t("fontLabel")}</span>
        <span className="max-w-[5.8rem] truncate text-[11px] font-bold leading-none text-white sm:max-w-none sm:text-xs">{t(current.labelKey)}</span>
        <svg className={`h-3 w-3 shrink-0 text-ink-dim transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-[min(13rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/95 shadow-2xl backdrop-blur animate-fadeInUp sm:left-auto sm:right-0 sm:w-52 sm:translate-x-0">
          <div className="px-3 py-2 border-b border-slate-700/50">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-dim">{t("fontLabel")}</p>
          </div>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => pick(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-slate-800/60 ${
                font === opt.value ? "bg-brand-500/15 border-l-2 border-brand-400" : "border-l-2 border-transparent"
              }`}
            >
              <span className={`text-lg font-bold w-6 text-center ${font === opt.value ? "text-brand-300" : "text-ink-dim"}`}>
                {opt.icon}
              </span>
              <div>
                <p className={`text-xs font-bold ${font === opt.value ? "text-white" : "text-ink-dim"}`}>
                  {t(opt.labelKey)}
                </p>
                <p className="text-[10px] text-ink-dim/70 mt-0.5">{opt.preview}</p>
              </div>
              {font === opt.value && (
                <svg className="w-3.5 h-3.5 text-brand-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
