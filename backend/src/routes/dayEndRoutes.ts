import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../prisma";
import { createDayEndReport, previewDayEndReport } from "../services/dayEndReportService";
import { SALES_CHANNELS } from "../types/domain";

const router = Router();

const dayEndLineSchema = z.object({
  itemId: z.number().int().positive().optional(),
  sku: z.string().optional(),
  channel: z.enum(SALES_CHANNELS),
  quantitySoldUnits: z.number().int().nonnegative(),
  sellingPricePerUnit: z.number().nonnegative().optional(),
});

const reportSchema = z.object({
  reportDate: z.string(),
  beltMarkupRupees: z.number().optional(),
  notes: z.string().optional(),
  lines: z.array(dayEndLineSchema).min(1),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const reports = await prisma.dayEndReport.findMany({
      where: {
        ...(startDate && endDate
          ? {
              reportDate: {
                gte: new Date(String(startDate)),
                lte: new Date(String(endDate)),
              },
            }
          : {}),
      },
      include: { lines: { include: { item: true } } },
      orderBy: { reportDate: "desc" },
    });
    res.json({ reports });
  }),
);

router.get(
  "/latest",
  asyncHandler(async (_req, res) => {
    const report = await prisma.dayEndReport.findFirst({
      orderBy: { reportDate: "desc" },
      include: { lines: { include: { item: true } } },
    });
    res.json({ report });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const report = await prisma.dayEndReport.findUnique({
      where: { id: Number(id) },
      include: { lines: { include: { item: true } } },
    });
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    res.json({ report });
  }),
);

router.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const payload = reportSchema.parse(req.body);
    const preview = await previewDayEndReport(payload);
    res.json(preview);
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = reportSchema.parse(req.body);
    const result = await createDayEndReport(payload);
    res.status(201).json(result);
  }),
);

export const dayEndRouter = router;
