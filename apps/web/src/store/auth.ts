import { create } from "zustand";

export type Role = "ADMIN" | "ACCOUNTANT" | "PARENT";

const TOKEN_STORAGE_KEY = "edupay_token";
const ROLE_STORAGE_KEY = "edupay_role";
const NAME_STORAGE_KEY = "edupay_name";
const SESSION_ACTIVE_KEY = "edupay_session_active";

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(NAME_STORAGE_KEY);
  localStorage.removeItem("edupay_fullName");
}

if (sessionStorage.getItem(SESSION_ACTIVE_KEY) !== "true") {
  clearStoredAuth();
}

type AuthState = {
  token: string | null;
  role: Role | null;
  fullName: string | null;
  setAuth: (token: string, role: Role, fullName: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  role: (localStorage.getItem(ROLE_STORAGE_KEY) as Role | null) || null,
  fullName: localStorage.getItem(NAME_STORAGE_KEY),
  setAuth: (token, role, fullName) => {
    sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(ROLE_STORAGE_KEY, role);
    localStorage.setItem(NAME_STORAGE_KEY, fullName);
    set({ token, role, fullName });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    clearStoredAuth();
    set({ token: null, role: null, fullName: null });
  }
}));
