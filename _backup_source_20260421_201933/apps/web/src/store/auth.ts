import { create } from "zustand";

export type Role = "ADMIN" | "ACCOUNTANT" | "PARENT";

type AuthState = {
  token: string | null;
  role: Role | null;
  fullName: string | null;
  setAuth: (token: string, role: Role, fullName: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("edupay_token"),
  role: (localStorage.getItem("edupay_role") as Role | null) || null,
  fullName: localStorage.getItem("edupay_name"),
  setAuth: (token, role, fullName) => {
    localStorage.setItem("edupay_token", token);
    localStorage.setItem("edupay_role", role);
    localStorage.setItem("edupay_name", fullName);
    set({ token, role, fullName });
  },
  logout: () => {
    localStorage.removeItem("edupay_token");
    localStorage.removeItem("edupay_role");
    localStorage.removeItem("edupay_name");
    set({ token: null, role: null, fullName: null });
  }
}));
