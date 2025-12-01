import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  const status = message.toLowerCase().includes("not found") ? 404 : 400;
  res.status(status).json({ message });
}
