import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { api } from "../api/client";
import type {
  AnalyticsTimeSeries,
  TopItemsAnalytics,
  VelocityAnalytics,
} from "../api/types";
import { formatCurrency, formatNumber } from "../utils/formatters";

const rangeOptions = [7, 30, 60, 90];
const channelOptions = [
  { value: "ALL", label: "All" },
  { value: "RETAIL", label: "Retail" },
  { value: "BELT", label: "Belt" },
] as const;

type ChannelFilter = (typeof channelOptions)[number]["value"];

export function ReportsPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const [metric, setMetric] = useState<"revenue" | "units">("revenue");
  const [channel, setChannel] = useState<ChannelFilter>("ALL");

  const dateRange = useMemo(() => {
    const endDate = dayjs().format("YYYY-MM-DD");
    const startDate = dayjs().subtract(rangeDays - 1, "day").format("YYYY-MM-DD");
    return { startDate, endDate };
  }, [rangeDays]);

  const trendQuery = useQuery({
    queryKey: ["analytics", "time-series", rangeDays, metric, channel],
    queryFn: async () => {
      const response = await api.get<AnalyticsTimeSeries>("/analytics/time-series", {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          channel,
          metric,
        },
      });
      return response.data;
    },
  });

  const topItemsQuery = useQuery({
    queryKey: ["analytics", "top-items", rangeDays, metric],
    queryFn: async () => {
      const response = await api.get<TopItemsAnalytics>("/analytics/top-items", {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          limit: 8,
          sort: metric === "revenue" ? "revenue" : "units",
        },
      });
      return response.data;
    },
  });

  const velocityQuery = useQuery({
    queryKey: ["analytics", "velocity", rangeDays],
    queryFn: async () => {
      const response = await api.get<VelocityAnalytics>("/analytics/velocity", {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      });
      return response.data;
    },
  });

  const trendSummary = useMemo(() => {
    const series = trendQuery.data?.series ?? [];
    if (!series.length) {
      return { total: 0, avg: 0 };
    }
    const total = series.reduce((sum, entry) => sum + entry.value, 0);
    return { total, avg: total / series.length };
  }, [trendQuery.data]);

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

  const seriesData = trendQuery.data?.series ?? [];
  const topItems = topItemsQuery.data?.top ?? [];
  const velocity =
    velocityQuery.data?.velocity
      ?.slice()
      .sort((a, b) => (b.daysOfStockLeft ?? 0) - (a.daysOfStockLeft ?? 0))
      .slice(0, 6) ?? [];

  const chartMetricLabel = metric === "revenue" ? "Revenue" : "Units";

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm uppercase text-slate-400">Reports & analysis</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Deep dive into performance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare revenue vs units, identify top movers, and understand stock velocity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-200 px-2 py-1 text-sm">
          {rangeOptions.map((days) => (
            <button
              key={days}
              type="button"
              className={`rounded-full px-3 py-1 ${
                rangeDays === days ? "bg-brand-600 text-white" : "text-slate-600"
              }`}
              onClick={() => setRangeDays(days)}
            >
              Last {days}d
            </button>
          ))}
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
              in {rangeDays} days
            </p>
            <p className="text-xs text-slate-500">
              Avg. per day:{" "}
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
