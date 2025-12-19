import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from '../../../components/layout/Sidebar';
import { AuthProvider } from '../../../providers/AuthProvider';

// Mock the AuthProvider
vi.mock('../../../providers/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: () => ({
    user: { role: 'ADMIN' },
  }),
}));

describe('Sidebar', () => {
  it('should render navigation items', () => {
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Items / Stock')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
  });

  it('should render desktop variant by default', () => {
    const { container } = render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    // Desktop sidebar should have lg:flex class
    const sidebar = container.querySelector('aside');
    expect(sidebar?.className).toContain('lg:flex');
  });
});

