import dayjs from "dayjs";
import { prisma } from "../prisma";
import type { SalesChannel } from "../types/domain";

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export async function getDashboardMetrics(range: DateRange) {
  const { start, end } = normalizeRange(range, 7);
  const reports = await prisma.dayEndReport.findMany({
    where: {
      reportDate: {
        gte: start.toDate(),
        lte: end.toDate(),
      },
    },
    include: {
      lines: {
        include: { item: true },
      },
    },
    orderBy: { reportDate: "desc" },
  });

  const totalSales = reports.reduce((sum, r) => sum + Number(r.totalSalesAmount ?? 0), 0);
  const totalUnits = reports.reduce((sum, r) => sum + (r.totalUnitsSold ?? 0), 0);

  const lineMap = new Map<number, { itemId: number; name: string; units: number; revenue: number }>();
  for (const report of reports) {
    for (const line of report.lines) {
      const existing =
        lineMap.get(line.itemId) ?? { itemId: line.itemId, name: line.item.name, units: 0, revenue: 0 };
      existing.units += line.quantitySoldUnits;
      existing.revenue += Number(line.lineRevenue);
      lineMap.set(line.itemId, existing);
    }
  }

  const topItems = Array.from(lineMap.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  const latestReport = await prisma.dayEndReport.findFirst({
    orderBy: { reportDate: "desc" },
    include: { lines: { include: { item: true } } },
  });

  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  const defaultThreshold = settings?.defaultLowStockThreshold ?? 10;
  const items = await prisma.item.findMany({ where: { isActive: true } });
  const lowStockItems = items.filter((item) => {
    const threshold = item.reorderLevel ?? defaultThreshold;
    return item.currentStockUnits < threshold;
  });

  return {
    totalSales,
    totalUnits,
    reports,
    topItems,
    latestReport,
    settings,
    lowStockItems,
  };
}

export async function getSalesTimeSeries(
  params: DateRange & { metric?: "revenue" | "units"; channel?: SalesChannel | "ALL" },
) {
  const { start, end } = normalizeRange(params, 14);
  const { channel } = params;
  const lines = await prisma.dayEndReportLine.findMany({
    where: {
      report: {
        reportDate: {
          gte: start.toDate(),
          lte: end.toDate(),
        },
      },
      ...(channel && channel !== "ALL" ? { channel } : {}),
    },
    include: { report: true },
    orderBy: { report: { reportDate: "asc" } },
  });

  const metric = params.metric ?? "revenue";
  const seriesMap = new Map<string, { date: string; value: number }>();
  for (const line of lines) {
    const dateKey = dayjs(line.report.reportDate).format("YYYY-MM-DD");
    const value = metric === "revenue" ? Number(line.lineRevenue) : line.quantitySoldUnits;
    const entry = seriesMap.get(dateKey) ?? { date: dateKey, value: 0 };
    entry.value += value;
    seriesMap.set(dateKey, entry);
  }

  return {
    series: Array.from(seriesMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    metric,
  };
}

export async function getTopItems(range: DateRange & { limit?: number; sort?: "revenue" | "units" }) {
  const { start, end } = normalizeRange(range, 30);
  const lines = await prisma.dayEndReportLine.findMany({
    where: {
      report: {
        reportDate: {
          gte: start.toDate(),
          lte: end.toDate(),
        },
      },
    },
    include: { item: true },
  });

  const map = new Map<
    number,
    { itemId: number; itemName: string; units: number; revenue: number; currentStock: number }
  >();
  for (const line of lines) {
    const existing =
      map.get(line.itemId) ??
      {
        itemId: line.itemId,
        itemName: line.item.name,
        units: 0,
        revenue: 0,
        currentStock: line.item.currentStockUnits,
      };
    existing.units += line.quantitySoldUnits;
    existing.revenue += Number(line.lineRevenue);
    existing.currentStock = line.item.currentStockUnits;
    map.set(line.itemId, existing);
  }

  const sortBy = range.sort ?? "units";
  const top = Array.from(map.values())
    .sort((a, b) => (sortBy === "units" ? b.units - a.units : b.revenue - a.revenue))
    .slice(0, range.limit ?? 10);

  return { top };
}

export async function getProductSalesSummary(range: DateRange) {
  const { start, end } = normalizeRange(range, 30);
  const lines = await prisma.dayEndReportLine.findMany({
    where: {
      report: {
        reportDate: {
          gte: start.toDate(),
          lte: end.toDate(),
        },
      },
    },
    include: { item: true },
  });

  const map = new Map<
    number,
    {
      itemId: number;
      sku: string;
      itemName: string;
      brand: string | null;
      category: string | null;
      units: number;
      revenue: number;
    }
  >();

  for (const line of lines) {
    const existing =
      map.get(line.itemId) ??
      {
        itemId: line.itemId,
        sku: line.item.sku,
        itemName: line.item.name,
        brand: line.item.brand ?? null,
        category: line.item.category ?? null,
        units: 0,
        revenue: 0,
      };
    existing.units += line.quantitySoldUnits;
    existing.revenue += Number(line.lineRevenue);
    map.set(line.itemId, existing);
  }

  const products = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  const summary = products.reduce(
    (acc, product) => {
      acc.totalRevenue += product.revenue;
      acc.totalUnits += product.units;
      return acc;
    },
    { totalRevenue: 0, totalUnits: 0 },
  );

  return { products, summary };
}

export async function getVelocity(range: DateRange = {}) {
  const { start, end } = normalizeRange(range, 30);
  const days = end.diff(start, "day") || 1;
  const lines = await prisma.dayEndReportLine.findMany({
    where: {
      report: {
        reportDate: {
          gte: start.toDate(),
          lte: end.toDate(),
        },
      },
    },
    include: { item: true },
  });

  const map = new Map<
    number,
    {
      itemId: number;
      itemName: string;
      totalUnits: number;
      avgPerDay: number;
      currentStock: number;
    }
  >();

  for (const line of lines) {
    const existing =
      map.get(line.itemId) ??
      {
        itemId: line.itemId,
        itemName: line.item.name,
        totalUnits: 0,
        avgPerDay: 0,
        currentStock: line.item.currentStockUnits,
      };
    existing.totalUnits += line.quantitySoldUnits;
    existing.avgPerDay = existing.totalUnits / days;
    existing.currentStock = line.item.currentStockUnits;
    map.set(line.itemId, existing);
  }

  const velocity = Array.from(map.values()).map((entry) => ({
    ...entry,
    daysOfStockLeft: entry.avgPerDay ? entry.currentStock / entry.avgPerDay : null,
  }));

  return { velocity };
}

export async function getDailyPerformance(range: DateRange) {
  const { start, end } = normalizeRange(range, 30);
  const lines = await prisma.dayEndReportLine.findMany({
    where: {
      report: {
        reportDate: {
          gte: start.toDate(),
          lte: end.toDate(),
        },
      },
    },
    include: { report: true },
    orderBy: { report: { reportDate: "asc" } },
  });

  const dayMap = new Map<
    string,
    {
      date: string;
      revenue: number;
      units: number;
      retailRevenue: number;
      beltRevenue: number;
    }
  >();

  for (const line of lines) {
    const dateKey = dayjs(line.report.reportDate).format("YYYY-MM-DD");
    const entry =
      dayMap.get(dateKey) ?? {
        date: dateKey,
        revenue: 0,
        units: 0,
        retailRevenue: 0,
        beltRevenue: 0,
      };
    const revenue = Number(line.lineRevenue);
    entry.revenue += revenue;
    entry.units += line.quantitySoldUnits;
    if (line.channel === "RETAIL") {
      entry.retailRevenue += revenue;
    } else {
      entry.beltRevenue += revenue;
    }
    dayMap.set(dateKey, entry);
  }

  let cursor = start.clone();
  const endBoundary = end.clone();
  while (cursor.isBefore(endBoundary) || cursor.isSame(endBoundary, "day")) {
    const key = cursor.format("YYYY-MM-DD");
    if (!dayMap.has(key)) {
      dayMap.set(key, {
        date: key,
        revenue: 0,
        units: 0,
        retailRevenue: 0,
        beltRevenue: 0,
      });
    }
    cursor = cursor.add(1, "day");
  }

  const daily = Array.from(dayMap.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totals = daily.reduce(
    (acc, day) => {
      acc.totalRevenue += day.revenue;
      acc.totalUnits += day.units;
      acc.retailRevenue += day.retailRevenue;
      acc.beltRevenue += day.beltRevenue;
      return acc;
    },
    { totalRevenue: 0, totalUnits: 0, retailRevenue: 0, beltRevenue: 0 },
  );

  return {
    daily,
    channelMix: {
      retailRevenue: totals.retailRevenue,
      beltRevenue: totals.beltRevenue,
    },
    summary: {
      totalRevenue: totals.totalRevenue,
      totalUnits: totals.totalUnits,
    },
  };
}

export async function getDailyTopProducts(
  params: DateRange & { limit?: number; sort?: "revenue" | "units" } = {},
) {
  const { start, end } = normalizeRange(params, 30);
  const lines = await prisma.dayEndReportLine.findMany({
    where: {
      report: {
        reportDate: {
          gte: start.toDate(),
          lte: end.toDate(),
        },
      },
    },
    include: { report: true, item: true },
    orderBy: { report: { reportDate: "asc" } },
  });

  const dayMap = new Map<
    string,
    Map<
      number,
      {
        itemId: number;
        itemName: string;
        units: number;
        revenue: number;
      }
    >
  >();

  for (const line of lines) {
    const dateKey = dayjs(line.report.reportDate).format("YYYY-MM-DD");
    const perDay = dayMap.get(dateKey) ?? new Map();
    const existing =
      perDay.get(line.itemId) ??
      {
        itemId: line.itemId,
        itemName: line.item.name,
        units: 0,
        revenue: 0,
      };
    existing.units += line.quantitySoldUnits;
    existing.revenue += Number(line.lineRevenue);
    perDay.set(line.itemId, existing);
    dayMap.set(dateKey, perDay);
  }

  let cursor = start.clone();
  const boundary = end.clone();
  while (cursor.isBefore(boundary) || cursor.isSame(boundary, "day")) {
    const key = cursor.format("YYYY-MM-DD");
    if (!dayMap.has(key)) {
      dayMap.set(key, new Map());
    }
    cursor = cursor.add(1, "day");
  }

  const limit = params.limit ?? 3;
  const sortBy = params.sort ?? "revenue";
  const days = Array.from(dayMap.entries())
    .map(([date, itemsMap]) => ({
      date,
      topItems: Array.from(itemsMap.values())
        .sort((a, b) => (sortBy === "revenue" ? b.revenue - a.revenue : b.units - a.units))
        .slice(0, limit),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return { days };
}

function normalizeRange(range: DateRange, defaultDays: number) {
  const end = range.endDate ? dayjs(range.endDate) : dayjs();
  const start = range.startDate ? dayjs(range.startDate) : end.subtract(defaultDays - 1, "day");
  return { start: start.startOf("day"), end: end.endOf("day") };
}
