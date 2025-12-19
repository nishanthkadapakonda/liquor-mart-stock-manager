import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../../../components/common/StatCard';

describe('StatCard', () => {
  it('should render label and value', () => {
    render(<StatCard label="Test Label" value="100" />);
    
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('should render badge when provided', () => {
    render(<StatCard label="Test Label" value="100" badge="Test Badge" />);
    
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    const TestIcon = () => <span data-testid="test-icon">Icon</span>;
    render(<StatCard label="Test Label" value="100" icon={<TestIcon />} />);
    
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });
});

