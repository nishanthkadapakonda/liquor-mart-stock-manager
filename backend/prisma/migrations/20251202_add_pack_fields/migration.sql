-- AlterTable Item
ALTER TABLE "Item"
  ADD COLUMN "brandNumber" TEXT,
  ADD COLUMN "productType" TEXT,
  ADD COLUMN "sizeCode" TEXT,
  ADD COLUMN "packType" TEXT,
  ADD COLUMN "unitsPerPack" INTEGER,
  ADD COLUMN "packSizeLabel" TEXT;

-- CreateIndex on Item brandNumber and brandNumber+sizeCode
CREATE INDEX "Item_brandNumber_idx" ON "Item"("brandNumber");
CREATE INDEX "Item_brandNumber_sizeCode_idx" ON "Item"("brandNumber", "sizeCode");

-- AlterTable PurchaseLineItem
ALTER TABLE "PurchaseLineItem"
  ADD COLUMN "casesQuantity" INTEGER,
  ADD COLUMN "unitsPerCase" INTEGER,
  ADD COLUMN "packType" TEXT,
  ADD COLUMN "packSizeLabel" TEXT,
  ADD COLUMN "brandNumber" TEXT,
  ADD COLUMN "productType" TEXT,
  ADD COLUMN "sizeCode" TEXT,
  ADD COLUMN "caseCostPrice" DECIMAL(65,30),
  ADD COLUMN "lineTotalPrice" DECIMAL(65,30);
