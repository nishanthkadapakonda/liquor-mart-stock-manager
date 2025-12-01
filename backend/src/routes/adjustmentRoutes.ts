import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const adjustmentSchema = z.object({
  itemId: z.number().int().positive(),
  adjustmentUnits: z.number().int(),
  reason: z.string().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const adjustments = await prisma.stockAdjustment.findMany({
      include: { item: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ adjustments });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = adjustmentSchema.parse(req.body);
    const adjustment = await prisma.$transaction(async (tx) => {
      const created = await tx.stockAdjustment.create({
        data: {
          ...payload,
          createdBy: req.currentAdmin?.email,
        },
      });
      await tx.item.update({
        where: { id: payload.itemId },
        data: {
          currentStockUnits: { increment: payload.adjustmentUnits },
        },
      });
      return created;
    });
    res.status(201).json({ adjustment });
  }),
);

export const adjustmentRouter = router;
