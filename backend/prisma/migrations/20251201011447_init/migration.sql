-- CreateTable
CREATE TABLE "AdminUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "defaultBeltMarkupRupees" DECIMAL NOT NULL DEFAULT 20,
    "defaultLowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "volumeMl" INTEGER,
    "mrpPrice" DECIMAL NOT NULL,
    "purchaseCostPrice" DECIMAL,
    "currentStockUnits" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseDate" DATETIME NOT NULL,
    "supplierName" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PurchaseLineItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantityUnits" INTEGER NOT NULL,
    "unitCostPrice" DECIMAL NOT NULL,
    "mrpPriceAtPurchase" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseLineItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseLineItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayEndReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reportDate" DATETIME NOT NULL,
    "beltMarkupRupees" DECIMAL NOT NULL DEFAULT 20,
    "totalSalesAmount" DECIMAL,
    "totalUnitsSold" INTEGER,
    "retailRevenue" DECIMAL,
    "beltRevenue" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DayEndReportLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reportId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "quantitySoldUnits" INTEGER NOT NULL,
    "mrpPrice" DECIMAL NOT NULL,
    "sellingPricePerUnit" DECIMAL NOT NULL,
    "lineRevenue" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayEndReportLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DayEndReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DayEndReportLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "adjustmentUnits" INTEGER NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "DayEndReport_reportDate_key" ON "DayEndReport"("reportDate");

-- CreateIndex
CREATE INDEX "DayEndReportLine_reportId_idx" ON "DayEndReportLine"("reportId");

-- CreateIndex
CREATE INDEX "DayEndReportLine_itemId_idx" ON "DayEndReportLine"("itemId");
