# Test Database Setup

## ⚠️ IMPORTANT WARNING

**The tests were deleting all data from your main database!** 

This has been fixed, but you need to set up a separate test database to prevent this from happening again.

## Setup Instructions

### Option 1: Use a Separate Test Database (Recommended)

1. Create a separate test database in PostgreSQL:
   ```sql
   CREATE DATABASE liquor_mart_test;
   ```

2. Add `TEST_DATABASE_URL` to your `.env` file:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/liquor_mart
   TEST_DATABASE_URL=postgresql://user:password@localhost:5432/liquor_mart_test
   ```

3. Run migrations on the test database:
   ```bash
   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
   ```

### Option 2: Restore Your Data

If your data was deleted, you can:

1. **If you have a backup**: Restore from backup
2. **If you have migrations**: Re-run your seed script:
   ```bash
   npm run seed
   ```

## What Was Fixed

- Created `testPrisma.ts` helper that uses `TEST_DATABASE_URL` if available
- Updated all test files to use the test Prisma client
- Added warnings if tests run against the main database

## Running Tests Safely

Tests will now:
- Use `TEST_DATABASE_URL` if set (safe)
- Warn you if using `DATABASE_URL` (will delete data!)
- Clean the database before each test (this is normal for tests)

## Restoring Your Data

If you need to restore your data:

1. Check if you have database backups
2. Re-run the seed script: `npm run seed`
3. Re-enter your data manually through the application

