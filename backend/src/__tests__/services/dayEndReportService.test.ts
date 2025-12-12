import { createDayEndReport, updateDayEndReport, previewDayEndReport } from '../../services/dayEndReportService';
import { cleanDatabase, createTestItem, createTestPurchaseInput } from '../helpers/testHelpers';
import { createPurchase } from '../../services/purchaseService';
import { testPrisma as prisma } from '../helpers/testPrisma';

describe('DayEndReportService', () => {
  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createDayEndReport', () => {
    it('should create a day-end report with sales data', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // Create a purchase first to have inventory using the service
      const purchaseInput = createTestPurchaseInput();
      purchaseInput.lineItems[0].itemId = item.id;
      await createPurchase(purchaseInput);
      
      // Verify stock was added
      const updatedItem = await prisma.item.findUnique({ where: { id: item.id } });
      expect(updatedItem?.currentStockUnits).toBeGreaterThan(0);

      const reportInput = {
        reportDate: new Date().toISOString().split('T')[0],
        beltMarkupRupees: 20.0000,
        lines: [
          {
            itemId: item.id,
            channel: 'RETAIL' as const,
            quantitySoldUnits: 5,
            sellingPricePerUnit: 100.0000,
          },
        ],
      };

      const result = await createDayEndReport(reportInput);

      expect(result).toBeDefined();
      expect(result.report).toBeDefined();
      expect(result.report.id).toBeDefined();
      expect(result.report.totalUnitsSold).toBe(5);
      expect(Number(result.report.totalSalesAmount)).toBe(500.0000);
      expect(Number(result.report.totalCost)).toBe(400.0000);
      expect(Number(result.report.totalProfit)).toBe(100.0000);
    });

    it('should calculate net profit correctly with tax and misc', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // Create purchase with tax and misc using the service
      const purchaseInput1 = createTestPurchaseInput({
        taxAmount: 50.0000,
        miscellaneousCharges: 25.0000,
      });
      purchaseInput1.lineItems[0].itemId = item.id;
      purchaseInput1.lineItems[0].sku = item.sku; // Ensure SKU matches
      purchaseInput1.lineItems[0].name = item.name;
      purchaseInput1.lineItems[0].brandNumber = item.brandNumber || '5001';
      purchaseInput1.lineItems[0].sizeCode = item.sizeCode || 'BS';
      purchaseInput1.lineItems[0].packType = item.packType || 'G';
      
      const purchaseResult1 = await createPurchase(purchaseInput1);
      expect(purchaseResult1).toBeDefined();
      
      // Verify stock was added
      const updatedItem = await prisma.item.findUnique({ where: { id: item.id } });
      expect(updatedItem?.currentStockUnits).toBeGreaterThan(0);

      const reportInput = {
        reportDate: new Date().toISOString().split('T')[0],
        beltMarkupRupees: 20.0000,
        lines: [
          {
            itemId: item.id,
            channel: 'RETAIL' as const,
            quantitySoldUnits: 5,
            sellingPricePerUnit: 100.0000,
          },
        ],
      };

      const result = await createDayEndReport(reportInput);

      // Gross profit: 500 - 400 = 100
      // Net profit: 100 - (proportional share of 75 tax/misc)
      expect(Number(result.report.totalProfit)).toBe(100.0000);
      expect(Number(result.report.totalNetProfit)).toBeLessThan(100.0000);
    });
  });

  describe('previewDayEndReport', () => {
    it('should preview report without saving', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // Create a purchase to add stock using the service
      const purchaseInput = createTestPurchaseInput();
      purchaseInput.lineItems[0].itemId = item.id;
      purchaseInput.lineItems[0].sku = item.sku; // Ensure SKU matches
      purchaseInput.lineItems[0].name = item.name;
      purchaseInput.lineItems[0].brandNumber = item.brandNumber || '5001';
      purchaseInput.lineItems[0].sizeCode = item.sizeCode || 'BS';
      purchaseInput.lineItems[0].packType = item.packType || 'G';
      
      const purchaseResult = await createPurchase(purchaseInput);
      expect(purchaseResult).toBeDefined();
      
      // Verify stock was added
      const updatedItem = await prisma.item.findUnique({ where: { id: item.id } });
      expect(updatedItem?.currentStockUnits).toBeGreaterThan(0);

      const reportInput = {
        reportDate: new Date().toISOString().split('T')[0],
        beltMarkupRupees: 20.0000,
        lines: [
          {
            itemId: item.id,
            channel: 'RETAIL' as const,
            quantitySoldUnits: 5,
            sellingPricePerUnit: 100.0000,
          },
        ],
      };

      const preview = await previewDayEndReport(reportInput);

      expect(preview.totalRevenue).toBe(500.0000);
      expect(preview.totalCost).toBe(400.0000);
      expect(preview.totalProfit).toBe(100.0000);

      // Verify no report was created
      const reports = await prisma.dayEndReport.findMany();
      expect(reports.length).toBe(0);
    });
  });
});

