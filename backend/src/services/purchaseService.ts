import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export interface PurchaseLineInput {
  itemId?: number;
  sku?: string;
  name?: string;
  brand?: string;
  brandNumber?: string;
  productType?: string;
  sizeCode?: string;
  packType?: string;
  packSizeLabel?: string;
  unitsPerPack?: number;
  casesQuantity?: number;
  category?: string;
  volumeMl?: number;
  mrpPrice: number;
  unitCostPrice: number;
  caseCostPrice?: number;
  lineTotalPrice?: number;
  quantityUnits: number;
  reorderLevel?: number;
  isActive?: boolean;
}

export interface PurchaseInput {
  purchaseDate: string;
  supplierName?: string;
  notes?: string;
  taxAmount?: number;
  miscellaneousCharges?: number;
  lineItems: PurchaseLineInput[];
  allowItemCreation?: boolean;
}

export async function createPurchase(input: PurchaseInput) {
  if (input.lineItems.length === 0) {
    throw new Error("At least one line item is required");
  }

  const purchaseDateValue = new Date(input.purchaseDate);

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        purchaseDate: purchaseDateValue,
        supplierName: input.supplierName ?? null,
        notes: input.notes ?? null,
        taxAmount: input.taxAmount !== undefined ? new Prisma.Decimal(Math.round(input.taxAmount * 100) / 100) : null,
        miscellaneousCharges: input.miscellaneousCharges !== undefined ? new Prisma.Decimal(Math.round(input.miscellaneousCharges * 100) / 100) : null,
      },
    });

    // Calculate total base purchase value for proportional allocation
    const totalBaseValue = input.lineItems.reduce(
      (sum, line) => sum + (line.unitCostPrice * line.quantityUnits),
      0
    );
    const taxAmount = input.taxAmount ?? 0;
    const miscCharges = input.miscellaneousCharges ?? 0;
    const totalCharges = taxAmount + miscCharges;

    let totalQuantity = 0;
    const priceUpdateCache = new Map<number, boolean>();
    for (const line of input.lineItems) {
      const { unitsPerCase, casesQuantity, caseCostPrice, lineTotalPrice } = computeCaseStats(line);
      const itemId = await resolveItem(tx, line, input.allowItemCreation ?? true);
      const shouldUpdatePricing =
        priceUpdateCache.get(itemId) ??
        (await shouldUpdateItemPricing(tx, itemId, purchaseDateValue));
      priceUpdateCache.set(itemId, shouldUpdatePricing);

      // Calculate proportional allocation of tax and misc charges
      const lineBaseValue = line.unitCostPrice * line.quantityUnits;
      const allocationRatio = totalBaseValue > 0 ? lineBaseValue / totalBaseValue : 0;
      const allocatedTax = Math.round((taxAmount * allocationRatio) * 100) / 100;
      const allocatedMisc = Math.round((miscCharges * allocationRatio) * 100) / 100;
      const lineTotalWithCharges = lineBaseValue + allocatedTax + allocatedMisc;
      const unitTotalCost = line.quantityUnits > 0 ? lineTotalWithCharges / line.quantityUnits : line.unitCostPrice;
      const roundedUnitTotalCost = Math.round(unitTotalCost * 100) / 100;

      await tx.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId,
          quantityUnits: line.quantityUnits,
          casesQuantity: casesQuantity ?? null,
          unitsPerCase: unitsPerCase ?? null,
          packType: line.packType ?? null,
          packSizeLabel: line.packSizeLabel ?? null,
          brandNumber: line.brandNumber ?? null,
          productType: line.productType ?? null,
          sizeCode: line.sizeCode ?? null,
          unitCostPrice: new Prisma.Decimal(Math.round(line.unitCostPrice * 100) / 100),
          unitTotalCostPrice: new Prisma.Decimal(roundedUnitTotalCost),
          caseCostPrice: caseCostPrice !== undefined ? new Prisma.Decimal(Math.round(caseCostPrice * 100) / 100) : null,
          lineTotalPrice: lineTotalPrice !== undefined ? new Prisma.Decimal(Math.round(lineTotalPrice * 100) / 100) : null,
          lineTotalCostWithCharges: new Prisma.Decimal(Math.round(lineTotalWithCharges * 100) / 100),
          allocatedTaxAmount: allocatedTax > 0 ? new Prisma.Decimal(allocatedTax) : null,
          allocatedMiscCharges: allocatedMisc > 0 ? new Prisma.Decimal(allocatedMisc) : null,
          mrpPriceAtPurchase: new Prisma.Decimal(Math.round(line.mrpPrice * 100) / 100),
        },
      });

      // Calculate weighted average cost (both base and with charges)
      const currentItem = await tx.item.findUnique({ where: { id: itemId } });
      const oldStock = currentItem?.currentStockUnits ?? 0;
      
      // Base cost (without tax/misc) - for gross profit
      const oldTotalValue = Number(currentItem?.totalInventoryValue ?? 0) || 
        (oldStock * Number(currentItem?.weightedAvgCostPrice ?? currentItem?.purchaseCostPrice ?? 0));
      const newPurchaseValue = line.unitCostPrice * line.quantityUnits;
      const newStock = oldStock + line.quantityUnits;
      const newWeightedAvg = newStock > 0 ? (oldTotalValue + newPurchaseValue) / newStock : line.unitCostPrice;
      const roundedWeightedAvg = Math.round(newWeightedAvg * 100) / 100;
      const newTotalValue = roundedWeightedAvg * newStock;
      const roundedTotalValue = Math.round(newTotalValue * 100) / 100;

      // Total cost (with tax/misc) - for net profit
      const oldTotalValueWithCharges = Number(currentItem?.totalInventoryValueWithCharges ?? 0) ||
        (oldStock * Number(currentItem?.weightedAvgTotalCostPrice ?? currentItem?.purchaseCostPrice ?? 0));
      const newPurchaseValueWithCharges = unitTotalCost * line.quantityUnits;
      const newWeightedAvgWithCharges = newStock > 0 ? (oldTotalValueWithCharges + newPurchaseValueWithCharges) / newStock : unitTotalCost;
      const roundedWeightedAvgWithCharges = Math.round(newWeightedAvgWithCharges * 100) / 100;
      const newTotalValueWithCharges = roundedWeightedAvgWithCharges * newStock;
      const roundedTotalValueWithCharges = Math.round(newTotalValueWithCharges * 100) / 100;

      const itemUpdateData: Prisma.ItemUpdateInput = {
        currentStockUnits: { increment: line.quantityUnits },
        isActive: true, // Reactivate item when it receives new stock
        weightedAvgCostPrice: new Prisma.Decimal(roundedWeightedAvg),
        weightedAvgTotalCostPrice: new Prisma.Decimal(roundedWeightedAvgWithCharges),
        totalInventoryValue: new Prisma.Decimal(roundedTotalValue),
        totalInventoryValueWithCharges: new Prisma.Decimal(roundedTotalValueWithCharges),
      };
      applyItemMetadata(itemUpdateData, line);
      if (shouldUpdatePricing) {
        // Always update cost price from latest purchase (rounded to 2 decimals)
        const roundedCostPrice = Math.round(line.unitCostPrice * 100) / 100;
        itemUpdateData.purchaseCostPrice = new Prisma.Decimal(roundedCostPrice);
        
        // Only update MRP if explicitly provided (different from cost price)
        // If mrpPrice equals unitCostPrice, it means no MRP was in the import
        const explicitMrpProvided = Math.abs(line.mrpPrice - line.unitCostPrice) > 0.01;
        if (explicitMrpProvided) {
          const roundedMrp = Math.round(line.mrpPrice * 100) / 100;
          itemUpdateData.mrpPrice = new Prisma.Decimal(roundedMrp);
        }
      }
      await tx.item.update({
        where: { id: itemId },
        data: itemUpdateData,
      });
      totalQuantity += line.quantityUnits;
    }

    return {
      purchase,
      totals: {
        totalQuantity,
        lineCount: input.lineItems.length,
      },
    };
  });
}

