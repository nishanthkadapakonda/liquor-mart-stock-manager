import { PrismaClient } from '@prisma/client';

// CRITICAL: Tests MUST use a separate test database to prevent data loss
// This function enforces that TEST_DATABASE_URL is set
const getTestDatabaseUrl = () => {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  const mainDbUrl = process.env.DATABASE_URL;
  
  if (!testDbUrl) {
    console.error('');
    console.error('❌ ERROR: TEST_DATABASE_URL is not set!');
    console.error('');
    console.error('Tests are BLOCKED to prevent deleting your main database data.');
    console.error('');
    console.error('To fix this:');
    console.error('1. Create a test database: CREATE DATABASE liquor_mart_test;');
    console.error('2. Add to your .env file:');
    console.error('   TEST_DATABASE_URL=postgresql://user:password@localhost:5432/liquor_mart_test');
    console.error('3. Run migrations on test DB:');
    console.error('   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy');
    console.error('');
    
    // Prevent tests from running if TEST_DATABASE_URL is not set
    throw new Error(
      'TEST_DATABASE_URL environment variable is required. ' +
      'Tests cannot run without a separate test database to prevent data loss.'
    );
  }
  
  // Additional safety check: ensure test DB is different from main DB
  if (testDbUrl === mainDbUrl) {
    console.error('');
    console.error('❌ ERROR: TEST_DATABASE_URL cannot be the same as DATABASE_URL!');
    console.error('');
    console.error('This would cause tests to delete your main database data.');
    console.error('Please set TEST_DATABASE_URL to a different database.');
    console.error('');
    throw new Error(
      'TEST_DATABASE_URL must be different from DATABASE_URL. ' +
      'Using the same database for tests would delete all your data!'
    );
  }
  
  return testDbUrl;
};

// Create Prisma client with test database URL
// This will throw an error if TEST_DATABASE_URL is not set
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

