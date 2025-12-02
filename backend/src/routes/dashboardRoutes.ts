import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getDashboardMetrics } from "../services/analyticsService";

const router = Router();

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const range = {
      ...(startDate ? { startDate: String(startDate) } : {}),
      ...(endDate ? { endDate: String(endDate) } : {}),
    };
    const metrics = await getDashboardMetrics(range);
    res.json(metrics);
  }),
);

export const dashboardRouter = router;