export async function updatePurchase(purchaseId: number, input: PurchaseInput) {
  if (input.lineItems.length === 0) {
    throw new Error("At least one line item is required");
  }

  const purchaseDateValue = new Date(input.purchaseDate);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { lineItems: true },
    });

    if (!existing) {
      throw new Error("Purchase not found");
    }

    const affectedItemIds = new Set<number>();

    for (const line of existing.lineItems) {
      affectedItemIds.add(line.itemId);
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { decrement: line.quantityUnits },
        },
      });
    }

    await tx.purchaseLineItem.deleteMany({ where: { purchaseId } });

    const purchase = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        purchaseDate: purchaseDateValue,
        supplierName: input.supplierName ?? null,
        notes: input.notes ?? null,
        taxAmount: input.taxAmount !== undefined ? new Prisma.Decimal(Math.round(input.taxAmount * 100) / 100) : null,
        miscellaneousCharges: input.miscellaneousCharges !== undefined ? new Prisma.Decimal(Math.round(input.miscellaneousCharges * 100) / 100) : null,
      },
    });

    // Calculate total base purchase value for proportional allocation
    const totalBaseValue = input.lineItems.reduce(
      (sum, line) => sum + (line.unitCostPrice * line.quantityUnits),
      0
    );
    const taxAmount = input.taxAmount ?? 0;
    const miscCharges = input.miscellaneousCharges ?? 0;

    let totalQuantity = 0;
    const priceUpdateCache = new Map<number, boolean>();
    for (const line of input.lineItems) {
      const { unitsPerCase, casesQuantity, caseCostPrice, lineTotalPrice } = computeCaseStats(line);
      const itemId = await resolveItem(tx, line, input.allowItemCreation ?? true);
      affectedItemIds.add(itemId);
      const shouldUpdatePricing =
        priceUpdateCache.get(itemId) ??
        (await shouldUpdateItemPricing(tx, itemId, purchaseDateValue));
      priceUpdateCache.set(itemId, shouldUpdatePricing);

      // Calculate proportional allocation of tax and misc charges
      const lineBaseValue = line.unitCostPrice * line.quantityUnits;
      const allocationRatio = totalBaseValue > 0 ? lineBaseValue / totalBaseValue : 0;
      const allocatedTax = Math.round((taxAmount * allocationRatio) * 100) / 100;
      const allocatedMisc = Math.round((miscCharges * allocationRatio) * 100) / 100;
      const lineTotalWithCharges = lineBaseValue + allocatedTax + allocatedMisc;
      const unitTotalCost = line.quantityUnits > 0 ? lineTotalWithCharges / line.quantityUnits : line.unitCostPrice;
      const roundedUnitTotalCost = Math.round(unitTotalCost * 100) / 100;

      await tx.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId,
          quantityUnits: line.quantityUnits,
          casesQuantity: casesQuantity ?? null,
          unitsPerCase: unitsPerCase ?? null,
          packType: line.packType ?? null,
          packSizeLabel: line.packSizeLabel ?? null,
          brandNumber: line.brandNumber ?? null,
          productType: line.productType ?? null,
          sizeCode: line.sizeCode ?? null,
          unitCostPrice: new Prisma.Decimal(Math.round(line.unitCostPrice * 100) / 100),
          unitTotalCostPrice: new Prisma.Decimal(roundedUnitTotalCost),
          caseCostPrice: caseCostPrice !== undefined ? new Prisma.Decimal(Math.round(caseCostPrice * 100) / 100) : null,
          lineTotalPrice: lineTotalPrice !== undefined ? new Prisma.Decimal(Math.round(lineTotalPrice * 100) / 100) : null,
          lineTotalCostWithCharges: new Prisma.Decimal(Math.round(lineTotalWithCharges * 100) / 100),
          allocatedTaxAmount: allocatedTax > 0 ? new Prisma.Decimal(allocatedTax) : null,
          allocatedMiscCharges: allocatedMisc > 0 ? new Prisma.Decimal(allocatedMisc) : null,
          mrpPriceAtPurchase: new Prisma.Decimal(Math.round(line.mrpPrice * 100) / 100),
        },
      });

      // Calculate weighted average cost (both base and with charges)
      const currentItem = await tx.item.findUnique({ where: { id: itemId } });
      const oldStock = currentItem?.currentStockUnits ?? 0;
      
      // Base cost (without tax/misc) - for gross profit
      const oldTotalValue = Number(currentItem?.totalInventoryValue ?? 0) || 
        (oldStock * Number(currentItem?.weightedAvgCostPrice ?? currentItem?.purchaseCostPrice ?? 0));
      const newPurchaseValue = line.unitCostPrice * line.quantityUnits;
      const newStock = oldStock + line.quantityUnits;
      const newWeightedAvg = newStock > 0 ? (oldTotalValue + newPurchaseValue) / newStock : line.unitCostPrice;
      const roundedWeightedAvg = Math.round(newWeightedAvg * 100) / 100;
      const newTotalValue = roundedWeightedAvg * newStock;
      const roundedTotalValue = Math.round(newTotalValue * 100) / 100;

      // Total cost (with tax/misc) - for net profit
      const oldTotalValueWithCharges = Number(currentItem?.totalInventoryValueWithCharges ?? 0) ||
        (oldStock * Number(currentItem?.weightedAvgTotalCostPrice ?? currentItem?.purchaseCostPrice ?? 0));
      const newPurchaseValueWithCharges = unitTotalCost * line.quantityUnits;
      const newWeightedAvgWithCharges = newStock > 0 ? (oldTotalValueWithCharges + newPurchaseValueWithCharges) / newStock : unitTotalCost;
      const roundedWeightedAvgWithCharges = Math.round(newWeightedAvgWithCharges * 100) / 100;
      const newTotalValueWithCharges = roundedWeightedAvgWithCharges * newStock;
      const roundedTotalValueWithCharges = Math.round(newTotalValueWithCharges * 100) / 100;

      const itemUpdateData: Prisma.ItemUpdateInput = {
        currentStockUnits: { increment: line.quantityUnits },
        isActive: true, // Reactivate item when it receives new stock
        weightedAvgCostPrice: new Prisma.Decimal(roundedWeightedAvg),
        weightedAvgTotalCostPrice: new Prisma.Decimal(roundedWeightedAvgWithCharges),
        totalInventoryValue: new Prisma.Decimal(roundedTotalValue),
        totalInventoryValueWithCharges: new Prisma.Decimal(roundedTotalValueWithCharges),
      };
      applyItemMetadata(itemUpdateData, line);
      if (shouldUpdatePricing) {
        // Always update cost price from latest purchase (rounded to 2 decimals)
        const roundedCostPrice = Math.round(line.unitCostPrice * 100) / 100;
        itemUpdateData.purchaseCostPrice = new Prisma.Decimal(roundedCostPrice);
        
        // Only update MRP if explicitly provided (different from cost price)
        const explicitMrpProvided = Math.abs(line.mrpPrice - line.unitCostPrice) > 0.01;
        if (explicitMrpProvided) {
          const roundedMrp = Math.round(line.mrpPrice * 100) / 100;
          itemUpdateData.mrpPrice = new Prisma.Decimal(roundedMrp);
        }
      }
      await tx.item.update({
        where: { id: itemId },
        data: itemUpdateData,
      });
      totalQuantity += line.quantityUnits;
    }

    await refreshItemInventoryStats(tx, Array.from(affectedItemIds));

    return {
      purchase,
      totals: {
        totalQuantity,
        lineCount: input.lineItems.length,
      },
    };
  });
}

