import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import { api } from "../api/client";
import type {
  AnalyticsTimeSeries,
  DailyPerformanceAnalytics,
  DailyTopItemsAnalytics,
  Item,
  TopItemsAnalytics,
  VelocityAnalytics,
} from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";

const quickRanges = [
  { value: "LAST_30" as const, label: "Last 30 days", description: "Rolling month", days: 30 },
  { value: "LAST_60" as const, label: "Last 60 days", description: "Two months", days: 60 },
  { value: "LAST_90" as const, label: "Last 90 days", description: "Quarter", days: 90 },
] as const;

const channelOptions = ["ALL", "RETAIL", "BELT"] as const;
const movingAverageOptions = [7, 14] as const;
const channelWindowOptions = [7, 14, 30] as const;
const stockHealthOptions = [
  { value: "ALL" as const, label: "All" },
  { value: "LOW" as const, label: "< 15 days" },
  { value: "MEDIUM" as const, label: "15-30 days" },
  { value: "HIGH" as const, label: "> 30 days" },
];

type RangePreset = (typeof quickRanges)[number]["value"] | "CUSTOM";
type ChannelFilter = (typeof channelOptions)[number];
type MovingAverageWindow = (typeof movingAverageOptions)[number];
type ChannelWindow = (typeof channelWindowOptions)[number];
type StockHealthFilter = (typeof stockHealthOptions)[number]["value"];

