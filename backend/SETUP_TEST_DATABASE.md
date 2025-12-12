# Test Database Setup Guide

## ⚠️ CRITICAL: Tests Now Require a Separate Test Database

**Tests will NOT run without `TEST_DATABASE_URL` set.** This prevents accidental deletion of your main database data.

## Quick Setup

### Option 1: Automatic Setup (Recommended)

**On Windows (PowerShell):**
```powershell
cd backend
.\scripts\setup-test-db.ps1
```

**On Linux/Mac:**
```bash
cd backend
chmod +x scripts/setup-test-db.sh
./scripts/setup-test-db.sh
```

### Option 2: Manual Setup

1. **Create a test database in PostgreSQL:**
   ```sql
   CREATE DATABASE liquor_mart_test;
   ```
   (Replace `liquor_mart_test` with your preferred test database name)

2. **Add to your `.env` file:**
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/liquor_mart
   TEST_DATABASE_URL=postgresql://user:password@localhost:5432/liquor_mart_test
   ```

3. **Run migrations on the test database:**
   ```bash
   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
   ```
   
   **On Windows PowerShell:**
   ```powershell
   $env:DATABASE_URL=$env:TEST_DATABASE_URL; npx prisma migrate deploy
   ```

## Verify Setup

After setup, run tests to verify:
```bash
npm test
```

If `TEST_DATABASE_URL` is not set or matches `DATABASE_URL`, tests will fail with a clear error message.

## Safety Features

✅ **Tests are blocked** if `TEST_DATABASE_URL` is not set  
✅ **Tests are blocked** if `TEST_DATABASE_URL` equals `DATABASE_URL`  
✅ **Clear error messages** guide you to fix the issue  
✅ **Test database connection** is verified before tests run  

## What Changed

- All test files now use `testPrisma` from `helpers/testPrisma.ts`
- `testPrisma` enforces `TEST_DATABASE_URL` requirement
- Tests will fail immediately if test database is not configured
- Your main database is now protected from test cleanup operations

## Troubleshooting

**Error: "TEST_DATABASE_URL environment variable is required"**
- Solution: Follow the setup steps above to create and configure a test database

**Error: "TEST_DATABASE_URL cannot be the same as DATABASE_URL"**
- Solution: Make sure your test database is different from your main database

**Tests fail to connect to test database**
- Solution: Verify the test database exists and `TEST_DATABASE_URL` is correct
- Run migrations: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`

