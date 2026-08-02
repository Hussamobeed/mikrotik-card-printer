import { cn } from "@/lib/utils";
import { NavLink } from "react-router-dom";
import { navItems } from "./navItems";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          H
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Obaid</div>
          <div className="text-xs text-muted-foreground leading-tight">Manager</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
