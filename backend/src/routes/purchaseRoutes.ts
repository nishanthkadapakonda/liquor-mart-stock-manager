import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { createPurchase, deletePurchase, updatePurchase } from "../services/purchaseService";
import type { PurchaseLineInput } from "../services/purchaseService";
import { requireAdmin } from "../middleware/requireRole";

const router = Router();

const purchaseLineSchema = z.object({
  itemId: z.number().int().positive().optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  brand: z.string().optional(),
  brandNumber: z.string().optional(),
  productType: z.string().optional(),
  sizeCode: z.string().optional(),
  packType: z.string().optional(),
  packSizeLabel: z.string().optional(),
  unitsPerPack: z.number().int().positive().optional(),
  category: z.string().optional(),
  volumeMl: z.number().int().nonnegative().optional(),
  mrpPrice: z.number().nonnegative(),
  unitCostPrice: z.number().nonnegative(),
  quantityUnits: z.number().int().positive(),
  casesQuantity: z.number().int().nonnegative().optional(),
  reorderLevel: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const purchaseSchema = z.object({
  purchaseDate: z.string(),
  supplierName: z.string().optional(),
  notes: z.string().optional(),
  allowItemCreation: z.boolean().optional(),
  lineItems: z.array(purchaseLineSchema).min(1),
});

function normalizeLineItems(items: z.infer<typeof purchaseSchema>["lineItems"]): PurchaseLineInput[] {
  return items.map((line) => {
    const {
      itemId,
      sku,
      name,
      brand,
      brandNumber,
      productType,
      sizeCode,
      packType,
      packSizeLabel,
      unitsPerPack,
      category,
      volumeMl,
      reorderLevel,
      isActive,
      casesQuantity,
      ...rest
    } = line;
    return {
      ...rest,
      ...(typeof itemId === "number" ? { itemId } : {}),
      ...(sku ? { sku } : {}),
      ...(name ? { name } : {}),
      ...(brand ? { brand } : {}),
      ...(brandNumber ? { brandNumber: brandNumber.trim() } : {}),
      ...(productType ? { productType: productType.trim() } : {}),
      ...(sizeCode ? { sizeCode: sizeCode.trim() } : {}),
      ...(packType ? { packType: packType.trim() } : {}),
      ...(packSizeLabel ? { packSizeLabel } : {}),
      ...(typeof unitsPerPack === "number" ? { unitsPerPack } : {}),
      ...(category ? { category } : {}),
      ...(volumeMl !== undefined ? { volumeMl } : {}),
      ...(typeof casesQuantity === "number" ? { casesQuantity } : {}),
      ...(reorderLevel !== undefined ? { reorderLevel } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    };
  });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const purchases = await prisma.purchase.findMany({
      where: {
        ...(startDate && endDate
          ? {
              purchaseDate: {
                gte: new Date(String(startDate)),
                lte: new Date(String(endDate)),
              },
            }
          : {}),
      },
      include: {
        lineItems: {
          include: { item: true },
        },
      },
      orderBy: { purchaseDate: "desc" },
    });

    const formatted = purchases.map((purchase) => {
      const totalQuantity = purchase.lineItems.reduce((sum, l) => sum + l.quantityUnits, 0);
      const totalCost = purchase.lineItems.reduce((sum, l) => {
        const lineCost = l.lineTotalPrice
          ? Number(l.lineTotalPrice)
          : Number(l.unitCostPrice) * l.quantityUnits;
        return sum + lineCost;
      }, 0);
      return { ...purchase, totalQuantity, totalCost };
    });

    res.json({ purchases: formatted });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const purchase = await prisma.purchase.findUnique({
      where: { id: Number(id) },
      include: { lineItems: { include: { item: true } } },
    });
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    res.json({ purchase });
  }),
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body);
    const result = await createPurchase({
      purchaseDate: payload.purchaseDate,
      lineItems: normalizeLineItems(payload.lineItems),
      ...(payload.allowItemCreation !== undefined ? { allowItemCreation: payload.allowItemCreation } : {}),
      ...(payload.supplierName ? { supplierName: payload.supplierName } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    });
    res.status(201).json(result);
  }),
);

router.post(
  "/import",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body);
    const result = await createPurchase({
      purchaseDate: payload.purchaseDate,
      lineItems: normalizeLineItems(payload.lineItems),
      allowItemCreation: true,
      ...(payload.supplierName ? { supplierName: payload.supplierName } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    });
    res.status(201).json(result);
  }),
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const result = await updatePurchase(Number(id), {
      purchaseDate: payload.purchaseDate,
      lineItems: normalizeLineItems(payload.lineItems),
      ...(payload.allowItemCreation !== undefined ? { allowItemCreation: payload.allowItemCreation } : {}),
      ...(payload.supplierName ? { supplierName: payload.supplierName } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    });
    res.json(result);
  }),
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await deletePurchase(Number(id));
    res.status(204).send();
  }),
);

export const purchaseRouter = router;
