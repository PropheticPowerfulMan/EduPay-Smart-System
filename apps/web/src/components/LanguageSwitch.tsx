import { useI18n } from "../i18n";

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="inline-grid grid-cols-2 rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 backdrop-blur">
      <button
        type="button"
        onClick={() => setLang("fr")}
        className={`min-w-0 rounded-md px-2.5 py-1.5 text-[11px] font-bold leading-none transition-all duration-300 sm:px-3 sm:text-xs ${
          lang === "fr" 
            ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30" 
            : "text-ink-dim hover:text-white"
        }`}
      >
        {t("langFr")}
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`min-w-0 rounded-md px-2.5 py-1.5 text-[11px] font-bold leading-none transition-all duration-300 sm:px-3 sm:text-xs ${
          lang === "en" 
            ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30" 
            : "text-ink-dim hover:text-white"
        }`}
      >
        {t("langEn")}
      </button>
    </div>
  );
}
