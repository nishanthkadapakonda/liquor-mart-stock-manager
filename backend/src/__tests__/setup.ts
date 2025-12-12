// Test setup file
// This file runs before all tests

// CRITICAL: Tests MUST use a separate test database
// The testPrisma helper will throw an error if TEST_DATABASE_URL is not set
// This prevents accidental deletion of main database data

// Import testPrisma to trigger the safety check
import { testPrisma } from './helpers/testPrisma';

// Verify test database connection on startup
beforeAll(async () => {
  try {
    await testPrisma.$connect();
    console.log('✅ Connected to test database:', process.env.TEST_DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
  } catch (error) {
    console.error('❌ Failed to connect to test database');
    throw error;
  }
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

