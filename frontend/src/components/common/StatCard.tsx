import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  badge?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, badge, icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
      {badge && (
        <span className="mt-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {badge}
        </span>
      )}
    </div>
  );
}
