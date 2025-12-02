import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { SalesChannel } from "../types/domain";

export interface DayEndLineInput {
  itemId?: number;
  sku?: string;
  channel: SalesChannel;
  quantitySoldUnits: number;
  sellingPricePerUnit?: number;
}

export interface DayEndReportInput {
  reportDate: string;
  beltMarkupRupees?: number;
  notes?: string;
  lines: DayEndLineInput[];
}

interface PreparedLine {
  itemId: number;
  itemName: string;
  sku: string;
  channel: SalesChannel;
  quantitySoldUnits: number;
  mrpPrice: number;
  sellingPricePerUnit: number;
  lineRevenue: number;
}

export async function previewDayEndReport(input: DayEndReportInput) {
  if (input.lines.length === 0) {
    throw new Error("At least one line is required");
  }
  const beltMarkup = await resolveBeltMarkup(input);
  const prepared = await prepareLines(input, beltMarkup);
  const shortages = prepared.shortages;
  const summary = summarize(prepared.lines);
  return { ...summary, shortages, beltMarkupRupees: beltMarkup };
}

export async function createDayEndReport(input: DayEndReportInput) {
  if (input.lines.length === 0) {
    throw new Error("At least one line is required");
  }

  const beltMarkup = await resolveBeltMarkup(input);

  return prisma.$transaction(async (tx) => {
    const prepared = await prepareLines(input, beltMarkup, tx);
    if (prepared.shortages.length > 0) {
      throw new Error(
        `Cannot create report. Items with insufficient stock: ${prepared.shortages
          .map((s) => `${s.itemName} (needs ${s.required}, has ${s.available})`)
          .join(", ")}`,
      );
    }

    const summary = summarize(prepared.lines);
    const report = await tx.dayEndReport.create({
      data: {
        reportDate: new Date(input.reportDate),
        beltMarkupRupees: new Prisma.Decimal(beltMarkup),
        totalSalesAmount: new Prisma.Decimal(summary.totalRevenue),
        totalUnitsSold: summary.totalUnits,
        retailRevenue: new Prisma.Decimal(summary.retailRevenue),
        beltRevenue: new Prisma.Decimal(summary.beltRevenue),
        notes: input.notes ?? null,
      },
    });

    for (const line of prepared.lines) {
      await tx.dayEndReportLine.create({
        data: {
          reportId: report.id,
          itemId: line.itemId,
          channel: line.channel,
          quantitySoldUnits: line.quantitySoldUnits,
          mrpPrice: new Prisma.Decimal(line.mrpPrice),
          sellingPricePerUnit: new Prisma.Decimal(line.sellingPricePerUnit),
          lineRevenue: new Prisma.Decimal(line.lineRevenue),
        },
      });
    }

    for (const agg of prepared.aggregated.values()) {
      await tx.item.update({
        where: { id: agg.itemId },
        data: {
          currentStockUnits: { decrement: agg.quantity },
        },
      });
    }

    return {
      report,
      summary,
    };
  });
}

export async function updateDayEndReport(reportId: number, input: DayEndReportInput) {
  if (input.lines.length === 0) {
    throw new Error("At least one line is required");
  }

  const beltMarkup = await resolveBeltMarkup(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.dayEndReport.findUnique({
      where: { id: reportId },
      include: { lines: true },
    });
    if (!existing) {
      throw new Error("Report not found");
    }

    // rollback previous stock impact
    for (const line of existing.lines) {
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { increment: line.quantitySoldUnits },
        },
      });
    }

    await tx.dayEndReportLine.deleteMany({ where: { reportId } });

    const prepared = await prepareLines(input, beltMarkup, tx);
    if (prepared.shortages.length > 0) {
      throw new Error(
        `Cannot update report. Items with insufficient stock: ${prepared.shortages
          .map((s) => `${s.itemName} (needs ${s.required}, has ${s.available})`)
          .join(", ")}`,
      );
    }

    const summary = summarize(prepared.lines);
    const report = await tx.dayEndReport.update({
      where: { id: reportId },
      data: {
        reportDate: new Date(input.reportDate),
        beltMarkupRupees: new Prisma.Decimal(beltMarkup),
        totalSalesAmount: new Prisma.Decimal(summary.totalRevenue),
        totalUnitsSold: summary.totalUnits,
        retailRevenue: new Prisma.Decimal(summary.retailRevenue),
        beltRevenue: new Prisma.Decimal(summary.beltRevenue),
        notes: input.notes ?? null,
      },
    });

    for (const line of prepared.lines) {
      await tx.dayEndReportLine.create({
        data: {
          reportId,
          itemId: line.itemId,
          channel: line.channel,
          quantitySoldUnits: line.quantitySoldUnits,
          mrpPrice: new Prisma.Decimal(line.mrpPrice),
          sellingPricePerUnit: new Prisma.Decimal(line.sellingPricePerUnit),
          lineRevenue: new Prisma.Decimal(line.lineRevenue),
        },
      });
    }

    for (const agg of prepared.aggregated.values()) {
      await tx.item.update({
        where: { id: agg.itemId },
        data: {
          currentStockUnits: { decrement: agg.quantity },
        },
      });
    }

    return {
      report,
      summary,
    };
  });
}

