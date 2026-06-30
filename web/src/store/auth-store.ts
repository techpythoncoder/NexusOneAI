"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Organization } from "@/types";

interface AuthState {
  token: string | null;
  user: User | null;
  org: Organization | null;
  setAuth: (token: string, user: User) => void;
  setToken: (token: string) => void;
  setOrg: (org: Organization) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      org: null,
      setAuth: (token, user) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("nexus_token", token);
        }
        set({ token, user, org: null });
      },
      setToken: (token: string) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("nexus_token", token);
        }
        set((s) => ({ ...s, token }));
      },
      setOrg: (org) => set({ org }),
      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("nexus_token");
          localStorage.removeItem("nexus_refresh_token");
        }
        set({ token: null, user: null, org: null });
      },
    }),
    { name: "nexus_auth", partialize: (s) => ({ token: s.token, user: s.user, org: s.org }) }
  )
);
