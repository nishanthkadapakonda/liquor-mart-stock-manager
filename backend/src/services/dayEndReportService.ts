import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { SalesChannel } from "../types/domain";
import { parseLocalDate, formatLocalDate } from "../utils/dateUtils";

// Helper function to round prices to 4 decimal places without floating-point errors
function roundPrice(value: number): number {
  // Use toFixed to avoid floating-point precision issues, then parse back
  return Number(Number(value).toFixed(4));
}

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
  costPriceAtSale: number;              // Cost per unit (item cost only, no tax/misc)
  lineCost: number;                      // Line cost (item cost only)
  lineProfit: number;                    // Gross profit (revenue - item cost)
}

export async function previewDayEndReport(input: DayEndReportInput, editingReportId?: number) {
  if (input.lines.length === 0) {
    throw new Error("At least one line is required");
  }
  const beltMarkup = await resolveBeltMarkup(input);
  
  // If editing an existing report, calculate stock being restored
  let stockBeingRestored: Map<number, number> | undefined;
  if (editingReportId) {
    const existing = await prisma.dayEndReport.findUnique({
      where: { id: editingReportId },
      include: { lines: true },
    });
    if (existing) {
      stockBeingRestored = new Map();
      for (const line of existing.lines) {
        stockBeingRestored.set(
          line.itemId,
          (stockBeingRestored.get(line.itemId) ?? 0) + line.quantitySoldUnits
        );
      }
    }
  }
  
  const prepared = await prepareLines(input, beltMarkup, undefined, stockBeingRestored);
  const shortages = prepared.shortages;
  const summary = summarize(prepared.lines);
  return { ...summary, shortages, beltMarkupRupees: beltMarkup };
}

