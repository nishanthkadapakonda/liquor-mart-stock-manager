import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { getErrorMessage } from "../api/client";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = (location.state as { from?: Location })?.from?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password, remember });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-2">
        <div className="hidden bg-brand-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-brand-100">Liquor Mart</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight">
              Stock & Sales Manager
            </h1>
            <p className="mt-3 text-sm text-brand-100">
              Monitor purchases, day-end sales, low stock alerts, and belt performance in one
              place.
            </p>
          </div>
          <div className="space-y-2 text-sm text-brand-100">
            <p>✅ Built-in day-end validations</p>
            <p>✅ PDF-ready analytics</p>
            <p>✅ Quick CSV/XLSX imports</p>
          </div>
        </div>

        <div className="p-10">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900">Admin Login</h2>
            <p className="text-sm text-slate-500">Enter the seeded admin credentials.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} autoComplete="on">
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder=""
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder=""
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                required
              />
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Remember me
              </label>
              <span className="text-slate-400">Seeded admin only</span>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
