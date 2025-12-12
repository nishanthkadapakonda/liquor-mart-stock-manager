import request from 'supertest';
import express from 'express';
import { itemRouter } from '../../routes/itemRoutes';
import { cleanDatabase, createTestItem, createTestUser } from '../helpers/testHelpers';
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

app.use('/items', itemRouter);

describe('Item Routes', () => {
  let authToken: string;
  let testUser: any;

  beforeEach(async () => {
    await cleanDatabase(prisma);

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

    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  describe('POST /items', () => {
    it('should create an item', async () => {
      const itemData = createTestItem({ sku: `TEST-SKU-${Date.now()}` });

      const response = await request(app)
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send(itemData);

      expect(response.status).toBe(201);
      expect(response.body.item).toBeDefined();
      expect(response.body.item.id).toBeDefined();
      expect(response.body.item.name).toBe(itemData.name);
      expect(response.body.item.sku).toBeDefined();
    });

    it('should preserve exact MRP values', async () => {
      const itemData = createTestItem({ sku: `TEST-SKU-${Date.now()}`, mrpPrice: 8987.0000 });

      const response = await request(app)
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send(itemData);

      expect(response.status).toBe(201);
      expect(response.body.item).toBeDefined();
      expect(Number(response.body.item.mrpPrice)).toBe(8987.0000);
    });
  });

  describe('GET /items', () => {
    it('should return items list', async () => {
      await prisma.item.create({
        data: createTestItem({ sku: `TEST-SKU-${Date.now()}` }),
      });

      const response = await request(app)
        .get('/items')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /items/:id', () => {
    it('should update an item', async () => {
      const item = await prisma.item.create({
        data: createTestItem({ sku: `TEST-SKU-${Date.now()}` }),
      });

      const response = await request(app)
        .put(`/items/${item.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Item Name',
          mrpPrice: 150.0000,
        });

      expect(response.status).toBe(200);
      expect(response.body.item).toBeDefined();
      expect(response.body.item.name).toBe('Updated Item Name');
      expect(Number(response.body.item.mrpPrice)).toBe(150.0000);
    });
  });
});

