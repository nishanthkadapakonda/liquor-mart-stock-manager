import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { getSalesTimeSeries, getTopItems, getVelocity } from "../services/analyticsService";
import { SalesChannel } from "../types/domain";

const router = Router();

const dateRangeQuery = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get(
  "/time-series",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const channelParam = typeof req.query.channel === "string" ? req.query.channel.toUpperCase() : undefined;
    const channel =
      channelParam === "ALL" || channelParam === undefined
        ? channelParam
        : (channelParam as SalesChannel);
    const metric = req.query.metric === "units" ? "units" : "revenue";
    const series = await getSalesTimeSeries({
      startDate,
      endDate,
      channel,
      metric,
    });
    res.json(series);
  }),
);

router.get(
  "/top-items",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const sort = req.query.sort === "revenue" ? "revenue" : "units";
    const data = await getTopItems({
      startDate,
      endDate,
      limit,
      sort,
    });
    res.json(data);
  }),
);

router.get(
  "/velocity",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const data = await getVelocity({ startDate, endDate });
    res.json(data);
  }),
);

export const analyticsRouter = router;
