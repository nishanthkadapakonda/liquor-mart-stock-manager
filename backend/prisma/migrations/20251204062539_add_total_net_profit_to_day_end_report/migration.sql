-- AlterTable
ALTER TABLE "DayEndReport" ADD COLUMN     "totalNetProfit" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "DayEndReportLine" ADD COLUMN     "lineNetProfit" DECIMAL(65,30);
