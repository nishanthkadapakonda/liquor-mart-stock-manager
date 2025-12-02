-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- AlterTable
ALTER TABLE "AdminUser"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'ADMIN';
