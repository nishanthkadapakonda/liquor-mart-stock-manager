import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "../api/client";
import type { AdminUser, UserRole } from "../api/types";

interface UserListItem extends Pick<AdminUser, "id" | "email" | "name" | "role"> {
  createdAt: string;
}

const roleOptions: Array<{ label: string; value: UserRole; description: string }> = [
  { value: "VIEWER", label: "Viewer", description: "Can only view dashboards, stock & purchases." },
  { value: "ADMIN", label: "Admin", description: "Full access including edits and settings." },
];

export function UsersPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "VIEWER" as UserRole,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await api.get<{ users: UserListItem[] }>("/users");
      return response.data.users;
    },
  });

  const sortedUsers = useMemo(
    () => (usersQuery.data ?? []).slice().sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf()),
    [usersQuery.data],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post("/users", form);
      toast.success("User created");
      setForm({ name: "", email: "", password: "", role: "VIEWER" });
      usersQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase text-slate-400">Team & access</p>
        <h1 className="text-2xl font-semibold text-slate-900">Invite colleagues</h1>
        <p className="text-sm text-slate-500">
          Viewer accounts can browse stock, purchases, dashboards, and reports without being able to change data.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Add a new user</p>
          <p className="text-xs text-slate-500">Passwords can be changed later by the user from the login screen.</p>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <label className="text-xs font-medium text-slate-500">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Viewer name"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Temporary password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Min 8 characters"
                required
                minLength={8}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Role</label>
              <div className="mt-2 space-y-2">
                {roleOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                      form.role === option.value ? "border-brand-200 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={option.value}
                      checked={form.role === option.value}
                      onChange={() => setForm((prev) => ({ ...prev, role: option.value }))}
                      className="text-brand-600 focus:ring-brand-400"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">{option.label}</p>
                      <p className="text-xs text-slate-500">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {isSubmitting ? "Creating…" : "Create user"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Existing users</p>
            <button
              type="button"
              onClick={() => usersQuery.refetch()}
              className="text-xs font-semibold text-brand-600"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Added on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{user.name ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{user.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                          user.role === "ADMIN"
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.role === "ADMIN" ? "Admin" : "Viewer"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {dayjs(user.createdAt).format("DD MMM YYYY")}
                    </td>
                  </tr>
                ))}
                {(sortedUsers.length === 0 || usersQuery.isLoading) && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      {usersQuery.isLoading ? "Loading users…" : "No users added yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
