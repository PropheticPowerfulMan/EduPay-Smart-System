import { useI18n } from "../i18n";

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="inline-flex rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 backdrop-blur">
      <button
        type="button"
        onClick={() => setLang("fr")}
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-300 ${
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
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-300 ${
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
