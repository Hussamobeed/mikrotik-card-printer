import { CreditCard, FileBarChart, Gauge, Library, Router, Settings, SwatchBook } from "lucide-react";

export const navItems = [
  { to: "/", label: "الرئيسية", icon: Gauge },
  { to: "/generator", label: "التوليد", icon: CreditCard },
  { to: "/routers", label: "الأجهزة", icon: Router },
  { to: "/library", label: "المكتبة", icon: Library },
  { to: "/templates", label: "القوالب", icon: SwatchBook },
  { to: "/reports", label: "التقارير", icon: FileBarChart },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];
