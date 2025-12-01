import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { ItemsPage } from "./pages/ItemsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./providers/AuthProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const placeholderRoutes = [
  { path: "day-end", title: "Day-End Sales" },
  { path: "reports", title: "Reports & Analytics" },
  { path: "settings", title: "Settings" },
];

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">Coming soon</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
        This section is still being built. You can continue using the dashboard, items, and
        purchases screens from the sidebar in the meantime.
      </p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="items" element={<ItemsPage />} />
                <Route path="purchases" element={<PurchasesPage />} />
                {placeholderRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<ComingSoon title={route.title} />}
                  />
                ))}
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
