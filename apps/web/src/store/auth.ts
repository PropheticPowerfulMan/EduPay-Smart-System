import { create } from "zustand";

export type Role =
  | "SUPER_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "FINANCIAL_MANAGER"
  | "ACCOUNTANT"
  | "CASHIER"
  | "HR_MANAGER"
  | "AUDITOR"
  | "PARENT";

export const STAFF_ROLES: Role[] = [
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "FINANCIAL_MANAGER",
  "ACCOUNTANT",
  "CASHIER",
  "HR_MANAGER",
  "AUDITOR"
];

const TOKEN_STORAGE_KEY = "edupay_token";
const ROLE_STORAGE_KEY = "edupay_role";
const NAME_STORAGE_KEY = "edupay_name";
const PARENT_ID_STORAGE_KEY = "edupay_parent_id";
const PHOTO_STORAGE_KEY = "edupay_photo_url";
const SESSION_ACTIVE_KEY = "edupay_session_active";

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(NAME_STORAGE_KEY);
  localStorage.removeItem(PARENT_ID_STORAGE_KEY);
  localStorage.removeItem(PHOTO_STORAGE_KEY);
  localStorage.removeItem("edupay_fullName");
}

export function normalizeRole(value: unknown, parentId?: string | null): Role | null {
  const role = String(value ?? "").trim().toUpperCase();
  if (role === "PARENT") return role;
  if (STAFF_ROLES.includes(role as Role)) return role as Role;
  return parentId ? "PARENT" : null;
}

if (sessionStorage.getItem(SESSION_ACTIVE_KEY) !== "true") {
  clearStoredAuth();
}

type AuthState = {
  token: string | null;
  role: Role | null;
  fullName: string | null;
  parentId: string | null;
  photoUrl: string | null;
  setAuth: (token: string, role: Role | string | null | undefined, fullName: string, parentId?: string | null, photoUrl?: string | null) => void;
  setPhotoUrl: (photoUrl: string | null) => void;
  logout: () => void;
};

const storedParentId = localStorage.getItem(PARENT_ID_STORAGE_KEY);

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  role: normalizeRole(localStorage.getItem(ROLE_STORAGE_KEY), storedParentId),
  fullName: localStorage.getItem(NAME_STORAGE_KEY),
  parentId: storedParentId,
  photoUrl: localStorage.getItem(PHOTO_STORAGE_KEY),
  setAuth: (token, role, fullName, parentId = null, photoUrl = null) => {
    const normalizedRole = normalizeRole(role, parentId);
    if (!normalizedRole) {
      clearStoredAuth();
      set({ token: null, role: null, fullName: null, parentId: null, photoUrl: null });
      throw new Error("Role utilisateur invalide.");
    }

    sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(ROLE_STORAGE_KEY, normalizedRole);
    localStorage.setItem(NAME_STORAGE_KEY, fullName);
    if (parentId) {
      localStorage.setItem(PARENT_ID_STORAGE_KEY, parentId);
    } else {
      localStorage.removeItem(PARENT_ID_STORAGE_KEY);
    }
    if (photoUrl) {
      localStorage.setItem(PHOTO_STORAGE_KEY, photoUrl);
    } else if (normalizedRole === "PARENT") {
      localStorage.removeItem(PHOTO_STORAGE_KEY);
    }
    set({ token, role: normalizedRole, fullName, parentId, photoUrl: photoUrl || localStorage.getItem(PHOTO_STORAGE_KEY) });
  },
  setPhotoUrl: (photoUrl) => {
    if (photoUrl) {
      localStorage.setItem(PHOTO_STORAGE_KEY, photoUrl);
    } else {
      localStorage.removeItem(PHOTO_STORAGE_KEY);
    }
    set({ photoUrl });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    clearStoredAuth();
    set({ token: null, role: null, fullName: null, parentId: null, photoUrl: null });
  }
}));
