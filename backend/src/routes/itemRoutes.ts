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
          mrpPrice: new Prisma.Decimal(mrpPrice),
          purchaseCostPrice:
            purchaseCostPrice !== undefined ? new Prisma.Decimal(purchaseCostPrice) : null,
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
