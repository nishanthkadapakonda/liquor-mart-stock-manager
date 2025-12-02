import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getDailyPerformance,
  getDailyTopProducts,
  getProductSalesSummary,
  getSalesTimeSeries,
  getTopItems,
  getVelocity,
} from "../services/analyticsService";
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
    const range = {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const channelParam = typeof req.query.channel === "string" ? req.query.channel.toUpperCase() : undefined;
    const channel =
      channelParam === "ALL" || channelParam === undefined
        ? channelParam
        : (channelParam as SalesChannel);
    const metric = req.query.metric === "units" ? "units" : "revenue";
    const params: Parameters<typeof getSalesTimeSeries>[0] = {
      ...range,
      metric,
      ...(channel ? { channel } : {}),
    };
    const series = await getSalesTimeSeries(params);
    res.json(series);
  }),
);

router.get(
  "/top-items",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const range = {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const sort = req.query.sort === "revenue" ? "revenue" : "units";
    const data = await getTopItems({
      ...range,
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
    const range = {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const data = await getVelocity(range);
    res.json(data);
  }),
);

router.get(
  "/daily-performance",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const range = {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const data = await getDailyPerformance(range);
    res.json(data);
  }),
);

router.get(
  "/daily-top-items",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const range = {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const sort = req.query.sort === "units" ? "units" : "revenue";
    const data = await getDailyTopProducts({
      ...range,
      ...(limit ? { limit } : {}),
      sort,
    });
    res.json(data);
  }),
);

router.get(
  "/product-sales",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeQuery.parse(req.query);
    const range = {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const data = await getProductSalesSummary(range);
    res.json(data);
  }),
);

export const analyticsRouter = router;