export async function createDayEndReport(input: DayEndReportInput) {
  if (input.lines.length === 0) {
    throw new Error("At least one line is required");
  }

  // Check if a report already exists for this date
  const reportDateValue = parseLocalDate(input.reportDate);
  const existingReport = await prisma.dayEndReport.findUnique({
    where: { reportDate: reportDateValue },
  });
  if (existingReport) {
    throw new Error(
      `A day-end report already exists for ${formatLocalDate(reportDateValue)}. Please edit the existing report instead.`
    );
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
    
    // Calculate net profit by subtracting purchase-level tax/misc proportionally
    const reportDateValue = parseLocalDate(input.reportDate);
    const purchasesUpToDate = await tx.purchase.findMany({
      where: {
        purchaseDate: {
          lte: reportDateValue,
        },
      },
      include: {
        lineItems: true,
      },
    });
    
    // Calculate total item costs and total tax/misc from all purchases
    let totalPurchaseItemCosts = 0;
    let totalPurchaseTaxMisc = 0;
    for (const purchase of purchasesUpToDate) {
      const purchaseItemCost = purchase.lineItems.reduce((sum, line) => 
        sum + (Number(line.unitCostPrice) * line.quantityUnits), 0
      );
      totalPurchaseItemCosts += purchaseItemCost;
      totalPurchaseTaxMisc += Number(purchase.taxAmount ?? 0) + Number(purchase.miscellaneousCharges ?? 0);
    }
    
    // Calculate proportional share: (item costs in this report) / (total item costs from purchases)
    const taxMiscRatio = totalPurchaseItemCosts > 0 ? summary.totalCost / totalPurchaseItemCosts : 0;
    const allocatedTaxMisc = totalPurchaseTaxMisc * taxMiscRatio;
    
    // Net profit = gross profit - proportional share of purchase tax/misc
    const totalNetProfit = summary.totalProfit - allocatedTaxMisc;
    const roundedNetProfit = roundPrice(totalNetProfit);
    
    const report = await tx.dayEndReport.create({
      data: {
        reportDate: parseLocalDate(input.reportDate),
        beltMarkupRupees: new Prisma.Decimal(roundPrice(beltMarkup)),
        totalSalesAmount: new Prisma.Decimal(roundPrice(summary.totalRevenue)),
        totalUnitsSold: summary.totalUnits,
        retailRevenue: new Prisma.Decimal(roundPrice(summary.retailRevenue)),
        beltRevenue: new Prisma.Decimal(roundPrice(summary.beltRevenue)),
        totalCost: new Prisma.Decimal(roundPrice(summary.totalCost)),
        totalProfit: new Prisma.Decimal(roundPrice(summary.totalProfit)),
        totalNetProfit: new Prisma.Decimal(roundedNetProfit),
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
          mrpPrice: new Prisma.Decimal(roundPrice(line.mrpPrice)),
          sellingPricePerUnit: new Prisma.Decimal(roundPrice(line.sellingPricePerUnit)),
          lineRevenue: new Prisma.Decimal(roundPrice(line.lineRevenue)),
          costPriceAtSale: new Prisma.Decimal(roundPrice(line.costPriceAtSale)),
          lineCost: new Prisma.Decimal(roundPrice(line.lineCost)),
          lineProfit: new Prisma.Decimal(roundPrice(line.lineProfit)),
          // Line net profit: proportional share of purchase tax/misc
          lineNetProfit: new Prisma.Decimal(roundPrice(line.lineProfit - (allocatedTaxMisc * (line.lineCost / summary.totalCost || 0)))),
        },
      });
    }

    for (const agg of prepared.aggregated.values()) {
      // Get current item to calculate new inventory value
      const item = await tx.item.findUnique({ where: { id: agg.itemId } });
      if (!item) {
        throw new Error(`Item not found: ${agg.itemName}`);
      }
      
      const currentStock = item.currentStockUnits;
      const newStock = currentStock - agg.quantity;
      
      // Final safeguard: prevent negative stock
      if (newStock < 0) {
        throw new Error(
          `Insufficient stock for ${agg.itemName}: need ${agg.quantity}, only ${currentStock} available`
        );
      }
      
      const weightedAvg = Number(item.weightedAvgCostPrice ?? 0);
      const newTotalValue = weightedAvg * newStock;
      
      await tx.item.update({
        where: { id: agg.itemId },
        data: {
          currentStockUnits: newStock,
          totalInventoryValue: newTotalValue > 0 ? new Prisma.Decimal(roundPrice(newTotalValue)) : null,
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

    // Build a map of stock being restored (for accurate availability calculation)
    const stockBeingRestored = new Map<number, number>();
    
    // rollback previous stock impact
    for (const line of existing.lines) {
      const item = await tx.item.findUnique({ where: { id: line.itemId } });
      const weightedAvg = Number(item?.weightedAvgCostPrice ?? 0);
      const newStock = (item?.currentStockUnits ?? 0) + line.quantitySoldUnits;
      const newTotalValue = weightedAvg * newStock;
      
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { increment: line.quantitySoldUnits },
          totalInventoryValue: newTotalValue > 0 ? new Prisma.Decimal(roundPrice(newTotalValue)) : null,
        },
      });
      
      // Track restored stock for availability calculation
      stockBeingRestored.set(
        line.itemId,
        (stockBeingRestored.get(line.itemId) ?? 0) + line.quantitySoldUnits
      );
    }

    await tx.dayEndReportLine.deleteMany({ where: { reportId } });

    // Pass the restored stock info to prepareLines for accurate availability check
    const prepared = await prepareLines(input, beltMarkup, tx, stockBeingRestored);
    if (prepared.shortages.length > 0) {
      throw new Error(
        `Cannot update report. Items with insufficient stock: ${prepared.shortages
          .map((s) => `${s.itemName} (needs ${s.required}, has ${s.available})`)
          .join(", ")}`,
      );
    }

    const summary = summarize(prepared.lines);
    
    // Calculate net profit by subtracting purchase-level tax/misc proportionally
    const reportDateValue = parseLocalDate(input.reportDate);
    const purchasesUpToDate = await tx.purchase.findMany({
      where: {
        purchaseDate: {
          lte: reportDateValue,
        },
      },
      include: {
        lineItems: true,
      },
    });
    
    // Calculate total item costs and total tax/misc from all purchases
    let totalPurchaseItemCosts = 0;
    let totalPurchaseTaxMisc = 0;
    for (const purchase of purchasesUpToDate) {
      const purchaseItemCost = purchase.lineItems.reduce((sum, line) => 
        sum + (Number(line.unitCostPrice) * line.quantityUnits), 0
      );
      totalPurchaseItemCosts += purchaseItemCost;
      totalPurchaseTaxMisc += Number(purchase.taxAmount ?? 0) + Number(purchase.miscellaneousCharges ?? 0);
    }
    
    // Calculate proportional share: (item costs in this report) / (total item costs from purchases)
    const taxMiscRatio = totalPurchaseItemCosts > 0 ? summary.totalCost / totalPurchaseItemCosts : 0;
    const allocatedTaxMisc = totalPurchaseTaxMisc * taxMiscRatio;
    
    // Net profit = gross profit - proportional share of purchase tax/misc
    const totalNetProfit = summary.totalProfit - allocatedTaxMisc;
    const roundedNetProfit = roundPrice(totalNetProfit);
    
    const report = await tx.dayEndReport.update({
      where: { id: reportId },
      data: {
        reportDate: parseLocalDate(input.reportDate),
        beltMarkupRupees: new Prisma.Decimal(roundPrice(beltMarkup)),
        totalSalesAmount: new Prisma.Decimal(roundPrice(summary.totalRevenue)),
        totalUnitsSold: summary.totalUnits,
        retailRevenue: new Prisma.Decimal(roundPrice(summary.retailRevenue)),
        beltRevenue: new Prisma.Decimal(roundPrice(summary.beltRevenue)),
        totalCost: new Prisma.Decimal(roundPrice(summary.totalCost)),
        totalProfit: new Prisma.Decimal(roundPrice(summary.totalProfit)),
        totalNetProfit: new Prisma.Decimal(roundedNetProfit),
        notes: input.notes ?? null,
      },
    });

    for (const line of prepared.lines) {
      // Calculate line-level net profit proportionally
      const lineTaxMiscShare = summary.totalCost > 0 ? (line.lineCost / summary.totalCost) * allocatedTaxMisc : 0;
      const lineNetProfit = line.lineProfit - lineTaxMiscShare;
      
      await tx.dayEndReportLine.create({
        data: {
          reportId,
          itemId: line.itemId,
          channel: line.channel,
          quantitySoldUnits: line.quantitySoldUnits,
          mrpPrice: new Prisma.Decimal(roundPrice(line.mrpPrice)),
          sellingPricePerUnit: new Prisma.Decimal(roundPrice(line.sellingPricePerUnit)),
          lineRevenue: new Prisma.Decimal(roundPrice(line.lineRevenue)),
          costPriceAtSale: new Prisma.Decimal(roundPrice(line.costPriceAtSale)),
          lineCost: new Prisma.Decimal(roundPrice(line.lineCost)),
          lineProfit: new Prisma.Decimal(roundPrice(line.lineProfit)),
          lineNetProfit: new Prisma.Decimal(roundPrice(lineNetProfit)),
        },
      });
    }

    for (const agg of prepared.aggregated.values()) {
      // Get current item to calculate new inventory value
      const item = await tx.item.findUnique({ where: { id: agg.itemId } });
      if (!item) {
        throw new Error(`Item not found: ${agg.itemName}`);
      }
      
      const currentStock = item.currentStockUnits;
      const newStock = currentStock - agg.quantity;
      
      // Final safeguard: prevent negative stock
      if (newStock < 0) {
        throw new Error(
          `Insufficient stock for ${agg.itemName}: need ${agg.quantity}, only ${currentStock} available`
        );
      }
      
      const weightedAvg = Number(item.weightedAvgCostPrice ?? 0);
      const newTotalValue = weightedAvg * newStock;
      
      await tx.item.update({
        where: { id: agg.itemId },
        data: {
          currentStockUnits: newStock,
          totalInventoryValue: newTotalValue > 0 ? new Prisma.Decimal(roundPrice(newTotalValue)) : null,
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
      const item = await tx.item.findUnique({ where: { id: line.itemId } });
      const weightedAvg = Number(item?.weightedAvgCostPrice ?? 0);
      const newStock = (item?.currentStockUnits ?? 0) + line.quantitySoldUnits;
      const newTotalValue = weightedAvg * newStock;
      
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { increment: line.quantitySoldUnits },
          totalInventoryValue: newTotalValue > 0 ? new Prisma.Decimal(roundPrice(newTotalValue)) : null,
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
  stockBeingRestored?: Map<number, number>, // For updates: stock that was restored from previous report
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
    
    // Use weighted average cost for profit calculation (item cost only, no tax/misc)
    const costPriceAtSale = Number(item.weightedAvgCostPrice ?? item.purchaseCostPrice ?? 0);
    const lineCost = quantity * costPriceAtSale;
    const lineProfit = lineRevenue - lineCost;

    prepared.push({
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      channel: line.channel,
      quantitySoldUnits: quantity,
      mrpPrice,
      sellingPricePerUnit,
      lineRevenue,
      costPriceAtSale,
      lineCost,
      lineProfit,
    });

    // Calculate effective available stock:
    // - Start with current stock from DB
    // - Add any stock being restored (for updates)
    const restoredForItem = stockBeingRestored?.get(item.id) ?? 0;
    const effectiveAvailable = item.currentStockUnits + restoredForItem;

    const agg = aggregated.get(item.id) ?? {
      itemId: item.id,
      itemName: item.name,
      quantity: 0,
      available: effectiveAvailable,
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
  let totalCost = 0;                    // Item cost only (no tax/misc)
  let totalProfit = 0;                  // Gross profit (revenue - item cost)

  for (const line of lines) {
    totalRevenue += line.lineRevenue;
    totalUnits += line.quantitySoldUnits;
    totalCost += line.lineCost;
    totalProfit += line.lineProfit;
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
    totalCost,
    totalProfit,
    profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
  };
}
