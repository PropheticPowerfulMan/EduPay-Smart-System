import { create } from "zustand";

export type Role = "ADMIN" | "ACCOUNTANT" | "PARENT";

const TOKEN_STORAGE_KEY = "edupay_token";
const ROLE_STORAGE_KEY = "edupay_role";
const NAME_STORAGE_KEY = "edupay_name";
const PARENT_ID_STORAGE_KEY = "edupay_parent_id";
const SESSION_ACTIVE_KEY = "edupay_session_active";

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(NAME_STORAGE_KEY);
  localStorage.removeItem(PARENT_ID_STORAGE_KEY);
  localStorage.removeItem("edupay_fullName");
}

if (sessionStorage.getItem(SESSION_ACTIVE_KEY) !== "true") {
  clearStoredAuth();
}

type AuthState = {
  token: string | null;
  role: Role | null;
  fullName: string | null;
  parentId: string | null;
  setAuth: (token: string, role: Role, fullName: string, parentId?: string | null) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  role: (localStorage.getItem(ROLE_STORAGE_KEY) as Role | null) || null,
  fullName: localStorage.getItem(NAME_STORAGE_KEY),
  parentId: localStorage.getItem(PARENT_ID_STORAGE_KEY),
  setAuth: (token, role, fullName, parentId = null) => {
    sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(ROLE_STORAGE_KEY, role);
    localStorage.setItem(NAME_STORAGE_KEY, fullName);
    if (parentId) {
      localStorage.setItem(PARENT_ID_STORAGE_KEY, parentId);
    } else {
      localStorage.removeItem(PARENT_ID_STORAGE_KEY);
    }
    set({ token, role, fullName, parentId });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    clearStoredAuth();
    set({ token: null, role: null, fullName: null, parentId: null });
  }
}));
