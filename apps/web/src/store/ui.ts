import { create } from "zustand";

const DESKTOP_SIDEBAR_KEY = "edupay_desktop_sidebar_open";
const MOBILE_NAV_KEY = "edupay_mobile_nav_open";

function readStoredFlag(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

function persistFlag(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "true" : "false");
}

type UiState = {
  isDesktopSidebarOpen: boolean;
  isMobileNavOpen: boolean;
  setDesktopSidebarOpen: (value: boolean) => void;
  toggleDesktopSidebar: () => void;
  setMobileNavOpen: (value: boolean) => void;
  toggleMobileNav: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  isDesktopSidebarOpen: readStoredFlag(DESKTOP_SIDEBAR_KEY, true),
  isMobileNavOpen: readStoredFlag(MOBILE_NAV_KEY, true),
  setDesktopSidebarOpen: (value) => {
    persistFlag(DESKTOP_SIDEBAR_KEY, value);
    set({ isDesktopSidebarOpen: value });
  },
  toggleDesktopSidebar: () => set((state) => {
    const next = !state.isDesktopSidebarOpen;
    persistFlag(DESKTOP_SIDEBAR_KEY, next);
    return { isDesktopSidebarOpen: next };
  }),
  setMobileNavOpen: (value) => {
    persistFlag(MOBILE_NAV_KEY, value);
    set({ isMobileNavOpen: value });
  },
  toggleMobileNav: () => set((state) => {
    const next = !state.isMobileNavOpen;
    persistFlag(MOBILE_NAV_KEY, next);
    return { isMobileNavOpen: next };
  })
}));