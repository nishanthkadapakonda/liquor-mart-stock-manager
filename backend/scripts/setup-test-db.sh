#!/bin/bash

# Script to set up a test database for running tests safely

echo "Setting up test database for Liquor Mart Stock Manager..."
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set in your .env file"
  exit 1
fi

# Extract database name from DATABASE_URL
MAIN_DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
TEST_DB_NAME="${MAIN_DB_NAME}_test"

echo "Main database: $MAIN_DB_NAME"
echo "Test database: $TEST_DB_NAME"
echo ""

# Extract connection details (without database name)
DB_CONNECTION=$(echo $DATABASE_URL | sed 's/\/[^\/]*$/\/postgres/')

echo "Creating test database..."
psql "$DB_CONNECTION" -c "CREATE DATABASE ${TEST_DB_NAME};" 2>/dev/null || {
  echo "⚠️  Database might already exist, continuing..."
}

echo "Setting TEST_DATABASE_URL in .env file..."

# Create TEST_DATABASE_URL from DATABASE_URL
TEST_DB_URL=$(echo $DATABASE_URL | sed "s/\/${MAIN_DB_NAME}/\/${TEST_DB_NAME}/")

# Add or update TEST_DATABASE_URL in .env
if grep -q "TEST_DATABASE_URL" .env; then
  # Update existing TEST_DATABASE_URL
  sed -i.bak "s|TEST_DATABASE_URL=.*|TEST_DATABASE_URL=${TEST_DB_URL}|" .env
else
  # Add new TEST_DATABASE_URL
  echo "" >> .env
  echo "TEST_DATABASE_URL=${TEST_DB_URL}" >> .env
fi

echo "✅ Test database URL added to .env"
echo ""

echo "Running migrations on test database..."
DATABASE_URL="$TEST_DB_URL" npx prisma migrate deploy

echo ""
echo "✅ Test database setup complete!"
echo ""
echo "You can now run tests safely: npm test"