export async function deletePurchase(purchaseId: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { lineItems: true },
    });

    if (!existing) {
      throw new Error("Purchase not found");
    }

    const affectedItemIds = existing.lineItems.map((line) => line.itemId);

    for (const line of existing.lineItems) {
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { decrement: line.quantityUnits },
        },
      });
    }

    await tx.purchase.delete({ where: { id: purchaseId } });
    await refreshItemInventoryStats(tx, affectedItemIds);
  });
}

async function refreshItemInventoryStats(tx: Prisma.TransactionClient, itemIds: number[]) {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) {
    return;
  }

  for (const itemId of uniqueIds) {
    // Get all purchase lines for this item ordered by date to recalculate weighted avg
    const [purchaseLines, salesSum, adjustmentsSum, latestPurchaseLine] = await Promise.all([
      tx.purchaseLineItem.findMany({
        where: { itemId },
        include: { purchase: true },
        orderBy: { purchase: { purchaseDate: "asc" } },
      }),
      tx.dayEndReportLine.aggregate({
        where: { itemId },
        _sum: { quantitySoldUnits: true },
      }),
      tx.stockAdjustment.aggregate({
        where: { itemId },
        _sum: { adjustmentUnits: true },
      }),
      tx.purchaseLineItem.findFirst({
        where: { itemId },
        include: { purchase: true },
        orderBy: { purchase: { purchaseDate: "desc" } },
      }),
    ]);

    // Recalculate weighted average from all purchases (both base and with charges)
    let runningTotalValue = 0;
    let runningTotalValueWithCharges = 0;
    let runningTotalUnits = 0;
    for (const line of purchaseLines) {
      const purchaseValue = Number(line.unitCostPrice) * line.quantityUnits;
      runningTotalValue += purchaseValue;
      
      // Use unitTotalCostPrice if available (includes allocated tax/misc), otherwise use base cost
      const purchaseValueWithCharges = line.unitTotalCostPrice 
        ? Number(line.unitTotalCostPrice) * line.quantityUnits
        : purchaseValue;
      runningTotalValueWithCharges += purchaseValueWithCharges;
      
      runningTotalUnits += line.quantityUnits;
    }

    const purchaseTotal = runningTotalUnits;
    const salesTotal = Number(salesSum._sum.quantitySoldUnits ?? 0);
    const adjustmentsTotal = Number(adjustmentsSum._sum.adjustmentUnits ?? 0);
    const currentStock = purchaseTotal - salesTotal + adjustmentsTotal;
    
    // Calculate weighted average (base cost, without tax/misc)
    const weightedAvgCost = runningTotalUnits > 0 ? runningTotalValue / runningTotalUnits : 0;
    const roundedWeightedAvg = Math.round(weightedAvgCost * 100) / 100;
    const totalInventoryValue = roundedWeightedAvg * Math.max(currentStock, 0);
    const roundedTotalValue = Math.round(totalInventoryValue * 100) / 100;

    // Calculate weighted average (total cost, with tax/misc)
    const weightedAvgTotalCost = runningTotalUnits > 0 ? runningTotalValueWithCharges / runningTotalUnits : 0;
    const roundedWeightedAvgTotal = Math.round(weightedAvgTotalCost * 100) / 100;
    const totalInventoryValueWithCharges = roundedWeightedAvgTotal * Math.max(currentStock, 0);
    const roundedTotalValueWithCharges = Math.round(totalInventoryValueWithCharges * 100) / 100;

    const itemUpdateData: Prisma.ItemUpdateInput = {
      currentStockUnits: currentStock,
      weightedAvgCostPrice: roundedWeightedAvg > 0 ? new Prisma.Decimal(roundedWeightedAvg) : null,
      weightedAvgTotalCostPrice: roundedWeightedAvgTotal > 0 ? new Prisma.Decimal(roundedWeightedAvgTotal) : null,
      totalInventoryValue: roundedTotalValue > 0 ? new Prisma.Decimal(roundedTotalValue) : null,
      totalInventoryValueWithCharges: roundedTotalValueWithCharges > 0 ? new Prisma.Decimal(roundedTotalValueWithCharges) : null,
    };

    if (latestPurchaseLine) {
      const roundedCostPrice = Math.round(Number(latestPurchaseLine.unitCostPrice) * 100) / 100;
      itemUpdateData.purchaseCostPrice = new Prisma.Decimal(roundedCostPrice);
      if (latestPurchaseLine.mrpPriceAtPurchase !== null && latestPurchaseLine.mrpPriceAtPurchase !== undefined) {
        const roundedMrp = Math.round(Number(latestPurchaseLine.mrpPriceAtPurchase) * 100) / 100;
        itemUpdateData.mrpPrice = new Prisma.Decimal(roundedMrp);
      }
    }

    await tx.item.update({
      where: { id: itemId },
      data: itemUpdateData,
    });
  }
}

