import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber } from '../../utils/formatters';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it('should format currency with 4 decimal places', () => {
      const result = formatCurrency(1234.5678);
      expect(result).toContain('1,234.5678');
      expect(result).toContain('₹');
    });

    it('should handle exact integers without floating-point errors', () => {
      const result = formatCurrency(8987);
      expect(result).toContain('8,987.0000');
      expect(result).not.toContain('8986.9999');
    });

    it('should handle null and undefined', () => {
      expect(formatCurrency(null)).toContain('0.0000');
      expect(formatCurrency(undefined)).toContain('0.0000');
    });

    it('should round to 4 decimal places correctly', () => {
      const result = formatCurrency(1234.56789);
      expect(result).toContain('1,234.5679');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers without decimals', () => {
      const result = formatNumber(1234);
      expect(result).toBe('1,234');
    });

    it('should handle large numbers', () => {
      const result = formatNumber(1234567);
      expect(result).toBe('12,34,567');
    });

    it('should handle null and undefined', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });
  });
});

