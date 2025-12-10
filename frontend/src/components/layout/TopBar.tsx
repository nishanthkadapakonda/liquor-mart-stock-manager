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
      <header className="flex min-w-0 items-center justify-between overflow-x-hidden border-b border-slate-200 bg-white px-4 py-4 shadow-sm lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMobileNav((prev) => !prev)}
            className="flex-shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-xs uppercase text-slate-400">Today</p>
            <p className="truncate text-lg font-semibold text-slate-900">{today}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-shrink-0 items-center gap-2 lg:gap-4">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.name ?? "Admin"}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
            {user?.role && (
              <span className="mt-0.5 inline-flex items-center justify-end text-[11px] uppercase text-slate-400">
                {user.role === "ADMIN" ? "Admin" : "Viewer"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {showMobileNav && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full w-64 bg-white shadow-xl">
            <Sidebar variant="mobile" />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setShowMobileNav(false)} />
        </div>
      )}
    </>
  );
}
