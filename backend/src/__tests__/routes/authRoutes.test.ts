import request from 'supertest';
import express from 'express';
import { authRouter } from '../../routes/authRoutes';
import { cleanDatabase, createTestUser } from '../helpers/testHelpers';
import { testPrisma as prisma } from '../helpers/testPrisma';
import bcrypt from 'bcryptjs';
import { comparePassword } from '../../utils/password';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Routes', () => {
  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      await cleanDatabase(prisma);
      
      const userData = createTestUser();
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      await prisma.adminUser.create({
        data: {
          email: userData.email,
          name: userData.name,
          passwordHash: hashedPassword,
          role: userData.role,
        },
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
    });

    it('should reject invalid credentials', async () => {
      const userData = createTestUser();
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      await prisma.adminUser.create({
        data: {
          email: userData.email,
          name: userData.name,
          passwordHash: hashedPassword,
          role: userData.role,
        },
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: userData.email,
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.token).toBeUndefined();
    });
  });
});

