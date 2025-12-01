import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { TrendingUp, ShieldAlert } from "lucide-react";
import { api } from "../api/client";
import type { DashboardSummary } from "../api/types";
import { StatCard } from "../components/common/StatCard";
import { formatCurrency, formatNumber } from "../utils/formatters";

const ranges = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

export function DashboardPage() {
  const [range, setRange] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: async () => {
      const endDate = dayjs().format("YYYY-MM-DD");
      const startDate = dayjs().subtract(range - 1, "day").format("YYYY-MM-DD");
      const response = await api.get<DashboardSummary>("/dashboard/summary", {
        params: { startDate, endDate },
      });
      return response.data;
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const latestReportLines = data.latestReport?.lines ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Overview</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Key insights for the last {range} days
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-2 py-1 text-sm">
          {ranges.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`rounded-full px-3 py-1 ${
                range === item.value ? "bg-brand-600 text-white" : "text-slate-600"
              }`}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={formatCurrency(data.totalSales)}
          badge="Includes retail & belt"
          icon={<TrendingUp className="text-brand-500" size={20} />}
        />
        <StatCard label="Units sold" value={formatNumber(data.totalUnits)} />
        <StatCard
          label="Top selling item"
          value={data.topItems[0]?.name ?? "—"}
          badge={`${formatNumber(data.topItems[0]?.units ?? 0)} units`}
        />
        <StatCard
          label="Low stock items"
          value={data.lowStockItems.length}
          icon={<ShieldAlert className="text-red-500" size={20} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Latest Day-End Report</p>
              <p className="text-xl font-semibold text-slate-900">
                {data.latestReport
                  ? dayjs(data.latestReport.reportDate).format("DD MMM YYYY")
                  : "No reports yet"}
              </p>
            </div>
            {data.latestReport && (
              <div className="text-right text-sm text-slate-500">
                <p>Belt markup: ₹{Number(data.latestReport.beltMarkupRupees ?? 0)}</p>
                <p>Total units: {formatNumber(data.latestReport.totalUnitsSold ?? 0)}</p>
              </div>
            )}
          </div>
          <div className="mt-6 space-y-3">
            {latestReportLines.length === 0 ? (
              <p className="text-sm text-slate-500">Add a day-end report to get started.</p>
            ) : (
              latestReportLines.slice(0, 5).map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{line.item.name}</p>
                    <p className="text-xs uppercase text-slate-400">{line.channel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(Number(line.lineRevenue))}
                    </p>
                    <p className="text-xs text-slate-500">
                      {line.quantitySoldUnits} units @ ₹{Number(line.sellingPricePerUnit)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Low stock alerts</p>
              <p className="text-xl font-semibold text-slate-900">
                {data.lowStockItems.length} items below threshold
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {data.lowStockItems.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/40 px-4 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">SKU: {item.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-600">
                    {item.currentStockUnits} units
                  </p>
                  <p className="text-xs text-slate-500">
                    Reorder &lt; {item.reorderLevel ?? data.settings?.defaultLowStockThreshold ?? 10}
                  </p>
                </div>
              </div>
            ))}
            {data.lowStockItems.length === 0 && (
              <p className="text-sm text-slate-500">No low stock alerts 🎉</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Top sellers</p>
            <span className="text-xs text-slate-500">By units sold</span>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">Units</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topItems.map((item) => (
                <tr key={item.itemId}>
                  <td className="py-2 font-medium text-slate-900">{item.name}</td>
                  <td className="py-2 text-slate-600">{formatNumber(item.units)}</td>
                  <td className="py-2 text-right text-slate-900">
                    {formatCurrency(item.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Recent reports</p>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Date</th>
                <th className="py-2">Units</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.reports.slice(0, 6).map((report) => (
                <tr key={report.id}>
                  <td className="py-2 text-slate-900">
                    {dayjs(report.reportDate).format("DD MMM")}
                  </td>
                  <td className="py-2 text-slate-600">
                    {formatNumber(report.totalUnitsSold ?? 0)}
                  </td>
                  <td className="py-2 text-slate-900">
                    {formatCurrency(report.totalSalesAmount ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
