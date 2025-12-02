import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export interface PurchaseLineInput {
  itemId?: number;
  sku?: string;
  name?: string;
  brand?: string;
  category?: string;
  volumeMl?: number;
  mrpPrice: number;
  unitCostPrice: number;
  quantityUnits: number;
  reorderLevel?: number;
  isActive?: boolean;
}

export interface PurchaseInput {
  purchaseDate: string;
  supplierName?: string;
  notes?: string;
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
      },
    });

    let totalQuantity = 0;
    const priceUpdateCache = new Map<number, boolean>();
    for (const line of input.lineItems) {
      const itemId = await resolveItem(tx, line, input.allowItemCreation ?? true);
      const shouldUpdatePricing =
        priceUpdateCache.get(itemId) ??
        (await shouldUpdateItemPricing(tx, itemId, purchaseDateValue));
      priceUpdateCache.set(itemId, shouldUpdatePricing);

      await tx.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId,
          quantityUnits: line.quantityUnits,
          unitCostPrice: new Prisma.Decimal(line.unitCostPrice),
          mrpPriceAtPurchase: new Prisma.Decimal(line.mrpPrice),
        },
      });

      const itemUpdateData: Prisma.ItemUpdateInput = {
        currentStockUnits: { increment: line.quantityUnits },
      };
      if (shouldUpdatePricing) {
        itemUpdateData.mrpPrice = new Prisma.Decimal(line.mrpPrice);
        itemUpdateData.purchaseCostPrice = new Prisma.Decimal(line.unitCostPrice);
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
      },
    });

    let totalQuantity = 0;
    const priceUpdateCache = new Map<number, boolean>();
    for (const line of input.lineItems) {
      const itemId = await resolveItem(tx, line, input.allowItemCreation ?? true);
      affectedItemIds.add(itemId);
      const shouldUpdatePricing =
        priceUpdateCache.get(itemId) ??
        (await shouldUpdateItemPricing(tx, itemId, purchaseDateValue));
      priceUpdateCache.set(itemId, shouldUpdatePricing);

      await tx.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId,
          quantityUnits: line.quantityUnits,
          unitCostPrice: new Prisma.Decimal(line.unitCostPrice),
          mrpPriceAtPurchase: new Prisma.Decimal(line.mrpPrice),
        },
      });

      const itemUpdateData: Prisma.ItemUpdateInput = {
        currentStockUnits: { increment: line.quantityUnits },
      };
      if (shouldUpdatePricing) {
        itemUpdateData.mrpPrice = new Prisma.Decimal(line.mrpPrice);
        itemUpdateData.purchaseCostPrice = new Prisma.Decimal(line.unitCostPrice);
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
    const [purchaseSum, salesSum, adjustmentsSum, latestPurchaseLine] = await Promise.all([
      tx.purchaseLineItem.aggregate({
        where: { itemId },
        _sum: { quantityUnits: true },
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

    const purchaseTotal = Number(purchaseSum._sum.quantityUnits ?? 0);
    const salesTotal = Number(salesSum._sum.quantitySoldUnits ?? 0);
    const adjustmentsTotal = Number(adjustmentsSum._sum.adjustmentUnits ?? 0);
    const currentStock = purchaseTotal - salesTotal + adjustmentsTotal;

    const itemUpdateData: Prisma.ItemUpdateInput = {
      currentStockUnits: currentStock,
    };

    if (latestPurchaseLine) {
      itemUpdateData.purchaseCostPrice = latestPurchaseLine.unitCostPrice;
      if (latestPurchaseLine.mrpPriceAtPurchase !== null && latestPurchaseLine.mrpPriceAtPurchase !== undefined) {
        itemUpdateData.mrpPrice = latestPurchaseLine.mrpPriceAtPurchase;
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

  if (!allowCreation) {
    throw new Error("Item creation is disabled for this import");
  }

  if (!line.name || !line.sku) {
    throw new Error("New items require sku and name");
  }

  const item = await tx.item.create({
    data: {
      sku: line.sku,
      name: line.name,
      brand: line.brand ?? null,
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
