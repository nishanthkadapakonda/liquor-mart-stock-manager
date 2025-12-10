import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAdmin } from "../middleware/requireRole";

const router = Router();

// Helper function to round to 4 decimal places without floating-point errors
function roundTo4Decimals(value: number): number {
  // Use toFixed to avoid floating-point precision issues, then parse back
  return Number(Number(value).toFixed(4));
}

const baseItemSchema = z.object({
  sku: z.string().min(2).optional(), // Optional - auto-generated from brandNumber-sizeCode-packType
  name: z.string().min(2),
  brandNumber: z.string().optional(),
  brand: z.string().optional(),
  productType: z.string().optional(),
  sizeCode: z.string().optional(),
  packType: z.string().optional(),
  unitsPerPack: z.number().int().positive().optional(),
  packSizeLabel: z.string().optional(),
  category: z.string().optional(),
  volumeMl: z.number().int().nonnegative().optional(),
  mrpPrice: z.number().nonnegative(),
  purchaseCostPrice: z.number().nonnegative().optional(),
  currentStockUnits: z.number().int().nonnegative().optional(),
  reorderLevel: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

// Auto-generate SKU from composite key if not provided
function deriveSku(data: { sku?: string; brandNumber?: string; sizeCode?: string; packType?: string; name?: string }): string {
  if (data.sku) return data.sku;
  const parts = [data.brandNumber, data.sizeCode, data.packType]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\s+/g, "").toUpperCase());
  if (parts.length >= 2) {
    return parts.join("-");
  }
  if (data.name) {
    return data.name.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 20);
  }
  return `SKU-${Date.now()}`;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, category, active } = req.query;
    const items = await prisma.item.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: String(q), mode: "insensitive" } },
                { sku: { contains: String(q), mode: "insensitive" } },
              ],
            }
          : {}),
        ...(category ? { category: { equals: String(category), mode: "insensitive" } } : {}),
        ...(active ? { isActive: active === "true" } : {}),
      },
      orderBy: { name: "asc" },
    });
    res.json({ items });
  }),
);

router.get(
  "/low-stock",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.setting.findUnique({ where: { id: 1 } });
    const threshold = settings?.defaultLowStockThreshold ?? 10;
    const items = await prisma.item.findMany({
      where: {
        isActive: true,
        currentStockUnits: { lt: threshold },
      },
      orderBy: { currentStockUnits: "asc" },
    });
    res.json({ items, threshold });
  }),
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = baseItemSchema.parse(req.body);
    const {
      name,
      brandNumber,
      brand,
      productType,
      sizeCode,
      packType,
      unitsPerPack,
      packSizeLabel,
      category,
      volumeMl,
      mrpPrice,
      purchaseCostPrice,
      currentStockUnits,
      reorderLevel,
      isActive,
    } = payload;
    // Auto-generate SKU from composite key if not provided
    const sku = deriveSku(payload);
    try {
      const item = await prisma.item.create({
        data: {
          sku,
          name,
        brandNumber: brandNumber ?? null,
          brand: brand ?? null,
        productType: productType ?? null,
        sizeCode: sizeCode ?? null,
        packType: packType ?? null,
        unitsPerPack: unitsPerPack ?? null,
        packSizeLabel: packSizeLabel ?? null,
          category: category ?? null,
          volumeMl: volumeMl ?? null,
          currentStockUnits: currentStockUnits ?? 0,
          reorderLevel: reorderLevel ?? null,
          isActive: isActive ?? true,
          mrpPrice: new Prisma.Decimal(roundTo4Decimals(mrpPrice)),
          purchaseCostPrice:
            purchaseCostPrice !== undefined ? new Prisma.Decimal(roundTo4Decimals(purchaseCostPrice)) : null,
        },
      });
      res.status(201).json({ item });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ message: "An item with this SKU already exists." });
        return;
      }
      throw error;
    }
  }),
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = baseItemSchema.partial().parse(req.body);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const {
      mrpPrice,
      purchaseCostPrice,
      brandNumber,
      brand,
      productType,
      sizeCode,
      packType,
      unitsPerPack,
      packSizeLabel,
      category,
      volumeMl,
      reorderLevel,
      ...rest
    } = payload;
    const data: Prisma.ItemUpdateInput = {};
    if (rest.sku !== undefined) {
      data.sku = rest.sku;
    }
    if (rest.name !== undefined) {
      data.name = rest.name;
    }
    if (rest.currentStockUnits !== undefined) {
      data.currentStockUnits = rest.currentStockUnits;
    }
    if (rest.isActive !== undefined) {
      data.isActive = rest.isActive;
    }
    if (brandNumber !== undefined) {
      data.brandNumber = brandNumber ?? null;
    }
    if (brand !== undefined) {
      data.brand = brand ?? null;
    }
    if (productType !== undefined) {
      data.productType = productType ?? null;
    }
    if (sizeCode !== undefined) {
      data.sizeCode = sizeCode ?? null;
    }
    if (packType !== undefined) {
      data.packType = packType ?? null;
    }
    if (unitsPerPack !== undefined) {
      data.unitsPerPack = unitsPerPack ?? null;
    }
    if (packSizeLabel !== undefined) {
      data.packSizeLabel = packSizeLabel ?? null;
    }
    if (category !== undefined) {
      data.category = category ?? null;
    }
    if (volumeMl !== undefined) {
      data.volumeMl = volumeMl ?? null;
    }
    if (reorderLevel !== undefined) {
      data.reorderLevel = reorderLevel ?? null;
    }
    if (mrpPrice !== undefined) {
      data.mrpPrice = new Prisma.Decimal(roundTo4Decimals(mrpPrice));
    }
    if (purchaseCostPrice !== undefined) {
      data.purchaseCostPrice = new Prisma.Decimal(roundTo4Decimals(purchaseCostPrice));
    }
    const item = await prisma.item.update({
      where: { id: Number(id) },
      data,
    });
    res.json({ item });
  }),
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await prisma.item.update({
      where: { id: Number(id) },
      data: { isActive: false },
    });
    res.status(204).send();
  }),
);

