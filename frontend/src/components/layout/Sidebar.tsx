import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Items / Stock", path: "/items", icon: Boxes },
  { label: "Purchases", path: "/purchases", icon: ShoppingCart },
  { label: "Day-End Sales", path: "/day-end", icon: ClipboardList },
  { label: "Reports & Analytics", path: "/reports", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "User Access", path: "/users", icon: Users, adminOnly: true },
] as const;

export function Sidebar() {
  const { user } = useAuth();
  const canSeeAdminLinks = user?.role === "ADMIN";

  return (
    <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white font-semibold">
          LM
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900">Liquor Mart</p>
          <p className="text-xs text-slate-500">Stock & Sales Manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems
          .filter((item) => (item.adminOnly ? canSeeAdminLinks : true))
          .map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")
              }
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-6 py-6 text-xs text-slate-400">
        © {new Date().getFullYear()} Liquor Mart Ops
      </div>
    </aside>
  );
}
