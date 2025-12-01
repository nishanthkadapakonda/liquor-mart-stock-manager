import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const settingsSchema = z.object({
  defaultBeltMarkupRupees: z.number().nonnegative().optional(),
  defaultLowStockThreshold: z.number().int().positive().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.setting.findUnique({ where: { id: 1 } });
    res.json({ settings });
  }),
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const payload = settingsSchema.parse(req.body);
    const data: Prisma.SettingUpdateInput = {};
    if (payload.defaultBeltMarkupRupees !== undefined) {
      data.defaultBeltMarkupRupees = new Prisma.Decimal(payload.defaultBeltMarkupRupees);
    }
    if (payload.defaultLowStockThreshold !== undefined) {
      data.defaultLowStockThreshold = payload.defaultLowStockThreshold;
    }
    const settings = await prisma.setting.update({
      where: { id: 1 },
      data,
    });
    res.json({ settings });
  }),
);

export const settingsRouter = router;
