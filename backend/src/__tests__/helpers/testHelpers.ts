import { PrismaClient } from '@prisma/client';

export async function cleanDatabase(prisma: PrismaClient) {
  // Delete in order to respect foreign key constraints
  // Must delete child records before parent records
  // Order: DayEndReportLine -> DayEndReport -> StockAdjustment -> PurchaseLineItem -> Purchase -> Item -> AdminUser
  await prisma.dayEndReportLine.deleteMany();
  await prisma.dayEndReport.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.purchaseLineItem.deleteMany();
  await prisma.purchase.deleteMany();
  // Items can be deleted after all references (DayEndReportLine, StockAdjustment, PurchaseLineItem) are deleted
  await prisma.item.deleteMany();
  await prisma.adminUser.deleteMany();
}

export function createTestUser(overrides?: Partial<{
  email: string;
  password: string;
  name: string;
  role: 'ADMIN' | 'VIEWER';
}>) {
  return {
    email: overrides?.email || 'test@example.com',
    password: overrides?.password || 'TestPassword123!',
    name: overrides?.name || 'Test User',
    role: overrides?.role || 'ADMIN' as const,
  };
}

export function createTestItem(overrides?: Partial<{
  sku: string;
  name: string;
  brandNumber: string;
  sizeCode: string;
  packType: string;
  mrpPrice: number;
}>) {
  return {
    sku: overrides?.sku || 'TEST-SKU-001',
    name: overrides?.name || 'Test Item',
    brandNumber: overrides?.brandNumber || '5001',
    sizeCode: overrides?.sizeCode || 'BS',
    packType: overrides?.packType || 'G',
    productType: 'Beer',
    mrpPrice: overrides?.mrpPrice || 100.0000,
    isActive: true,
  };
}

export function createTestPurchaseInput(overrides?: Partial<{
  purchaseDate: string;
  supplierName: string;
  taxAmount: number;
  miscellaneousCharges: number;
}>) {
  return {
    purchaseDate: overrides?.purchaseDate || new Date().toISOString().split('T')[0],
    supplierName: overrides?.supplierName || 'Test Supplier',
    taxAmount: overrides?.taxAmount,
    miscellaneousCharges: overrides?.miscellaneousCharges,
    lineItems: [
      {
        name: 'Test Item',
        brandNumber: '5001',
        sizeCode: 'BS',
        packType: 'G',
        mrpPrice: 100.0000,
        unitCostPrice: 80.0000,
        quantityUnits: 10,
      },
    ],
  };
}

