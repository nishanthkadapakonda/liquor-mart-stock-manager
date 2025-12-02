import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAdmin } from "../middleware/requireRole";

const router = Router();

const baseItemSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  brand: z.string().optional(),
  category: z.string().optional(),
  volumeMl: z.number().int().nonnegative().optional(),
  mrpPrice: z.number().nonnegative(),
  purchaseCostPrice: z.number().nonnegative().optional(),
  currentStockUnits: z.number().int().nonnegative().optional(),
  reorderLevel: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

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
      sku,
      name,
      brand,
      category,
      volumeMl,
      mrpPrice,
      purchaseCostPrice,
      currentStockUnits,
      reorderLevel,
      isActive,
    } = payload;
    const item = await prisma.item.create({
      data: {
        sku,
        name,
        brand: brand ?? null,
        category: category ?? null,
        volumeMl: volumeMl ?? null,
        currentStockUnits: currentStockUnits ?? 0,
        reorderLevel: reorderLevel ?? null,
        isActive: isActive ?? true,
        mrpPrice: new Prisma.Decimal(mrpPrice),
        purchaseCostPrice:
          purchaseCostPrice !== undefined ? new Prisma.Decimal(purchaseCostPrice) : null,
      },
    });
    res.status(201).json({ item });
  }),
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = baseItemSchema.partial().parse(req.body);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { mrpPrice, purchaseCostPrice, brand, category, volumeMl, reorderLevel, ...rest } = payload;
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
    if (brand !== undefined) {
      data.brand = brand ?? null;
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
      data.mrpPrice = new Prisma.Decimal(mrpPrice);
    }
    if (purchaseCostPrice !== undefined) {
      data.purchaseCostPrice = new Prisma.Decimal(purchaseCostPrice);
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

export const itemRouter = router;
