# PowerShell script to set up a test database for running tests safely

Write-Host "Setting up test database for Liquor Mart Stock Manager..." -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ ERROR: DATABASE_URL is not set in your .env file" -ForegroundColor Red
    exit 1
}

# Extract database name from DATABASE_URL
$mainDbUrl = $env:DATABASE_URL
$mainDbName = $mainDbUrl -replace '.*/([^/?]+)(\?.*)?$', '$1'
$testDbName = "${mainDbName}_test"

Write-Host "Main database: $mainDbName" -ForegroundColor Yellow
Write-Host "Test database: $testDbName" -ForegroundColor Yellow
Write-Host ""

# Extract connection string without database name
$dbConnection = $mainDbUrl -replace '/[^/]+(\?.*)?$', '/postgres$1'

Write-Host "Creating test database..." -ForegroundColor Cyan
try {
    # Try to create the database using psql
    $createDbCommand = "CREATE DATABASE ${testDbName};"
    $env:PGPASSWORD = ($dbConnection -replace '.*:([^@]+)@.*', '$1')
    psql -h localhost -U postgres -c $createDbCommand 2>&1 | Out-Null
    Write-Host "✅ Test database created" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not create database automatically. Please create it manually:" -ForegroundColor Yellow
    Write-Host "   CREATE DATABASE ${testDbName};" -ForegroundColor Yellow
}

# Create TEST_DATABASE_URL from DATABASE_URL
$testDbUrl = $mainDbUrl -replace "/${mainDbName}", "/${testDbName}"

Write-Host ""
Write-Host "Add this line to your .env file:" -ForegroundColor Cyan
Write-Host "TEST_DATABASE_URL=${testDbUrl}" -ForegroundColor Yellow
Write-Host ""

# Check if .env file exists
if (Test-Path .env) {
    $envContent = Get-Content .env -Raw
    
    if ($envContent -match "TEST_DATABASE_URL") {
        # Update existing TEST_DATABASE_URL
        $envContent = $envContent -replace "TEST_DATABASE_URL=.*", "TEST_DATABASE_URL=${testDbUrl}"
        Set-Content .env $envContent
        Write-Host "✅ Updated TEST_DATABASE_URL in .env" -ForegroundColor Green
    } else {
        # Add new TEST_DATABASE_URL
        Add-Content .env "`nTEST_DATABASE_URL=${testDbUrl}"
        Write-Host "✅ Added TEST_DATABASE_URL to .env" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  .env file not found. Please add manually:" -ForegroundColor Yellow
    Write-Host "   TEST_DATABASE_URL=${testDbUrl}" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Running migrations on test database..." -ForegroundColor Cyan
$env:DATABASE_URL = $testDbUrl
npx prisma migrate deploy

Write-Host ""
Write-Host "✅ Test database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run tests safely: npm test" -ForegroundColor Cyan

