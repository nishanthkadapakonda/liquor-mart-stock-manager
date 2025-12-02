export type SalesChannel = "RETAIL" | "BELT";

export interface AppSettings {
  defaultBeltMarkupRupees?: number | string | null;
  defaultLowStockThreshold?: number | null;
}

export type UserRole = "ADMIN" | "VIEWER";

export interface AdminUser {
  id: number;
  email: string;
  name?: string | null;
  role: UserRole;
}

export interface Item {
  id: number;
  sku: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  volumeMl?: number | null;
  mrpPrice: string | number;
  purchaseCostPrice?: string | number | null;
  currentStockUnits: number;
  reorderLevel?: number | null;
  isActive: boolean;
}

export interface PurchaseLineItem {
  id: number;
  item: Item;
  quantityUnits: number;
  unitCostPrice: string;
  mrpPriceAtPurchase?: string | null;
}

export interface Purchase {
  id: number;
  purchaseDate: string;
  supplierName?: string | null;
  notes?: string | null;
  totalQuantity?: number;
  totalCost?: number;
  lineItems: PurchaseLineItem[];
}

export interface DayEndReportLine {
  id: number;
  item: Item;
  channel: SalesChannel;
  quantitySoldUnits: number;
  sellingPricePerUnit: string;
  lineRevenue: string;
}

export interface DayEndReport {
  id: number;
  reportDate: string;
  beltMarkupRupees: string;
  totalSalesAmount?: string | null;
  totalUnitsSold?: number | null;
  retailRevenue?: string | null;
  beltRevenue?: string | null;
  notes?: string | null;
  lines: DayEndReportLine[];
}

export interface DashboardSummary {
  totalSales: number;
  totalUnits: number;
  reports: DayEndReport[];
  topItems: { itemId: number; name: string; units: number; revenue: number }[];
  latestReport?: DayEndReport | null;
  settings?: AppSettings | null;
  lowStockItems: Item[];
}

export interface DayEndPreview {
  totalRevenue: number;
  totalUnits: number;
  retailRevenue: number;
  beltRevenue: number;
  shortages: {
    itemId: number;
    itemName: string;
    required: number;
    available: number;
  }[];
  beltMarkupRupees: number;
}

export interface AnalyticsTimeSeries {
  series: { date: string; value: number }[];
  metric: "revenue" | "units";
}

export interface TopItemsAnalytics {
  top: {
    itemId: number;
    itemName: string;
    units: number;
    revenue: number;
    currentStock: number;
  }[];
}

export interface VelocityAnalytics {
  velocity: {
    itemId: number;
    itemName: string;
    totalUnits: number;
    avgPerDay: number;
    currentStock: number;
    daysOfStockLeft: number | null;
  }[];
}

export interface DailyTopItemsAnalytics {
  days: {
    date: string;
    topItems: {
      itemId: number;
      itemName: string;
      units: number;
      revenue: number;
    }[];
  }[];
}

export interface DailyPerformanceAnalytics {
  daily: {
    date: string;
    revenue: number;
    units: number;
    retailRevenue: number;
    beltRevenue: number;
  }[];
  channelMix: {
    retailRevenue: number;
    beltRevenue: number;
  };
  summary: {
    totalRevenue: number;
    totalUnits: number;
  };
}

export interface SettingsPayload {
  defaultBeltMarkupRupees?: number;
  defaultLowStockThreshold?: number;
}

export interface PurchaseLineInput {
  itemId?: number;
  sku?: string;
  name?: string;
  brand?: string;
  category?: string;
  volumeMl?: number;
  mrpPrice: number;
  unitCostPrice: number;
  quantityUnits: number;
  reorderLevel?: number;
}

export interface DayEndLineInput {
  itemId?: number;
  sku?: string;
  channel: SalesChannel;
  quantitySoldUnits: number;
  sellingPricePerUnit?: number;
}
