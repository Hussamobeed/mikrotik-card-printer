import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type Lang = "ar" | "en";

interface AppState {
  theme: Theme;
  lang: Lang;
  selectedRouterId: string | null;
  lastCustomer: string;
  lastProfile: string;
  setTheme: (theme: Theme) => void;
  setLang: (lang: Lang) => void;
  setSelectedRouterId: (id: string | null) => void;
  setLastCustomer: (customer: string) => void;
  setLastProfile: (profile: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "light",
      lang: "ar",
      selectedRouterId: null,
      lastCustomer: "",
      lastProfile: "",
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setSelectedRouterId: (id) => set({ selectedRouterId: id }),
      setLastCustomer: (customer) => set({ lastCustomer: customer }),
      setLastProfile: (profile) => set({ lastProfile: profile }),
    }),
    { name: "obaid-manager-app-settings" }
  )
);
