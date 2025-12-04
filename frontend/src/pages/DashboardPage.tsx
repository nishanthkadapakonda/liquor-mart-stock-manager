import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { TrendingUp, ShieldAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { DashboardSummary, TopItemsAnalytics } from "../api/types";
import { StatCard } from "../components/common/StatCard";
import { formatCurrency, formatNumber } from "../utils/formatters";

const ranges = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

const topSellersRanges = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 60 days", value: 60 },
  { label: "Last 90 days", value: 90 },
];

export function DashboardPage() {
  const [range, setRange] = useState(7);
  const [topSellersRange, setTopSellersRange] = useState(30);

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

  const topSellersQuery = useQuery({
    queryKey: ["top-sellers", topSellersRange],
    queryFn: async () => {
      const endDate = dayjs().format("YYYY-MM-DD");
      const startDate = dayjs().subtract(topSellersRange - 1, "day").format("YYYY-MM-DD");
      const response = await api.get<TopItemsAnalytics>("/analytics/top-items", {
        params: { startDate, endDate, limit: 10, sort: "units" },
      });
      return response.data;
    },
    refetchInterval: 60_000,
  });

  const topSellersChartData = useMemo(() => {
    if (!topSellersQuery.data?.top) return [];
    return topSellersQuery.data.top.map((item) => ({
      name: item.itemName.length > 20 ? `${item.itemName.substring(0, 20)}...` : item.itemName,
      fullName: item.itemName,
      units: item.units,
      revenue: item.revenue,
    }));
  }, [topSellersQuery.data]);

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
                <p>Belt markup: {formatCurrency(data.latestReport.beltMarkupRupees ?? 0)}</p>
                <p>Total units: {formatNumber(data.latestReport.totalUnitsSold ?? 0)}</p>
              </div>
            )}
          </div>
          <div className="mt-6 space-y-3">
            {latestReportLines.length === 0 ? (
              <p className="text-sm text-slate-500">Add a day-end report to get started.</p>
            ) : (
              latestReportLines.slice(0, 5).map((line) => {
                const sizeInfo = line.item.packSizeLabel || `${line.item.sizeCode || ""}${line.item.packType ? ` ${line.item.packType}` : ""}`.trim();
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{line.item.name}</p>
                      <p className="text-xs text-slate-500">
                        SKU: {line.item.sku}
                        {sizeInfo && ` • ${sizeInfo}`}
                      </p>
                      <p className="text-xs uppercase text-slate-400">{line.channel}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(Number(line.lineRevenue))}
                      </p>
                      <p className="text-xs text-slate-500">
                        {line.quantitySoldUnits} units @ {formatCurrency(line.sellingPricePerUnit)}
                      </p>
                    </div>
                  </div>
                );
              })
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
            {data.lowStockItems.slice(0, 6).map((item) => {
              const sizeInfo = item.packSizeLabel || `${item.sizeCode || ""}${item.packType ? ` ${item.packType}` : ""}`.trim();
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/40 px-4 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      SKU: {item.sku}
                      {sizeInfo && ` • ${sizeInfo}`}
                    </p>
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
              );
            })}
            {data.lowStockItems.length === 0 && (
              <p className="text-sm text-slate-500">No low stock alerts 🎉</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Top sellers (Top 10)</p>
            <div className="flex items-center gap-2">
              <select
                value={topSellersRange}
                onChange={(e) => setTopSellersRange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {topSellersRanges.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">By units sold</span>
            </div>
          </div>
          {topSellersQuery.isLoading ? (
            <div className="mt-4 flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"></div>
            </div>
          ) : topSellersQuery.data?.top.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No sales data for the selected period.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Units</th>
                  <th className="py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSellersQuery.data?.top.map((item) => {
                  const sizeInfo = item.packSizeLabel || `${item.sizeCode || ""}${item.packType ? ` ${item.packType}` : ""}`.trim();
                  return (
                    <tr key={item.itemId}>
                      <td className="py-2">
                        <p className="font-medium text-slate-900">{item.itemName}</p>
                        <p className="text-xs text-slate-500">
                          SKU: {item.sku || "—"}
                          {sizeInfo && ` • ${sizeInfo}`}
                        </p>
                      </td>
                      <td className="py-2 text-slate-600">{formatNumber(item.units)}</td>
                      <td className="py-2 text-right text-slate-900">
                        {formatCurrency(item.revenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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

      {/* Top Sellers Visual Chart */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-slate-900">Top 10 Sellers - Visual Report</p>
          <div className="flex items-center gap-2">
            <select
              value={topSellersRange}
              onChange={(e) => setTopSellersRange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {topSellersRanges.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">By units sold</span>
          </div>
        </div>
        {topSellersQuery.isLoading ? (
          <div className="mt-4 flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"></div>
          </div>
        ) : topSellersChartData.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No sales data for the selected period.</p>
        ) : (
          <div className="mt-4 h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={topSellersChartData}
                margin={{ left: 120, right: 20, top: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => formatNumber(value)}
                  label={{ value: "Units Sold", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [
                    `${formatNumber(value)} units`,
                    props.payload.fullName,
                  ]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="units"
                  fill="#2563EB"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
