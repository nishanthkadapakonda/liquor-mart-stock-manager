-- AlterTable
ALTER TABLE "AdminUser" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DayEndReport" ADD COLUMN     "totalCost" DECIMAL(65,30),
ADD COLUMN     "totalProfit" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "DayEndReportLine" ADD COLUMN     "costPriceAtSale" DECIMAL(65,30),
ADD COLUMN     "lineCost" DECIMAL(65,30),
ADD COLUMN     "lineProfit" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "totalInventoryValue" DECIMAL(65,30),
ADD COLUMN     "weightedAvgCostPrice" DECIMAL(65,30),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Setting" ALTER COLUMN "updatedAt" DROP DEFAULT;