export async function deleteDayEndReport(reportId: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dayEndReport.findUnique({
      where: { id: reportId },
      include: { lines: true },
    });
    if (!existing) {
      throw new Error("Report not found");
    }

    for (const line of existing.lines) {
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { increment: line.quantitySoldUnits },
        },
      });
    }

    await tx.dayEndReport.delete({ where: { id: reportId } });
  });
}

async function resolveBeltMarkup(input: DayEndReportInput) {
  if (typeof input.beltMarkupRupees === "number") {
    return input.beltMarkupRupees;
  }
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  return settings?.defaultBeltMarkupRupees ? Number(settings.defaultBeltMarkupRupees) : 20;
}

async function prepareLines(
  input: DayEndReportInput,
  beltMarkup: number,
  tx?: Prisma.TransactionClient,
): Promise<{
  lines: PreparedLine[];
  aggregated: Map<
    number,
    {
      itemId: number;
      itemName: string;
      quantity: number;
      available: number;
    }
  >;
  shortages: {
    itemId: number;
    itemName: string;
    required: number;
    available: number;
  }[];
}> {
  const prepared: PreparedLine[] = [];
  const aggregated = new Map<
    number,
    { itemId: number; itemName: string; quantity: number; available: number }
  >();

  const client = tx ?? prisma;

  for (const line of input.lines) {
    const item = await resolveExistingItem(client, line);
    const mrpPrice = Number(item.mrpPrice);
    const sellingPricePerUnit =
      typeof line.sellingPricePerUnit === "number"
        ? line.sellingPricePerUnit
        : line.channel === "RETAIL"
          ? mrpPrice
          : mrpPrice + beltMarkup;
    const quantity = line.quantitySoldUnits;
    const lineRevenue = quantity * sellingPricePerUnit;

    prepared.push({
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      channel: line.channel,
      quantitySoldUnits: quantity,
      mrpPrice,
      sellingPricePerUnit,
      lineRevenue,
    });

    const agg = aggregated.get(item.id) ?? {
      itemId: item.id,
      itemName: item.name,
      quantity: 0,
      available: item.currentStockUnits,
    };
    agg.quantity += quantity;
    aggregated.set(item.id, agg);
  }

  const shortages: { itemId: number; itemName: string; required: number; available: number }[] = [];
  for (const agg of aggregated.values()) {
    if (agg.quantity > agg.available) {
      shortages.push({
        itemId: agg.itemId,
        itemName: agg.itemName,
        required: agg.quantity,
        available: agg.available,
      });
    }
  }

  return { lines: prepared, aggregated, shortages };
}

async function resolveExistingItem(tx: Prisma.TransactionClient | typeof prisma, line: DayEndLineInput) {
  if (line.itemId) {
    const item = await tx.item.findUnique({ where: { id: line.itemId } });
    if (item) {
      return item;
    }
  }

  if (line.sku) {
    const item = await tx.item.findUnique({ where: { sku: line.sku } });
    if (item) {
      return item;
    }
  }

  throw new Error("Unknown item in sales line");
}

function summarize(lines: PreparedLine[]) {
  let totalRevenue = 0;
  let totalUnits = 0;
  let retailRevenue = 0;
  let beltRevenue = 0;

  for (const line of lines) {
    totalRevenue += line.lineRevenue;
    totalUnits += line.quantitySoldUnits;
    if (line.channel === "RETAIL") {
      retailRevenue += line.lineRevenue;
    } else {
      beltRevenue += line.lineRevenue;
    }
  }

  return {
    totalRevenue,
    totalUnits,
    retailRevenue,
    beltRevenue,
  };
}
