# Quick Test Database Setup

## ⚠️ Tests are now PROTECTED - they will NOT run without a test database

Tests are blocked to prevent accidentally deleting your main database data.

## Quick Setup (3 steps)

### Step 1: Create Test Database

Open PostgreSQL and run:
```sql
CREATE DATABASE liquor_mart_test;
```

### Step 2: Add to .env file

Add this line to your `backend/.env` file (replace with your actual connection details):
```env
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/liquor_mart_test
```

### Step 3: Run Migrations

**Windows PowerShell:**
```powershell
cd backend
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx prisma migrate deploy
```

**Linux/Mac:**
```bash
cd backend
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
```

## Verify

Run tests:
```bash
npm test
```

If everything is set up correctly, tests will run against the test database only.

## What's Protected

✅ Tests **cannot** run without `TEST_DATABASE_URL`  
✅ Tests **cannot** use the same database as `DATABASE_URL`  
✅ Your main database is **safe** from test cleanup operations  

