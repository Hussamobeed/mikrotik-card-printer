import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabaseAuth } from "@/lib/supabaseClient";
import { AuthPage } from "@/pages/AuthPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { GeneratorPage } from "@/pages/GeneratorPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { RoutersPage } from "@/pages/RoutersPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

const titles: Record<string, string> = {
  "/": "لوحة التحكم",
  "/generator": "توليد الكروت",
  "/routers": "أجهزة MikroTik",
  "/library": "المكتبة",
  "/templates": "قوالب الطباعة",
  "/settings": "الإعدادات",
};

export default function App() {
  const location = useLocation();
  const title = titles[location.pathname] ?? "Obaid Manager";

  const [session, setSession] = useState<Session | null>(null);
  const [checkedSession, setCheckedSession] = useState(false);

  useEffect(() => {
    supabaseAuth.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckedSession(true);
    });
    const { data: listener } = supabaseAuth.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!checkedSession) return null; // avoid a flash of the login screen while checking
  if (!session) return <AuthPage />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-5 pb-20 md:pb-5">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/generator" element={<GeneratorPage />} />
            <Route path="/routers" element={<RoutersPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
