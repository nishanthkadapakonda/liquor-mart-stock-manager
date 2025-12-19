import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  badge?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, badge, icon }: StatCardProps) {
  const valueString = String(value);
  const valueLength = valueString.length;
  
  // Calculate font size based on value length
  // Smaller font for longer numbers, but keep it readable
  let fontSize = "1.75rem"; // text-2xl default (increased from 1.5rem)
  if (valueLength > 18) {
    fontSize = "1rem"; // text-base (increased from 0.875rem)
  } else if (valueLength > 15) {
    fontSize = "1.125rem"; // text-lg (increased from 1rem)
  } else if (valueLength > 12) {
    fontSize = "1.25rem"; // text-xl (increased from 1.125rem)
  } else if (valueLength > 10) {
    fontSize = "1.5rem"; // text-2xl (increased from 1.25rem)
  } else if (valueLength > 8) {
    fontSize = "1.625rem"; // between text-xl and text-2xl
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="mt-3 min-w-0 break-words font-semibold text-slate-900" style={{ fontSize }}>{value}</p>
      {badge && (
        <span className="mt-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {badge}
        </span>
      )}
    </div>
  );
}
