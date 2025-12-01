import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";

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
  asyncHandler(async (req, res) => {
    const payload = baseItemSchema.parse(req.body);
    const { mrpPrice, purchaseCostPrice, ...rest } = payload;
    const item = await prisma.item.create({
      data: {
        ...rest,
        mrpPrice: new Prisma.Decimal(mrpPrice),
        purchaseCostPrice:
          purchaseCostPrice !== undefined ? new Prisma.Decimal(purchaseCostPrice) : undefined,
      },
    });
    res.status(201).json({ item });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const payload = baseItemSchema.partial().parse(req.body);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { mrpPrice, purchaseCostPrice, ...rest } = payload;
    const item = await prisma.item.update({
      where: { id: Number(id) },
      data: {
        ...rest,
        ...(mrpPrice !== undefined ? { mrpPrice: new Prisma.Decimal(mrpPrice) } : {}),
        ...(purchaseCostPrice !== undefined
          ? { purchaseCostPrice: new Prisma.Decimal(purchaseCostPrice) }
          : {}),
      },
    });
    res.json({ item });
  }),
);

export const itemRouter = router;
