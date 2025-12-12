import { createPurchase, updatePurchase, deletePurchase } from '../../services/purchaseService';
import { cleanDatabase, createTestItem, createTestPurchaseInput } from '../helpers/testHelpers';
import { testPrisma as prisma } from '../helpers/testPrisma';

describe('PurchaseService', () => {
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

  describe('createPurchase', () => {
    it('should create a purchase with line items', async () => {
      // Create an item first with unique SKU
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // Verify item exists
      const verifyItem = await prisma.item.findUnique({ where: { id: item.id } });
      expect(verifyItem).toBeDefined();
      expect(verifyItem?.id).toBe(item.id);

      const purchaseInput = createTestPurchaseInput({
        taxAmount: 100.0000,
        miscellaneousCharges: 50.0000,
      });

      purchaseInput.lineItems[0].itemId = item.id;
      purchaseInput.lineItems[0].sku = item.sku;
      purchaseInput.lineItems[0].name = item.name;
      purchaseInput.lineItems[0].brandNumber = item.brandNumber || '5001';
      purchaseInput.lineItems[0].sizeCode = item.sizeCode || 'BS';
      purchaseInput.lineItems[0].packType = item.packType || 'G';

      const result = await createPurchase(purchaseInput);

      expect(result).toBeDefined();
      expect(result.purchase.id).toBeDefined();
      expect(Number(result.purchase.taxAmount)).toBe(100.0000);
      expect(Number(result.purchase.miscellaneousCharges)).toBe(50.0000);

      // Verify purchase was created
      const purchase = await prisma.purchase.findUnique({
        where: { id: result.purchase.id },
        include: { lineItems: true },
      });

      expect(purchase).toBeDefined();
      expect(purchase?.lineItems.length).toBe(1);
    });

    it('should calculate weighted average cost correctly', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // First purchase: 10 units at 80.0000
      await createPurchase({
        ...createTestPurchaseInput(),
        lineItems: [
          {
            itemId: item.id,
            name: 'Test Item',
            brandNumber: '5001',
            sizeCode: 'BS',
            packType: 'G',
            mrpPrice: 100.0000,
            unitCostPrice: 80.0000,
            quantityUnits: 10,
          },
        ],
      });

      // Second purchase: 5 units at 90.0000
      await createPurchase({
        ...createTestPurchaseInput(),
        lineItems: [
          {
            itemId: item.id,
            name: 'Test Item',
            brandNumber: '5001',
            sizeCode: 'BS',
            packType: 'G',
            mrpPrice: 100.0000,
            unitCostPrice: 90.0000,
            quantityUnits: 5,
          },
        ],
      });

      const updatedItem = await prisma.item.findUnique({
        where: { id: item.id },
      });

      // Weighted average: (10*80 + 5*90) / 15 = 83.3333
      expect(Number(updatedItem?.weightedAvgCostPrice)).toBeCloseTo(83.3333, 4);
      expect(updatedItem?.currentStockUnits).toBe(15);
    });

    it('should handle tax and miscellaneous charges', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      const purchaseInput = createTestPurchaseInput({
        taxAmount: 142080.0000,
        miscellaneousCharges: 5000.0000,
      });

      purchaseInput.lineItems[0].itemId = item.id;

      const result = await createPurchase(purchaseInput);

      const purchase = await prisma.purchase.findUnique({
        where: { id: result.purchase.id },
      });

      expect(Number(purchase?.taxAmount)).toBe(142080.0000);
      expect(Number(purchase?.miscellaneousCharges)).toBe(5000.0000);
    });

    it('should preserve exact integer values without floating-point errors', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      const purchaseInput = createTestPurchaseInput({
        taxAmount: 8987.0000,
        miscellaneousCharges: 8987.0000,
      });

      purchaseInput.lineItems[0].itemId = item.id;
      purchaseInput.lineItems[0].unitCostPrice = 8987.0000;

      const result = await createPurchase(purchaseInput);

      const purchase = await prisma.purchase.findUnique({
        where: { id: result.purchase.id },
        include: { lineItems: true },
      });

      // Should be exactly 8987.0000, not 8986.9999
      expect(purchase).toBeDefined();
      expect(Number(purchase?.taxAmount)).toBe(8987.0000);
      expect(Number(purchase?.miscellaneousCharges)).toBe(8987.0000);
      expect(purchase?.lineItems.length).toBeGreaterThan(0);
      if (purchase?.lineItems[0]) {
        expect(Number(purchase.lineItems[0].unitCostPrice)).toBe(8987.0000);
      }
    });
  });

  describe('updatePurchase', () => {
    it('should update purchase details', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // Verify item exists
      const verifyItem = await prisma.item.findUnique({ where: { id: item.id } });
      expect(verifyItem).toBeDefined();

      const purchaseInput = createTestPurchaseInput();
      purchaseInput.lineItems[0].itemId = item.id;
      purchaseInput.lineItems[0].sku = item.sku;
      purchaseInput.lineItems[0].name = item.name;
      purchaseInput.lineItems[0].brandNumber = item.brandNumber || '5001';
      purchaseInput.lineItems[0].sizeCode = item.sizeCode || 'BS';
      purchaseInput.lineItems[0].packType = item.packType || 'G';

      const created = await createPurchase(purchaseInput);

      const updated = await updatePurchase(created.purchase.id, {
        ...purchaseInput,
        supplierName: 'Updated Supplier',
        taxAmount: 200.0000,
        miscellaneousCharges: 100.0000,
      });

      expect(updated).toBeDefined();
      expect(updated.purchase).toBeDefined();
      expect(updated.purchase.supplierName).toBe('Updated Supplier');
      expect(Number(updated.purchase.taxAmount)).toBe(200.0000);
      expect(Number(updated.purchase.miscellaneousCharges)).toBe(100.0000);
    });
  });

  describe('deletePurchase', () => {
    it('should delete purchase and adjust inventory', async () => {
      const uniqueSku = `TEST-SKU-${Date.now()}-${Math.random()}`;
      const item = await prisma.item.create({
        data: createTestItem({ sku: uniqueSku }),
      });

      // Verify item exists
      const verifyItem = await prisma.item.findUnique({ where: { id: item.id } });
      expect(verifyItem).toBeDefined();

      const purchaseInput = createTestPurchaseInput();
      purchaseInput.lineItems[0].itemId = item.id;
      purchaseInput.lineItems[0].sku = item.sku;
      purchaseInput.lineItems[0].name = item.name;
      purchaseInput.lineItems[0].brandNumber = item.brandNumber || '5001';
      purchaseInput.lineItems[0].sizeCode = item.sizeCode || 'BS';
      purchaseInput.lineItems[0].packType = item.packType || 'G';
      purchaseInput.lineItems[0].quantityUnits = 10;

      const created = await createPurchase(purchaseInput);

      // Verify stock increased
      let updatedItem = await prisma.item.findUnique({
        where: { id: item.id },
      });
      expect(updatedItem?.currentStockUnits).toBe(10);

      await deletePurchase(created.purchase.id);

      // Verify stock decreased
      updatedItem = await prisma.item.findUnique({
        where: { id: item.id },
      });
      expect(updatedItem?.currentStockUnits).toBe(0);

      // Verify purchase is deleted
      const purchase = await prisma.purchase.findUnique({
        where: { id: created.purchase.id },
      });
      expect(purchase).toBeNull();
    });
  });
});