async function resolveItem(
  tx: Prisma.TransactionClient,
  line: PurchaseLineInput,
  allowCreation: boolean,
): Promise<number> {
  if (line.itemId) {
    return line.itemId;
  }

  if (line.sku) {
    const existing = await tx.item.findUnique({ where: { sku: line.sku } });
    if (existing) {
      return existing.id;
    }
    if (!allowCreation) {
      throw new Error(`Item with SKU ${line.sku} not found`);
    }
  }

  if (line.brandNumber && line.sizeCode) {
    const existing = await tx.item.findFirst({
      where: {
        brandNumber: line.brandNumber,
        sizeCode: line.sizeCode,
        ...(line.packType ? { packType: line.packType } : {}),
      },
    });
    if (existing) {
      return existing.id;
    }
  }

  if (!allowCreation) {
    throw new Error("Item creation is disabled for this import");
  }

  if (!line.name) {
    throw new Error("New items require a name");
  }

  const sku = deriveSku(line);
  const item = await tx.item.create({
    data: {
      sku,
      name: line.name,
      brandNumber: line.brandNumber ?? null,
      brand: line.brand ?? null,
      productType: line.productType ?? null,
      sizeCode: line.sizeCode ?? null,
      packType: line.packType ?? null,
      unitsPerPack: line.unitsPerPack ?? null,
      packSizeLabel: line.packSizeLabel ?? null,
      category: line.category ?? null,
      volumeMl: line.volumeMl ?? null,
      mrpPrice: new Prisma.Decimal(line.mrpPrice),
      purchaseCostPrice: new Prisma.Decimal(line.unitCostPrice),
      reorderLevel: line.reorderLevel ?? null,
      isActive: line.isActive ?? true,
    },
  });
  return item.id;
}

