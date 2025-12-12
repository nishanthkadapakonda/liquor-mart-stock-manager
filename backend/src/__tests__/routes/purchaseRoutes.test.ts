import request from 'supertest';
import express from 'express';
import { purchaseRouter } from '../../routes/purchaseRoutes';
import { cleanDatabase, createTestItem, createTestUser, createTestPurchaseInput } from '../helpers/testHelpers';
import { createPurchase } from '../../services/purchaseService';
import { testPrisma as prisma } from '../helpers/testPrisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
app.use(express.json());

// Mock auth middleware for testing
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret') as any;
      // Set currentAdmin to match the actual middleware
      (req as any).currentAdmin = { id: decoded.userId, email: decoded.email, role: decoded.role };
    } catch (error) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  } else {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
});

app.use('/purchases', purchaseRouter);

describe('Purchase Routes', () => {
  let authToken: string;
  let testUser: any;
  let testItem: any;

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test user with unique email using timestamp and random
    const uniqueEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    const userData = createTestUser({ email: uniqueEmail });
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    testUser = await prisma.adminUser.create({
      data: {
        email: userData.email,
        name: userData.name,
        passwordHash: hashedPassword,
        role: userData.role,
      },
    });

    // Create auth token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test item with unique SKU
    testItem = await prisma.item.create({
      data: createTestItem({ sku: `TEST-SKU-${Date.now()}` }),
    });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  describe('POST /purchases', () => {
    it('should create a purchase with valid data', async () => {
      const response = await request(app)
        .post('/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseDate: new Date().toISOString().split('T')[0],
          supplierName: 'Test Supplier',
          taxAmount: 100.0000,
          miscellaneousCharges: 50.0000,
          lineItems: [
            {
              itemId: testItem.id,
              sku: testItem.sku,
              name: testItem.name,
              brandNumber: testItem.brandNumber || '5001',
              sizeCode: testItem.sizeCode || 'BS',
              packType: testItem.packType || 'G',
              mrpPrice: Number(testItem.mrpPrice),
              unitCostPrice: 80.0000,
              quantityUnits: 10,
            },
          ],
        });

      expect(response.status).toBe(201);
      // The route returns the service result which has { purchase, totals }
      expect(response.body.purchase).toBeDefined();
      expect(response.body.purchase.id).toBeDefined();
      expect(Number(response.body.purchase.taxAmount)).toBe(100.0000);
      expect(Number(response.body.purchase.miscellaneousCharges)).toBe(50.0000);
    });

    it('should preserve exact values without floating-point errors', async () => {
      const response = await request(app)
        .post('/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseDate: new Date().toISOString().split('T')[0],
          taxAmount: 8987.0000,
          miscellaneousCharges: 8987.0000,
          lineItems: [
            {
              itemId: testItem.id,
              name: 'Test Item',
              brandNumber: '5001',
              sizeCode: 'BS',
              packType: 'G',
              mrpPrice: 8987.0000,
              unitCostPrice: 8987.0000,
              quantityUnits: 1,
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body).toBeDefined();
      expect(response.body.purchase).toBeDefined();
      expect(Number(response.body.purchase.taxAmount)).toBe(8987.0000);
      expect(Number(response.body.purchase.miscellaneousCharges)).toBe(8987.0000);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/purchases')
        .send({
          purchaseDate: new Date().toISOString().split('T')[0],
          lineItems: [],
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /purchases', () => {
    it('should return purchases list', async () => {
      // Create a purchase first using the service to ensure proper setup
      const purchaseInput = createTestPurchaseInput();
      purchaseInput.lineItems[0].itemId = testItem.id;
      await createPurchase(purchaseInput);

      const response = await request(app)
        .get('/purchases')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.purchases)).toBe(true);
    });
  });

  describe('GET /purchases/:id', () => {
    it('should return a single purchase', async () => {
      // Create purchase using service
      const purchaseInput = createTestPurchaseInput({
        taxAmount: 100.0000,
        miscellaneousCharges: 50.0000,
      });
      purchaseInput.lineItems[0].itemId = testItem.id;
      const purchase = await createPurchase(purchaseInput);

      const response = await request(app)
        .get(`/purchases/${purchase.purchase.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status !== 200) {
        console.error('Error response:', response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body.purchase).toBeDefined();
      expect(response.body.purchase.id).toBe(purchase.purchase.id);
      expect(Number(response.body.purchase.taxAmount)).toBe(100.0000);
      expect(Number(response.body.purchase.miscellaneousCharges)).toBe(50.0000);
    });
  });
});

