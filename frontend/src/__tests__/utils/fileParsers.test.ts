import { describe, it, expect, vi } from 'vitest';
import { parsePurchaseUpload } from '../../utils/fileParsers';
import * as XLSX from 'xlsx';

// Mock XLSX
vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));

describe('fileParsers', () => {
  describe('parsePurchaseUpload', () => {
    it('should parse purchase data correctly', async () => {
      const mockData = [
        {
          'brand_no': '5001',
          'size_code': 'BS',
          'issue_type': 'G',
          'brand_name': 'Test Brand',
          'product_type': 'Beer',
          'mrp': 100.0000,
          'cost_price': 80.0000,
          'issue_price': 80.0000,
          'quantity_in_cases': 10,
          'units_per_pack': 12,
        },
      ];

      // Mock XLSX.read to return a workbook
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as any).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as any).mockReturnValue(mockData);

      // Create a mock File object with arrayBuffer method
      const blob = new Blob([''], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const file = Object.assign(
        new File([blob], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        {
          arrayBuffer: async () => new ArrayBuffer(0),
        }
      ) as File;

      const result = await parsePurchaseUpload(file);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].payload.brandNumber).toBe('5001');
      expect(result[0].payload.sizeCode).toBe('BS');
      expect(result[0].payload.packType).toBe('G');
      expect(result[0].payload.mrpPrice).toBe(100.0000);
      // unitCostPrice = issuePrice / unitsPerPack = 80 / 12 = 6.6667
      expect(result[0].payload.unitCostPrice).toBe(6.6667);
      expect(result[0].payload.quantityUnits).toBe(120); // 10 cases * 12 units
    });

    it('should preserve exact values without floating-point errors', async () => {
      const mockData = [
        {
          'brand_no': '5001',
          'size_code': 'BS',
          'issue_type': 'G',
          'brand_name': 'Test Brand',
          'product_type': 'Beer',
          'mrp': 8987.0000,
          'cost_price': 8987.0000,
          'issue_price': 8987.0000,
          'quantity_in_cases': 1,
          'units_per_pack': 1,
        },
      ];

      // Mock XLSX.read to return a workbook
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      (XLSX.read as any).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as any).mockReturnValue(mockData);

      // Create a mock File object with arrayBuffer method
      const blob = new Blob([''], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const file = Object.assign(
        new File([blob], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        {
          arrayBuffer: async () => new ArrayBuffer(0),
        }
      ) as File;

      const result = await parsePurchaseUpload(file);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].payload.mrpPrice).toBe(8987.0000);
      expect(result[0].payload.unitCostPrice).toBe(8987.0000);
      expect(result[0].payload.quantityUnits).toBe(1);
    });
  });
});

