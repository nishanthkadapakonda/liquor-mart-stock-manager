import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getDashboardMetrics } from "../services/analyticsService";

const router = Router();

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const metrics = await getDashboardMetrics({
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });
    res.json(metrics);
  }),
);

export const dashboardRouter = router;