async function shouldUpdateItemPricing(
  tx: Prisma.TransactionClient,
  itemId: number,
  purchaseDate: Date,
) {
  const latestLine = await tx.purchaseLineItem.findFirst({
    where: { itemId },
    include: { purchase: true },
    orderBy: { purchase: { purchaseDate: "desc" } },
  });
  if (!latestLine) {
    return true;
  }
  return purchaseDate >= latestLine.purchase.purchaseDate;
}

function applyItemMetadata(target: Prisma.ItemUpdateInput, line: PurchaseLineInput) {
  if (line.brandNumber !== undefined) {
    target.brandNumber = line.brandNumber ?? null;
  }
  if (line.brand !== undefined) {
    target.brand = line.brand ?? null;
  }
  if (line.productType !== undefined) {
    target.productType = line.productType ?? null;
  }
  if (line.sizeCode !== undefined) {
    target.sizeCode = line.sizeCode ?? null;
  }
  if (line.packType !== undefined) {
    target.packType = line.packType ?? null;
  }
  if (line.unitsPerPack !== undefined) {
    target.unitsPerPack = line.unitsPerPack ?? null;
  }
  if (line.packSizeLabel !== undefined) {
    target.packSizeLabel = line.packSizeLabel ?? null;
  }
  if (line.category !== undefined) {
    target.category = line.category ?? null;
  }
  if (line.volumeMl !== undefined) {
    target.volumeMl = line.volumeMl ?? null;
  }
  if (line.reorderLevel !== undefined) {
    target.reorderLevel = line.reorderLevel ?? null;
  }
  if (line.isActive !== undefined) {
    target.isActive = line.isActive;
  }
}

