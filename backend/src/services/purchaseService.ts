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

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        purchaseDate: new Date(input.purchaseDate),
        supplierName: input.supplierName,
        notes: input.notes,
      },
    });

    let totalQuantity = 0;
    for (const line of input.lineItems) {
      const itemId = await resolveItem(tx, line, input.allowItemCreation ?? true);
      await tx.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId,
          quantityUnits: line.quantityUnits,
          unitCostPrice: new Prisma.Decimal(line.unitCostPrice),
          mrpPriceAtPurchase: new Prisma.Decimal(line.mrpPrice),
        },
      });

      await tx.item.update({
        where: { id: itemId },
        data: {
          mrpPrice: new Prisma.Decimal(line.mrpPrice),
          purchaseCostPrice: new Prisma.Decimal(line.unitCostPrice),
          currentStockUnits: { increment: line.quantityUnits },
        },
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

  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { lineItems: true },
    });

    if (!existing) {
      throw new Error("Purchase not found");
    }

    for (const line of existing.lineItems) {
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
        purchaseDate: new Date(input.purchaseDate),
        supplierName: input.supplierName,
        notes: input.notes,
      },
    });

    let totalQuantity = 0;
    for (const line of input.lineItems) {
      const itemId = await resolveItem(tx, line, input.allowItemCreation ?? true);
      await tx.purchaseLineItem.create({
        data: {
          purchaseId: purchase.id,
          itemId,
          quantityUnits: line.quantityUnits,
          unitCostPrice: new Prisma.Decimal(line.unitCostPrice),
          mrpPriceAtPurchase: new Prisma.Decimal(line.mrpPrice),
        },
      });

      await tx.item.update({
        where: { id: itemId },
        data: {
          mrpPrice: new Prisma.Decimal(line.mrpPrice),
          purchaseCostPrice: new Prisma.Decimal(line.unitCostPrice),
          currentStockUnits: { increment: line.quantityUnits },
        },
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

export async function deletePurchase(purchaseId: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { lineItems: true },
    });

    if (!existing) {
      throw new Error("Purchase not found");
    }

    for (const line of existing.lineItems) {
      await tx.item.update({
        where: { id: line.itemId },
        data: {
          currentStockUnits: { decrement: line.quantityUnits },
        },
      });
    }

    await tx.purchase.delete({ where: { id: purchaseId } });
  });
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
      brand: line.brand,
      category: line.category,
      volumeMl: line.volumeMl,
      mrpPrice: new Prisma.Decimal(line.mrpPrice),
      purchaseCostPrice: new Prisma.Decimal(line.unitCostPrice),
      reorderLevel: line.reorderLevel,
      isActive: line.isActive ?? true,
    },
  });
  return item.id;
}