export function ReportsPage() {
  const todayKey = dayjs().format("YYYY-MM-DD");
  const [rangeKind, setRangeKind] = useState<RangePreset>("LAST_30");
  const [customRange, setCustomRange] = useState(() => ({
    startDate: dayjs(todayKey).subtract(29, "day").format("YYYY-MM-DD"),
    endDate: todayKey,
  }));
  const [trendMetric, setTrendMetric] = useState<"revenue" | "units">("revenue");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState<MovingAverageWindow>(7);
  const [topItemsSort, setTopItemsSort] = useState<"revenue" | "units">("revenue");
  const [cumulativeMetric, setCumulativeMetric] = useState<"revenue" | "units">("revenue");
  const [channelWindow, setChannelWindow] = useState<ChannelWindow>(14);
  const [stockHealthFilter, setStockHealthFilter] = useState<StockHealthFilter>("ALL");
  const [inventorySearch, setInventorySearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const [dailyLeadersDraft, setDailyLeadersDraft] = useState(() => ({
    startDate: dayjs(todayKey).subtract(29, "day").format("YYYY-MM-DD"),
    endDate: todayKey,
  }));
  const [dailyLeadersRange, setDailyLeadersRange] = useState(() => ({
    startDate: dayjs(todayKey).subtract(29, "day").format("YYYY-MM-DD"),
    endDate: todayKey,
  }));
  const [dailyLeadersSort, setDailyLeadersSort] = useState<"revenue" | "units">("revenue");

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
    queryKey: ["analytics", "time-series", selectedRange, trendMetric, channelFilter],
    queryFn: async () => {
      const response = await api.get<AnalyticsTimeSeries>("/analytics/time-series", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          metric: trendMetric,
          channel: channelFilter,
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
    queryKey: ["analytics", "top-items", selectedRange, topItemsSort],
    queryFn: async () => {
      const response = await api.get<TopItemsAnalytics>("/analytics/top-items", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          limit: 6,
          sort: topItemsSort,
        },
      });
      return response.data;
    },
  });

  const velocityQuery = useQuery({
    queryKey: ["analytics", "velocity", selectedRange],
    queryFn: async () => {
      const response = await api.get<VelocityAnalytics>("/analytics/velocity", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
        },
      });
      return response.data.velocity;
    },
  });

  const inventoryQuery = useQuery({
    queryKey: ["analytics", "inventory"],
    queryFn: async () => {
      const response = await api.get<{ items: Item[] }>("/items");
      return response.data.items;
    },
  });

  const dailyTopItemsQuery = useQuery({
    queryKey: ["analytics", "daily-top-items", dailyLeadersRange, dailyLeadersSort],
    queryFn: async () => {
      const response = await api.get<DailyTopItemsAnalytics>("/analytics/daily-top-items", {
        params: {
          startDate: dailyLeadersRange.startDate,
          endDate: dailyLeadersRange.endDate,
          limit: 3,
          sort: dailyLeadersSort,
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

  const chartDataWithAverage = useMemo(() => {
    if (!chartData.length) return [];
    return chartData.map((entry, index) => {
      const startIndex = Math.max(0, index - (movingAverageWindow - 1));
      const windowSlice = chartData.slice(startIndex, index + 1);
      const average =
        windowSlice.reduce((sum, point) => sum + point.value, 0) / (windowSlice.length || 1);
      return { ...entry, movingAverage: average };
    });
  }, [chartData, movingAverageWindow]);

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
    return trendMetric === "revenue"
      ? (summary?.totalRevenue ?? 0) / chartData.length
      : (summary?.totalUnits ?? 0) / chartData.length;
  }, [chartData.length, trendMetric, summary?.totalRevenue, summary?.totalUnits]);

  const bestDay = topDays[0];

  const cumulativeSeries = useMemo(() => {
    let running = 0;
    return dailyRows.map((day) => {
      const value = cumulativeMetric === "revenue" ? day.revenue : day.units;
      running += value;
      return {
        label: dayjs(day.date).format("DD MMM"),
        cumulative: running,
      };
    });
  }, [dailyRows, cumulativeMetric]);

  const channelSeries = useMemo(() => {
    if (!dailyRows.length) return [];
    const startIndex = Math.max(0, dailyRows.length - channelWindow);
    return dailyRows.slice(startIndex).map((day) => ({
      label: dayjs(day.date).format("DD MMM"),
      retail: day.retailRevenue,
      belt: day.beltRevenue,
    }));
  }, [dailyRows, channelWindow]);

  const velocityData = velocityQuery.data ?? [];
  const filteredVelocity = useMemo(() => {
    const matches = velocityData.filter((entry) => {
      if (stockHealthFilter === "ALL") return true;
      if (entry.daysOfStockLeft === null) {
        return stockHealthFilter === "HIGH";
      }
      if (stockHealthFilter === "LOW") return entry.daysOfStockLeft < 15;
      if (stockHealthFilter === "MEDIUM") {
        return entry.daysOfStockLeft >= 15 && entry.daysOfStockLeft <= 30;
      }
      return entry.daysOfStockLeft > 30;
    });
    return matches.map((entry) => ({
      ...entry,
      scatterDays: entry.daysOfStockLeft ?? 120,
    }));
  }, [velocityData, stockHealthFilter]);

  const inventoryItems = inventoryQuery.data ?? [];
  const activeInventory = useMemo(
    () => inventoryItems.filter((item) => item.isActive !== false),
    [inventoryItems],
  );
  const inventoryRows = useMemo(() => {
    const normalizedSearch = inventorySearch.trim().toLowerCase();
    return activeInventory
      .filter((item) =>
        normalizedSearch
          ? item.name.toLowerCase().includes(normalizedSearch) ||
            item.sku.toLowerCase().includes(normalizedSearch) ||
            (item.brand ?? "").toLowerCase().includes(normalizedSearch)
          : true,
      )
      .sort((a, b) => b.currentStockUnits - a.currentStockUnits);
  }, [activeInventory, inventorySearch]);

  const inventorySnapshot = useMemo(() => {
    const totalUnits = activeInventory.reduce((sum, item) => sum + item.currentStockUnits, 0);
    const lowStock = activeInventory.filter((item) => {
      if (item.reorderLevel == null) return false;
      return item.currentStockUnits < item.reorderLevel;
    }).length;
    return {
      totalSkus: activeInventory.length,
      totalUnits,
      lowStock,
    };
  }, [activeInventory]);

  const dailyTopItems = dailyTopItemsQuery.data?.days ?? [];
  const cumulativeTotal = cumulativeSeries.at(-1)?.cumulative ?? 0;

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

  const handleApplyDailyLeadersRange = () => {
    if (!dailyLeadersDraft.startDate || !dailyLeadersDraft.endDate) {
      toast.error("Select both dates for the filter");
      return;
    }
    if (dayjs(dailyLeadersDraft.endDate).isBefore(dailyLeadersDraft.startDate)) {
      toast.error("End date must be after the start date");
      return;
    }
    setDailyLeadersRange(dailyLeadersDraft);
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

  const handleInventoryExport = useCallback(() => {
    if (!inventoryRows.length) {
      toast.error("No inventory data to export");
      return;
    }
    const headers = ["SKU", "Item", "Brand", "Category", "MRP", "Current stock", "Reorder level"];
    const rows = inventoryRows.map((item) => [
      item.sku,
      item.name,
      item.brand ?? "",
      item.category ?? "",
      Number(item.mrpPrice ?? 0),
      item.currentStockUnits,
      item.reorderLevel ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const safe = String(cell ?? "").replace(/"/g, '""');
            return `"${safe}"`;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-${dayjs().format("YYYYMMDD-HHmm")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Inventory CSV exported");
  }, [inventoryRows]);

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
          <h1 className="text-2xl font-semibold text-slate-900">Revenue intelligence board</h1>
          <p className="mt-1 text-sm text-slate-500">
            Switch ranges, compare channels, slice the data, and download complete visuals.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">{rangeLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExporting}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isExporting ? "Preparing PDF…" : "Download full PDF"}
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
          <p className="text-xs uppercase text-slate-400">Avg/day ({trendMetric === "revenue" ? "₹" : "units"})</p>
          <p className="text-2xl font-semibold text-slate-900">
            {trendMetric === "revenue" ? formatCurrency(avgPerDay) : formatNumber(avgPerDay)}
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
          <div className="grid gap-4 sm:grid-cols-2">{quickRangeButtons}</div>
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
            <div className="flex flex-wrap gap-2 rounded-full border border-slate-200 px-2 py-1 text-sm">
              {(["revenue", "units"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTrendMetric(value)}
                  className={`rounded-full px-3 py-1 ${
                    trendMetric === value ? "bg-brand-600 text-white" : "text-slate-600"
                  }`}
                >
                  {value === "revenue" ? "Revenue metric" : "Units metric"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">{trendMetric === "revenue" ? "Revenue" : "Units"} trend</p>
            <p className="text-xs text-slate-500">{chartData.length ? `${chartData.length} data points` : "Awaiting data"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-wide text-[10px]">Channel</span>
              {channelOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setChannelFilter(option)}
                  className={`rounded-full border px-3 py-1 ${
                    channelFilter === option
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {option === "ALL" ? "All" : option.toLowerCase() === "retail" ? "Retail" : "Belt"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-wide">{movingAverageWindow}-day avg</label>
              <input
                type="checkbox"
                checked={showMovingAverage}
                onChange={(e) => setShowMovingAverage(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <select
                value={movingAverageWindow}
                onChange={(e) => setMovingAverageWindow(Number(e.target.value) as MovingAverageWindow)}
                className="rounded-full border border-slate-200 px-2 py-1 text-xs"
              >
                {movingAverageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}d
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 h-72 w-full">
          {trendQuery.isLoading ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />
          ) : chartDataWithAverage.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Capture a few day-end reports to unlock analytics.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartDataWithAverage}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(value) =>
                    trendMetric === "revenue"
                      ? formatCurrency(value).replace("₹", "₹ ")
                      : formatNumber(value)
                  }
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]?.payload as { label: string; value: number; movingAverage?: number };
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
                        <p className="font-semibold">{point.label}</p>
                        <p className="mt-1">
                          {trendMetric === "revenue"
                            ? formatCurrency(Number(point.value ?? 0))
                            : `${formatNumber(Number(point.value ?? 0))} units`}
                        </p>
                        {showMovingAverage && (
                          <p className="text-[11px] text-slate-500">
                            Avg {movingAverageWindow}d: {" "}
                            {trendMetric === "revenue"
                              ? formatCurrency(point.movingAverage ?? 0)
                              : `${formatNumber(point.movingAverage ?? 0)} units`}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={trendMetric === "revenue" ? "#2563EB" : "#0EA5E9"}
                  strokeWidth={2}
                  dot={false}
                />
                {showMovingAverage && (
                  <Line type="monotone" dataKey="movingAverage" stroke="#94A3B8" strokeDasharray="6 6" dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Cumulative {cumulativeMetric === "revenue" ? "revenue" : "units"}</p>
              <p className="text-xs text-slate-500">{rangeLabel}</p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              {(["revenue", "units"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCumulativeMetric(value)}
                  className={`rounded-full border px-2 py-1 ${
                    cumulativeMetric === value
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {value === "revenue" ? "Revenue" : "Units"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {cumulativeMetric === "revenue" ? formatCurrency(cumulativeTotal) : formatNumber(cumulativeTotal)}
          </p>
          <div className="mt-4 h-56">
            {cumulativeSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Waiting for data…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeSeries}>
                  <defs>
                    <linearGradient id="cumulative" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(value) =>
                      cumulativeMetric === "revenue"
                        ? formatCurrency(value).replace("₹", "₹ ")
                        : formatNumber(value)
                    }
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      cumulativeMetric === "revenue" ? formatCurrency(value) : formatNumber(value)
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#2563EB"
                    fill="url(#cumulative)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Channel mix (last {channelWindow} days)</p>
              <p className="text-xs text-slate-500">Retail vs Belt revenue split</p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              {channelWindowOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setChannelWindow(option)}
                  className={`rounded-full border px-2 py-1 ${
                    channelWindow === option
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-56">
            {channelSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Not enough data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelSeries}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" />
                  <XAxis dataKey="label" hide />
                  <YAxis tickFormatter={(value) => formatCurrency(value).replace("₹", "₹ ")} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="retail" stackId="channel" fill="#2563EB" radius={[4, 4, 0, 0]} name="Retail" />
                  <Bar dataKey="belt" stackId="channel" fill="#0EA5E9" radius={[4, 4, 0, 0]} name="Belt" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {channelMix && (
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs uppercase text-slate-400">Retail total</p>
                <p className="font-semibold text-slate-900">{formatCurrency(channelMix.retailRevenue)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Belt total</p>
                <p className="font-semibold text-slate-900">{formatCurrency(channelMix.beltRevenue)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">Top items</p>
              <span className="text-xs text-slate-500">By {topItemsSort === "revenue" ? "revenue" : "units"}</span>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              {(["revenue", "units"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTopItemsSort(value)}
                  className={`rounded-full border px-3 py-1 ${
                    topItemsSort === value
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  Sort by {value === "revenue" ? "revenue" : "units"}
                </button>
              ))}
            </div>
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
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Stock velocity</p>
            <select
              value={stockHealthFilter}
              onChange={(e) => setStockHealthFilter(e.target.value as StockHealthFilter)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs"
            >
              {stockHealthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-slate-500">Hover to see remaining days of stock</p>
          <div className="mt-4 h-56">
            {filteredVelocity.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No items match this filter</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    type="number"
                    dataKey="avgPerDay"
                    name="Avg/day"
                    tickFormatter={(value) => `${formatNumber(value)}u`}
                  />
                  <YAxis
                    type="number"
                    dataKey="scatterDays"
                    name="Days left"
                    tickFormatter={(value) => formatNumber(value)}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0].payload as (typeof velocityData)[number];
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
                          <p className="font-semibold">{point.itemName}</p>
                          <p className="mt-1">Avg/day: {formatNumber(point.avgPerDay)}</p>
                          <p>Stock: {formatNumber(point.currentStock)} units</p>
                          <p>Days left: {point.daysOfStockLeft ? formatNumber(point.daysOfStockLeft) : "∞"}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={filteredVelocity} fill="#2563EB" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Daily revenue leaders</p>
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
              <p className="text-xs uppercase text-slate-400">Channel totals</p>
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="font-semibold text-slate-900">Retail</p>
                  <p className="text-slate-500">{formatCurrency(channelMix.retailRevenue)}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Belt</p>
                  <p className="text-slate-500">{formatCurrency(channelMix.beltRevenue)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">Daily top 3 products</p>
              <p className="text-xs text-slate-500">
                {dayjs(dailyLeadersRange.startDate).format("DD MMM")} – {dayjs(dailyLeadersRange.endDate).format("DD MMM")}
              </p>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dailyLeadersDraft.startDate}
                  onChange={(e) => setDailyLeadersDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-2 py-1"
                />
                <input
                  type="date"
                  value={dailyLeadersDraft.endDate}
                  onChange={(e) => setDailyLeadersDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-2 py-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={dailyLeadersSort}
                  onChange={(e) => setDailyLeadersSort(e.target.value as "revenue" | "units")}
                  className="rounded-xl border border-slate-200 px-2 py-1"
                >
                  <option value="revenue">Sort by revenue</option>
                  <option value="units">Sort by units</option>
                </select>
                <button
                  type="button"
                  onClick={handleApplyDailyLeadersRange}
                  className="rounded-full bg-slate-900 px-3 py-1 text-white"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 max-h-64 space-y-3 overflow-auto text-sm">
            {dailyTopItemsQuery.isLoading ? (
              <p className="text-slate-500">Loading daily product leaders…</p>
            ) : dailyTopItems.length === 0 ? (
              <p className="text-slate-500">No sales data for the selected dates.</p>
            ) : (
              dailyTopItems.map((day) => (
                <div key={day.date} className="rounded-xl border border-slate-100 px-3 py-2">
                  <p className="text-xs font-semibold uppercase text-slate-400">{dayjs(day.date).format("DD MMM YYYY")}</p>
                  {day.topItems.length === 0 ? (
                    <p className="text-xs text-slate-500">No sales recorded.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {day.topItems.map((item, index) => (
                        <li key={item.itemId} className="flex items-center justify-between text-slate-700">
                          <span>
                            <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              #{index + 1}
                            </span>
                            {item.itemName}
                          </span>
                          <span className="text-xs text-slate-500">
                            {dailyLeadersSort === "revenue"
                              ? formatCurrency(item.revenue)
                              : `${formatNumber(item.units)} units`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900">Inventory snapshot</p>
            <p className="text-xs text-slate-500">Always up-to-date from Items master</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <input
              type="text"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Search SKU, name, brand…"
              className="w-full rounded-full border border-slate-200 px-4 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:w-64"
            />
            <button
              type="button"
              onClick={handleInventoryExport}
              className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700"
            >
              Download inventory CSV
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs uppercase text-slate-500">Active SKUs</p>
            <p className="text-2xl font-semibold text-slate-900">{inventorySnapshot.totalSkus}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs uppercase text-slate-500">Units on hand</p>
            <p className="text-2xl font-semibold text-slate-900">{formatNumber(inventorySnapshot.totalUnits)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs uppercase text-slate-500">Below reorder</p>
            <p className="text-2xl font-semibold text-amber-600">{inventorySnapshot.lowStock}</p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">SKU</th>
                <th className="py-2">Item</th>
                <th className="py-2">Brand</th>
                <th className="py-2">Category</th>
                <th className="py-2 text-right">MRP</th>
                <th className="py-2 text-right">Stock</th>
                <th className="py-2 text-right">Reorder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventoryRows.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 font-semibold text-slate-900">{item.sku}</td>
                  <td className="py-3">
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.volumeMl ? `${item.volumeMl} ml` : ""}</p>
                  </td>
                  <td className="py-3 text-slate-600">{item.brand ?? "—"}</td>
                  <td className="py-3 text-slate-600">{item.category ?? "—"}</td>
                  <td className="py-3 text-right text-slate-600">{formatCurrency(Number(item.mrpPrice ?? 0))}</td>
                  <td className="py-3 text-right font-semibold text-slate-900">{formatNumber(item.currentStockUnits)}</td>
                  <td className="py-3 text-right text-slate-600">{item.reorderLevel ?? "—"}</td>
                </tr>
              ))}
              {inventoryRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    {inventoryQuery.isLoading ? "Loading inventory…" : "No items match the filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
