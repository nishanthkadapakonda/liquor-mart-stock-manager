# Testing Guide

This document describes the testing setup and how to run tests for the Liquor Mart Stock & Sales Manager application.

## Backend Tests

### Setup

Backend tests use Jest with TypeScript support. Install dependencies:

```bash
cd backend
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests**: Located in `src/__tests__/services/` and `src/__tests__/utils/`
- **Integration Tests**: Located in `src/__tests__/routes/`
- **Test Helpers**: Located in `src/__tests__/helpers/`

### Test Coverage

The test suite covers:
- Purchase service (create, update, delete, weighted average calculations)
- Day-end report service (create, update, preview, profit calculations)
- Authentication routes
- Item routes
- Purchase routes
- Password utilities
- Number formatting and rounding (4 decimal places)

### Database Setup for Tests

Tests use a separate test database. Set the `DATABASE_URL` environment variable:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/test_db" npm test
```

## Frontend Tests

### Setup

Frontend tests use Vitest with React Testing Library. Install dependencies:

```bash
cd frontend
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in UI mode
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests**: Located in `src/__tests__/utils/` and `src/__tests__/components/`
- **Component Tests**: Located in `src/__tests__/components/`
- **Page Tests**: Located in `src/__tests__/pages/`

### Test Coverage

The test suite covers:
- Formatters (currency, number formatting)
- File parsers (Excel/CSV parsing)
- Components (StatCard, Sidebar)
- Pages (LoginPage)

## Key Test Scenarios

### Floating-Point Precision

Tests verify that numbers are preserved exactly without floating-point errors:
- Entering `8987` should save as `8987.0000`, not `8986.9999`
- All calculations use `roundTo4Decimals` helper function
- Both frontend and backend use consistent rounding logic

### Tax and Miscellaneous Charges

Tests verify:
- Tax and misc charges are stored correctly
- They are included in total purchase calculations
- They are properly displayed in edit forms
- Net profit calculations account for tax/misc

### Weighted Average Cost

Tests verify:
- Weighted average is calculated correctly when multiple purchases exist
- Stock levels are updated correctly
- Inventory values are accurate

## Continuous Integration

To run tests in CI/CD:

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

## Writing New Tests

### Backend Test Example

```typescript
import { describe, it, expect } from '@jest/globals';
import { createPurchase } from '../../services/purchaseService';

describe('PurchaseService', () => {
  it('should create a purchase', async () => {
    const result = await createPurchase({
      purchaseDate: '2025-01-01',
      lineItems: [...],
    });
    
    expect(result.id).toBeDefined();
  });
});
```

### Frontend Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

