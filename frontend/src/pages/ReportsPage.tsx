import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import toast from "react-hot-toast";
import { api } from "../api/client";
import type { AnalyticsTimeSeries, DailyPerformanceAnalytics, TopItemsAnalytics } from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";

const quickRanges = [
  { value: "LAST_30" as const, label: "Last 30 days", description: "Rolling month", days: 30 },
  { value: "LAST_60" as const, label: "Last 60 days", description: "Two months", days: 60 },
  { value: "LAST_90" as const, label: "Last 90 days", description: "Quarter", days: 90 },
] as const;

type RangePreset = (typeof quickRanges)[number]["value"] | "CUSTOM";

export function ReportsPage() {
  const todayKey = dayjs().format("YYYY-MM-DD");
  const [rangeKind, setRangeKind] = useState<RangePreset>("LAST_30");
  const [customRange, setCustomRange] = useState(() => ({
    startDate: dayjs(todayKey).subtract(29, "day").format("YYYY-MM-DD"),
    endDate: todayKey,
  }));
  const [metric, setMetric] = useState<"revenue" | "units">("revenue");
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const selectedRange = useMemo(() => {
    if (rangeKind === "CUSTOM") {
      return customRange;
    }
    const preset = quickRanges.find((entry) => entry.value === rangeKind) ?? quickRanges[0];
    const endDate = todayKey;
    const startDate = dayjs(endDate).subtract((preset.days ?? 30) - 1, "day").format("YYYY-MM-DD");
    return { startDate, endDate };
  }, [rangeKind, customRange, todayKey]);

  const rangeLabel = useMemo(() => {
    const start = dayjs(selectedRange.startDate).format("DD MMM YYYY");
    const end = dayjs(selectedRange.endDate).format("DD MMM YYYY");
    return `${start} – ${end}`;
  }, [selectedRange]);

  const trendQuery = useQuery({
    queryKey: ["analytics", "time-series", selectedRange, metric],
    queryFn: async () => {
      const response = await api.get<AnalyticsTimeSeries>("/analytics/time-series", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          metric,
        },
      });
      return response.data;
    },
  });

  const dailyPerformanceQuery = useQuery({
    queryKey: ["analytics", "daily-performance", selectedRange],
    queryFn: async () => {
      const response = await api.get<DailyPerformanceAnalytics>("/analytics/daily-performance", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
        },
      });
      return response.data;
    },
  });

  const topItemsQuery = useQuery({
    queryKey: ["analytics", "top-items", selectedRange, metric],
    queryFn: async () => {
      const response = await api.get<TopItemsAnalytics>("/analytics/top-items", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          limit: 6,
          sort: metric === "revenue" ? "revenue" : "units",
        },
      });
      return response.data;
    },
  });

  const chartData = useMemo(
    () =>
      (trendQuery.data?.series ?? []).map((entry) => ({
        ...entry,
        label: dayjs(entry.date).format("DD MMM"),
      })),
    [trendQuery.data],
  );

  const summary = dailyPerformanceQuery.data?.summary;
  const channelMix = dailyPerformanceQuery.data?.channelMix;
  const dailyRows = useMemo(
    () => dailyPerformanceQuery.data?.daily ?? [],
    [dailyPerformanceQuery.data],
  );
  const topDays = useMemo(
    () => dailyRows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    [dailyRows],
  );
  const topItems = topItemsQuery.data?.top ?? [];

  const avgPerDay = useMemo(() => {
    if (!chartData.length) return 0;
    return metric === "revenue"
      ? (summary?.totalRevenue ?? 0) / chartData.length
      : (summary?.totalUnits ?? 0) / chartData.length;
  }, [chartData.length, metric, summary?.totalRevenue, summary?.totalUnits]);

  const bestDay = topDays[0];

  const handleApplyCustomRange = () => {
    if (!customRange.startDate || !customRange.endDate) {
      toast.error("Select both start and end dates");
      return;
    }
    if (dayjs(customRange.endDate).isBefore(customRange.startDate)) {
      toast.error("End date must be after the start date");
      return;
    }
    setRangeKind("CUSTOM");
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    try {
      setIsExporting(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      pdf.save(`reports-${selectedRange.startDate}_${selectedRange.endDate}.pdf`);
      toast.success("Report downloaded");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const quickRangeButtons = quickRanges.map((option) => {
    const isActive = option.value === rangeKind;
    return (
      <button
        key={option.value}
        type="button"
        onClick={() => setRangeKind(option.value)}
        className={`rounded-2xl border px-4 py-3 text-left transition ${
          isActive ? "border-brand-300 bg-brand-50" : "border-slate-100 hover:border-slate-200"
        }`}
      >
        <p className="text-sm font-semibold text-slate-900">{option.label}</p>
        <p className="text-xs text-slate-500">{option.description}</p>
        {isActive && <p className="mt-1 text-[11px] font-semibold text-brand-600">Active</p>}
      </button>
    );
  });

  return (
    <div className="space-y-8" ref={reportRef}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Reports & analytics</p>
          <h1 className="text-2xl font-semibold text-slate-900">Simplified performance view</h1>
          <p className="mt-1 text-sm text-slate-500">Switch ranges, toggle metrics, and focus on the KPIs that matter.</p>
          <p className="mt-2 text-xs font-medium text-slate-500">{rangeLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExporting}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isExporting ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-400">Total revenue</p>
          <p className="text-2xl font-semibold text-slate-900">{formatCurrency(summary?.totalRevenue ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-400">Total units</p>
          <p className="text-2xl font-semibold text-slate-900">{formatNumber(summary?.totalUnits ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-400">Avg/day ({metric === "revenue" ? "₹" : "units"})</p>
          <p className="text-2xl font-semibold text-slate-900">
            {metric === "revenue" ? formatCurrency(avgPerDay) : formatNumber(avgPerDay)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-400">Best day</p>
          {bestDay ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">{dayjs(bestDay.date).format("DD MMM YYYY")}</p>
              <p className="text-xs text-slate-500">{formatCurrency(bestDay.revenue)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Capture more reports to unlock insights.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {quickRangeButtons}
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-slate-500">Custom start</label>
              <input
                type="date"
                value={customRange.startDate}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500">Custom end</label>
              <input
                type="date"
                value={customRange.endDate}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleApplyCustomRange}
              className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Apply custom range
            </button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 px-2 py-1 text-sm">
              {["revenue", "units"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMetric(value as "revenue" | "units")}
                  className={`rounded-full px-3 py-1 ${metric === value ? "bg-brand-600 text-white" : "text-slate-600"}`}
                >
                  {value === "revenue" ? "Revenue" : "Units"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{metric === "revenue" ? "Revenue" : "Units"} trend</p>
            <p className="text-xs text-slate-500">{chartData.length ? `${chartData.length} data points` : "Awaiting data"}</p>
          </div>
        </div>
        <div className="mt-4 h-72 w-full">
          {trendQuery.isLoading ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Capture a few day-end reports to unlock analytics.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => (metric === "revenue" ? formatCurrency(value).replace("₹", "₹ ") : formatNumber(value))} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0];
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
                        <p className="font-semibold">{point.payload?.label}</p>
                        <p className="mt-1">
                          {metric === "revenue"
                            ? formatCurrency(Number(point.value ?? 0))
                            : `${formatNumber(Number(point.value ?? 0))} units`}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="value" stroke={metric === "revenue" ? "#2563EB" : "#0EA5E9"} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Top items</p>
            <span className="text-xs text-slate-500">By {metric === "revenue" ? "revenue" : "units"}</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Units</th>
                  <th className="py-2">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topItems.map((item) => (
                  <tr key={item.itemId}>
                    <td className="py-2 font-semibold text-slate-900">{item.itemName}</td>
                    <td className="py-2 text-slate-600">{formatNumber(item.units)}</td>
                    <td className="py-2 text-slate-900">{formatCurrency(item.revenue)}</td>
                  </tr>
                ))}
                {topItems.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">
                      No sales captured for this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Daily leaders</p>
          <div className="mt-4 max-h-64 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Revenue</th>
                  <th className="py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDays.map((day) => (
                  <tr key={day.date}>
                    <td className="py-2 font-semibold text-slate-900">{dayjs(day.date).format("DD MMM")}</td>
                    <td className="py-2 text-slate-600">{formatCurrency(day.revenue)}</td>
                    <td className="py-2 text-right text-slate-600">{formatNumber(day.units)}</td>
                  </tr>
                ))}
                {topDays.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">
                      Need more day-end reports to compute trends.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {channelMix && (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-xs uppercase text-slate-400">Channel mix</p>
              <div>
                <p className="font-semibold text-slate-900">Retail</p>
                <p className="text-slate-500">{formatCurrency(channelMix.retailRevenue)}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Belt</p>
                <p className="text-slate-500">{formatCurrency(channelMix.beltRevenue)}</p>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={[{ name: "Retail", value: channelMix.retailRevenue }, { name: "Belt", value: channelMix.beltRevenue }]}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => formatCurrency(value).replace("₹", "₹ ")} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