function computeCaseStats(line: PurchaseLineInput) {
  const inferredUnitsPerCase =
    line.unitsPerPack ??
    (line.casesQuantity && line.casesQuantity > 0
      ? Math.round(line.quantityUnits / line.casesQuantity)
      : undefined);
  const unitsPerCase = inferredUnitsPerCase ?? undefined;
  const casesQuantity =
    line.casesQuantity ??
    (unitsPerCase ? Math.round(line.quantityUnits / unitsPerCase) : undefined);
  const caseCostPrice =
    line.caseCostPrice ?? (unitsPerCase ? line.unitCostPrice * unitsPerCase : undefined);
  const lineTotalPrice =
    line.lineTotalPrice ??
    (caseCostPrice !== undefined && casesQuantity !== undefined
      ? caseCostPrice * casesQuantity
      : undefined);
  return { unitsPerCase, casesQuantity, caseCostPrice, lineTotalPrice };
}

function deriveSku(line: PurchaseLineInput) {
  if (line.sku) {
    return line.sku;
  }
  const parts = [line.brandNumber, line.sizeCode, line.packType]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\s+/g, "").toUpperCase());
  if (parts.length >= 2) {
    return parts.join("-");
  }
  if (line.brandNumber && line.volumeMl) {
    return `${line.brandNumber}-${line.volumeMl}`;
  }
  if (line.name) {
    return line.name.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 20);
  }
  return `SKU-${Date.now()}`;
}
