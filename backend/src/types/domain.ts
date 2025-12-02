export const SALES_CHANNELS = ["RETAIL", "BELT"] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const USER_ROLES = ["ADMIN", "VIEWER"] as const;
