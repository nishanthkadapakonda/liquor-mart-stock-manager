-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "miscellaneousCharges" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(65,30) DEFAULT 0;
