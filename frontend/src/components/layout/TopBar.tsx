import { Menu, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import { Sidebar } from "./Sidebar";

export function TopBar() {
  const { user, logout } = useAuth();
  const [showMobileNav, setShowMobileNav] = useState(false);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-sm lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMobileNav((prev) => !prev)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
          >
            <Menu size={18} />
          </button>
          <div>
            <p className="text-xs uppercase text-slate-400">Today</p>
            <p className="text-lg font-semibold text-slate-900">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{user?.name ?? "Admin"}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
            {user?.role && (
              <span className="mt-0.5 inline-flex items-center justify-end text-[11px] uppercase text-slate-400">
                {user.role === "ADMIN" ? "Admin" : "Viewer"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      {showMobileNav && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-64 bg-white shadow-xl">
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setShowMobileNav(false)} />
        </div>
      )}
    </>
  );
}