// Get price history for an item - shows all purchases and how weighted avg was calculated
router.get(
  "/:id/price-history",
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const itemId = Number(id);

    // Get the item with current pricing info
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        sku: true,
        name: true,
        mrpPrice: true,
        purchaseCostPrice: true,
        weightedAvgCostPrice: true,
        totalInventoryValue: true,
        currentStockUnits: true,
      },
    });

    if (!item) {
      res.status(404).json({ message: "Item not found" });
      return;
    }

    // Get all purchase history ordered by date
    const purchases = await prisma.purchaseLineItem.findMany({
      where: { itemId },
      include: {
        purchase: {
          select: {
            id: true,
            purchaseDate: true,
            supplierName: true,
          },
        },
      },
      orderBy: { purchase: { purchaseDate: "asc" } },
    });

    // Calculate running weighted average at each purchase point
    let runningTotalValue = 0;
    let runningTotalUnits = 0;
    const history = purchases.map((line) => {
      const purchaseValue = Number(line.unitCostPrice) * line.quantityUnits;
      runningTotalValue += purchaseValue;
      runningTotalUnits += line.quantityUnits;
      const weightedAvgAtPurchase = runningTotalUnits > 0 ? runningTotalValue / runningTotalUnits : 0;

      return {
        purchaseId: line.purchase.id,
        purchaseDate: line.purchase.purchaseDate,
        supplierName: line.purchase.supplierName,
        quantityUnits: line.quantityUnits,
        unitCostPrice: Number(line.unitCostPrice),
        caseCostPrice: line.caseCostPrice ? Number(line.caseCostPrice) : null,
        lineTotalPrice: line.lineTotalPrice ? Number(line.lineTotalPrice) : null,
        // Running calculations at this point in time
        runningTotalUnits,
        runningTotalValue: roundTo4Decimals(runningTotalValue),
        weightedAvgAtPurchase: roundTo4Decimals(weightedAvgAtPurchase),
      };
    });

    res.json({
      item: {
        ...item,
        mrpPrice: Number(item.mrpPrice),
        purchaseCostPrice: item.purchaseCostPrice ? Number(item.purchaseCostPrice) : null,
        weightedAvgCostPrice: item.weightedAvgCostPrice ? Number(item.weightedAvgCostPrice) : null,
        totalInventoryValue: item.totalInventoryValue ? Number(item.totalInventoryValue) : null,
      },
      history,
      summary: {
        totalPurchases: purchases.length,
        totalUnitsPurchased: runningTotalUnits,
        totalValuePurchased: roundTo4Decimals(runningTotalValue),
        currentWeightedAvg: runningTotalUnits > 0 ? roundTo4Decimals(runningTotalValue / runningTotalUnits) : 0,
      },
    });
  }),
);

export const itemRouter = router;
