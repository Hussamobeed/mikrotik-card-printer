import { Button } from "@/components/ui/button";
import { supabaseAuth } from "@/lib/supabaseClient";
import { useAppStore } from "@/stores/appStore";
import { LogOut, Languages, Moon, Sun } from "lucide-react";
import { useEffect } from "react";

export function Header({ title }: { title: string }) {
  const { theme, setTheme, lang, setLang } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [theme, lang]);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-5">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          title="تبديل اللغة"
        >
          <Languages className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title="تبديل المظهر"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => supabaseAuth.auth.signOut()}
          title="تسجيل الخروج"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
