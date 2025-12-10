import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-50">
      <Sidebar variant="desktop" />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
