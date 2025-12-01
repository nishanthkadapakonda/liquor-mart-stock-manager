import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { createPurchase } from "../services/purchaseService";

const router = Router();

const purchaseLineSchema = z.object({
  itemId: z.number().int().positive().optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  volumeMl: z.number().int().nonnegative().optional(),
  mrpPrice: z.number().nonnegative(),
  unitCostPrice: z.number().nonnegative(),
  quantityUnits: z.number().int().positive(),
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
      const totalCost = purchase.lineItems.reduce((sum, l) => sum + Number(l.unitCostPrice) * l.quantityUnits, 0);
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
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body);
    const result = await createPurchase(payload);
    res.status(201).json(result);
  }),
);

router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body);
    const result = await createPurchase({ ...payload, allowItemCreation: true });
    res.status(201).json(result);
  }),
);

export const purchaseRouter = router;
