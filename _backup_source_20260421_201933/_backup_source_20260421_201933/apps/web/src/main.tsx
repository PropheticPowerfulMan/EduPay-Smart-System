import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./styles.css";

const applyStoredFont = () => {
  const saved = localStorage.getItem("edupay_font");
  const allowed = ["poppins", "space-grotesk", "fira-sans", "merriweather"];
  const font = saved && allowed.includes(saved) ? saved : "poppins";
  document.documentElement.setAttribute("data-font", font);
};

const forceFavicon = () => {
  const href = "/logo-school.png?v=4";
  const existing = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (existing) {
    existing.href = href;
    existing.type = "image/png";
    return;
  }

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = href;
  document.head.appendChild(link);
};

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
}

forceFavicon();
applyStoredFont();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);
