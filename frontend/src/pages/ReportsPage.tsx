import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { api } from "../api/client";
import type {
  AnalyticsTimeSeries,
  DailyPerformanceAnalytics,
  TopItemsAnalytics,
  VelocityAnalytics,
} from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";

const channelOptions = [
  { value: "ALL", label: "All" },
  { value: "RETAIL", label: "Retail" },
  { value: "BELT", label: "Belt" },
] as const;

type ChannelFilter = (typeof channelOptions)[number]["value"];
type RangeKind = "YTD" | "LAST_30" | "LAST_60" | "LAST_90" | "CUSTOM" | "SINGLE";

const channelMixColors = ["#2563EB", "#F97316"];

export function ReportsPage() {
  const todayKey = dayjs().format("YYYY-MM-DD");
  const [rangeKind, setRangeKind] = useState<RangeKind>("YTD");
  const [metric, setMetric] = useState<"revenue" | "units">("revenue");
  const [channel, setChannel] = useState<ChannelFilter>("ALL");
  const [customRange, setCustomRange] = useState(() => ({
    startDate: dayjs(todayKey).subtract(29, "day").format("YYYY-MM-DD"),
    endDate: todayKey,
  }));
  const [singleDay, setSingleDay] = useState(() => todayKey);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const selectedRange = useMemo(() => {
    switch (rangeKind) {
      case "YTD":
        return {
          startDate: dayjs(todayKey).startOf("year").format("YYYY-MM-DD"),
          endDate: todayKey,
        };
      case "LAST_30":
      case "LAST_60":
      case "LAST_90": {
        const days = rangeKind === "LAST_30" ? 30 : rangeKind === "LAST_60" ? 60 : 90;
        return {
          startDate: dayjs(todayKey).subtract(days - 1, "day").format("YYYY-MM-DD"),
          endDate: todayKey,
        };
      }
      case "CUSTOM":
        return customRange;
      case "SINGLE":
        return { startDate: singleDay, endDate: singleDay };
      default:
        return customRange;
    }
  }, [rangeKind, customRange, singleDay, todayKey]);

  const rangeDays =
    dayjs(selectedRange.endDate).diff(dayjs(selectedRange.startDate), "day") + 1;

  const quickRanges = useMemo(
    () => [
      {
        kind: "YTD" as RangeKind,
        label: "Year to date",
        description: `${dayjs(todayKey).startOf("year").format("DD MMM")} – ${dayjs(todayKey).format("DD MMM")}`,
      },
      { kind: "LAST_30" as RangeKind, label: "Last 30 days", description: "Rolling 30-day window" },
      { kind: "LAST_60" as RangeKind, label: "Last 60 days", description: "Quarter view" },
      { kind: "LAST_90" as RangeKind, label: "Last 90 days", description: "Seasonal trend" },
    ],
    [todayKey],
  );

  const trendQuery = useQuery({
    queryKey: ["analytics", "time-series", selectedRange, metric, channel],
    queryFn: async () => {
      const response = await api.get<AnalyticsTimeSeries>("/analytics/time-series", {
        params: {
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          channel,
          metric,
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
          limit: 8,
          sort: metric === "revenue" ? "revenue" : "units",
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

  const seriesData = useMemo(() => trendQuery.data?.series ?? [], [trendQuery.data]);
  const topItems = topItemsQuery.data?.top ?? [];
  const velocity =
    velocityQuery.data?.velocity
      ?.slice()
      .sort((a, b) => (b.daysOfStockLeft ?? 0) - (a.daysOfStockLeft ?? 0))
      .slice(0, 6) ?? [];
  const dailyData = useMemo(
    () =>
      (dailyPerformanceQuery.data?.daily ?? []).map((entry) => ({
        ...entry,
        label: dayjs(entry.date).format("DD MMM"),
      })),
    [dailyPerformanceQuery.data],
  );
  const channelMixData = useMemo(() => {
    if (!dailyPerformanceQuery.data) return [];
    const { channelMix } = dailyPerformanceQuery.data;
    const total = channelMix.retailRevenue + channelMix.beltRevenue;
    return [
      { name: "Retail", value: channelMix.retailRevenue },
      { name: "Belt", value: channelMix.beltRevenue },
    ].map((entry, idx) => ({
      ...entry,
      fill: channelMixColors[idx],
      percent: total ? (entry.value / total) * 100 : 0,
    }));
  }, [dailyPerformanceQuery.data]);
  const topRevenueDays = useMemo(
    () => dailyData.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    [dailyData],
  );

  useEffect(() => {
    if (!dailyData.length) {
      setFocusedDay(null);
      return;
    }
    setFocusedDay((current) => {
      if (current && dailyData.some((day) => day.date === current)) {
        return current;
      }
      return dailyData[dailyData.length - 1].date;
    });
  }, [dailyData]);

  const focusedStats = useMemo(
    () => dailyData.find((day) => day.date === focusedDay) ?? null,
    [dailyData, focusedDay],
  );

  const trendSummary = useMemo(() => {
    if (!seriesData.length) {
      return { total: 0, avg: 0 };
    }
    const total = seriesData.reduce((sum, entry) => sum + entry.value, 0);
    return { total, avg: total / seriesData.length };
  }, [seriesData]);

  const rangeLabel = useMemo(() => {
    const start = dayjs(selectedRange.startDate).format("DD MMM YYYY");
    const end = dayjs(selectedRange.endDate).format("DD MMM YYYY");
    switch (rangeKind) {
      case "SINGLE":
        return `Single day · ${start}`;
      case "YTD":
        return `Year to date · ${start} – ${end}`;
      case "CUSTOM":
        return `Custom range · ${start} – ${end}`;
      default:
        return `${start} – ${end}`;
    }
  }, [selectedRange, rangeKind]);

  const trendTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    const point = payload[0];
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
        <p className="font-semibold">
          {dayjs(point.payload?.date as string).format("DD MMM YYYY")}
        </p>
        <p className="mt-1">
          {metric === "revenue"
            ? formatCurrency(Number(point.value ?? 0))
            : `${formatNumber(Number(point.value ?? 0))} units`}
        </p>
      </div>
    );
  };

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

  const handleApplySingleDay = () => {
    if (!singleDay) {
      toast.error("Select a date to focus on");
      return;
    }
    setRangeKind("SINGLE");
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) {
      return;
    }
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
    } catch (err) {
      console.error(err);
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const chartMetricLabel = metric === "revenue" ? "Revenue" : "Units";

  return (
    <div className="space-y-8" ref={reportRef}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Reports & analysis</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Deep dive into performance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare revenue vs units, identify top movers, and understand stock velocity.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">{rangeLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExporting}
          className="flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isExporting ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickRanges.map((option) => {
            const isActive = rangeKind === option.kind;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => setRangeKind(option.kind)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isActive ? "border-brand-300 bg-brand-50" : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                <p className="text-xs text-slate-500">{option.description}</p>
                {isActive && <p className="mt-1 text-[11px] font-semibold text-brand-600">Active</p>}
              </button>
            );
          })}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Custom range</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">Start date</label>
                <input
                  type="date"
                  value={customRange.startDate}
                  onChange={(e) =>
                    setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">End date</label>
                <input
                  type="date"
                  value={customRange.endDate}
                  onChange={(e) =>
                    setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyCustomRange}
              className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Apply custom range
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Single-day focus</p>
            <label className="mt-2 block text-[11px] font-medium text-slate-500">
              Date
              <input
                type="date"
                value={singleDay}
                max={todayKey}
                onChange={(e) => setSingleDay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleApplySingleDay}
              className="mt-3 rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              Focus on this day
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              {chartMetricLabel} trend · {channelOptions.find((c) => c.value === channel)?.label}
            </p>
            <p className="text-xl font-semibold text-slate-900">
              {metric === "revenue"
                ? formatCurrency(trendSummary.total)
                : `${formatNumber(trendSummary.total)} units`}{" "}
              across {rangeDays} day{rangeDays === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-500">
              Avg. per data point:{" "}
              {metric === "revenue"
                ? formatCurrency(trendSummary.avg)
                : `${formatNumber(trendSummary.avg)} units`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-sm">
              {["revenue", "units"].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full px-3 py-1 ${
                    metric === value ? "bg-brand-600 text-white" : "text-slate-600"
                  }`}
                  onClick={() => setMetric(value as "revenue" | "units")}
                >
                  {value === "revenue" ? "Revenue" : "Units"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-sm">
              {channelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-full px-3 py-1 ${
                    channel === option.value ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                  onClick={() => setChannel(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 h-72 w-full">
          {trendQuery.isLoading ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />
          ) : seriesData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Not enough data for this range yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                <XAxis dataKey="date" tickFormatter={(value) => dayjs(value).format("DD MMM")} />
                <YAxis
                  tickFormatter={(value) =>
                    metric === "revenue" ? formatCurrency(value).replace("₹", "₹ ") : formatNumber(value)
                  }
                />
                <Tooltip content={trendTooltip} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={metric === "revenue" ? "#2563EB" : "#0EA5E9"}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Daily performance</p>
            <span className="text-xs text-slate-500">Revenue & units per day</span>
          </div>
          <div className="mt-4 h-72 w-full">
            {dailyPerformanceQuery.isLoading ? (
              <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />
            ) : dailyData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Capture day-end reports to unlock daily trends.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyData}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                  <XAxis dataKey="label" />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(value).replace("₹", "₹ ")}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => formatNumber(value)}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const datum = payload[0].payload as (typeof dailyData)[number];
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
                          <p className="font-semibold">{dayjs(datum.date).format("DD MMM YYYY")}</p>
                          <p className="mt-1">{formatCurrency(datum.revenue)}</p>
                          <p className="text-slate-500">{formatNumber(datum.units)} units</p>
                        </div>
                      );
                    }}
                  />
                  <Bar yAxisId="left" dataKey="revenue" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="units"
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Channel mix</p>
            <span className="text-xs text-slate-500">Revenue split</span>
          </div>
          <div className="mt-4 h-64">
            {channelMixData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No revenue recorded for this range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Legend verticalAlign="bottom" height={24} />
                  <Pie
                    data={channelMixData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {channelMixData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const datum = payload[0].payload as (typeof channelMixData)[number];
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
                          <p className="font-semibold">{datum.name}</p>
                          <p className="mt-1">{formatCurrency(datum.value)}</p>
                          <p className="text-slate-500">{datum.percent.toFixed(1)}%</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {dailyPerformanceQuery.data && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold">
                Total revenue: {formatCurrency(dailyPerformanceQuery.data.summary.totalRevenue)}
              </p>
              <p>Units sold: {formatNumber(dailyPerformanceQuery.data.summary.totalUnits)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Daily table</p>
            <span className="text-xs text-slate-500">Click a row to focus</span>
          </div>
          <div className="mt-4 max-h-72 overflow-auto rounded-2xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Units</th>
                  <th className="px-3 py-2 text-right">Focus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topRevenueDays.map((day) => {
                  const isSelected = focusedDay === day.date;
                  return (
                    <tr key={day.date} className={isSelected ? "bg-brand-50/60" : ""}>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {dayjs(day.date).format("DD MMM YYYY")}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatCurrency(day.revenue)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatNumber(day.units)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setFocusedDay(day.date)}
                          className="text-xs font-semibold text-brand-600"
                        >
                          {isSelected ? "Focused" : "Focus"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {topRevenueDays.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      No day-level data in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Focused day insight</p>
          {focusedStats ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sm uppercase text-slate-400">Date</p>
                <p className="text-xl font-semibold text-slate-900">
                  {dayjs(focusedStats.date).format("DD MMM YYYY")}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-slate-500">Revenue</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(focusedStats.revenue)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-slate-500">Units sold</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatNumber(focusedStats.units)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-slate-500">Channel mix for the day</p>
                <div className="flex items-center justify-between text-slate-900">
                  <span>Retail</span>
                  <span>{formatCurrency(focusedStats.retailRevenue)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-slate-900">
                  <span>Belt</span>
                  <span>{formatCurrency(focusedStats.beltRevenue)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-slate-500">
              Pick any day from the table to see its breakdown.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Top items</p>
            <span className="text-xs text-slate-500">
              Sorted by {metric === "revenue" ? "revenue" : "units"}
            </span>
          </div>
          <div className="mt-4 h-64 w-full">
            {topItemsQuery.isLoading ? (
              <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />
            ) : topItems.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No sales recorded for this window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItems}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="itemName" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(value) =>
                      metric === "revenue" ? formatCurrency(value).replace("₹", "₹ ") : formatNumber(value)
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const datum = payload[0].payload as (typeof topItems)[number];
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
                          <p className="font-semibold">{datum.itemName}</p>
                          <p className="mt-1">
                            {metric === "revenue"
                              ? formatCurrency(datum.revenue)
                              : `${formatNumber(datum.units)} units`}
                          </p>
                          <p className="text-slate-500">
                            Stock: {formatNumber(datum.currentStock)} units
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey={metric === "revenue" ? "revenue" : "units"}
                    fill="#6366F1"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Velocity & coverage</p>
            <span className="text-xs text-slate-500">Top {velocity.length} movers</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            {velocityQuery.isLoading ? (
              <div className="h-48 w-full animate-pulse rounded-xl bg-slate-100" />
            ) : velocity.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Capture a few day-end reports to unlock velocity insights.
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2">Item</th>
                    <th className="py-2">Avg/day</th>
                    <th className="py-2">Stock</th>
                    <th className="py-2 text-right">Days left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {velocity.map((entry) => (
                    <tr key={entry.itemId}>
                      <td className="py-2 font-semibold text-slate-900">{entry.itemName}</td>
                      <td className="py-2 text-slate-600">
                        {formatNumber(entry.avgPerDay)}
                      </td>
                      <td className="py-2 text-slate-600">{formatNumber(entry.currentStock)}</td>
                      <td className="py-2 text-right font-semibold text-slate-900">
                        {entry.daysOfStockLeft !== null
                          ? `${entry.daysOfStockLeft.toFixed(1)} d`
                          : "∞"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
