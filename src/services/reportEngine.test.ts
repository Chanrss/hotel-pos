import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportEngine } from './reportEngine';
import { Bill, BillItem, Category } from '../types';
import * as XLSX from 'xlsx';

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

vi.mock('./firebase', () => ({
  db: {}
}));

const mockBills: Bill[] = [
  {
    id: 'b1',
    billNumber: '01',
    businessDate: '2026-08-28',
    orderType: 'DINE_IN',
    priceType: 'NON_AC',
    subtotal: 100,
    discount: 10,
    grandTotal: 90,
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    status: 'COMPLETED',
    createdAt: 1724800000000,
    reprintCount: 0
  },
  {
    id: 'b2',
    billNumber: '02',
    businessDate: '2026-08-28',
    orderType: 'TAKE_AWAY',
    priceType: 'NON_AC',
    subtotal: 50,
    discount: 0,
    grandTotal: 50,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
    status: 'COMPLETED',
    createdAt: 1724803600000,
    reprintCount: 0
  },
  {
    id: 'b3',
    billNumber: '03',
    businessDate: '2026-08-28',
    orderType: 'DINE_IN',
    priceType: 'AC',
    subtotal: 75,
    discount: 0,
    grandTotal: 75,
    paymentMethod: 'CASH',
    paymentStatus: 'REFUNDED',
    status: 'CANCELLED',
    createdAt: 1724807200000,
    reprintCount: 0
  }
];

const mockBillItems: BillItem[] = [
  {
    id: 'bi1',
    billId: 'b1',
    itemId: 'm1',
    itemCode: '101',
    itemName: 'Masala Dosa',
    quantity: 1,
    unitPrice: 70,
    totalPrice: 70,
    priceType: 'NON_AC',
    businessDate: '2026-08-28',
    createdAt: 1724800000000
  },
  {
    id: 'bi2',
    billId: 'b1',
    itemId: 'm2',
    itemCode: '102',
    itemName: 'Filter Coffee',
    quantity: 1,
    unitPrice: 30,
    totalPrice: 30,
    priceType: 'NON_AC',
    businessDate: '2026-08-28',
    createdAt: 1724800000000
  },
  {
    id: 'bi3',
    billId: 'b2',
    itemId: 'm1',
    itemCode: '101',
    itemName: 'Masala Dosa',
    quantity: 1,
    unitPrice: 50,
    totalPrice: 50,
    priceType: 'NON_AC',
    businessDate: '2026-08-28',
    createdAt: 1724803600000
  }
];

describe('ReportEngine (Sales Analytics & Business Intelligence)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ReportEngine, 'fetchBillsInRange').mockResolvedValue(mockBills);
    vi.spyOn(ReportEngine, 'fetchBillItemsInRange').mockResolvedValue(mockBillItems);
  });

  it('generates item-wise sales report with financial permissions', async () => {
    const report = await ReportEngine.generateItemWiseReport('2026-08-28', '2026-08-28', true);

    expect(report.length).toBe(2);
    // Masala Dosa: 1 from b1 + 1 from b2 = 2 sold, orderCount = 2
    const dosa = report.find((r) => r.itemCode === '101');
    expect(dosa).toBeDefined();
    expect(dosa?.quantitySold).toBe(2);
    expect(dosa?.orderCount).toBe(2);
    expect(dosa?.salesValue).toBe(120); // 70 + 50
  });

  it('masks financial data when hasFinancialPermission is false (RBAC security)', async () => {
    const report = await ReportEngine.generateItemWiseReport('2026-08-28', '2026-08-28', false);

    const dosa = report.find((r) => r.itemCode === '101');
    expect(dosa).toBeDefined();
    expect(dosa?.quantitySold).toBe(2);
    // Financial fields must be undefined for non-permitted roles (e.g. standard waiter/cook)
    expect(dosa?.salesValue).toBeUndefined();
    expect(dosa?.unitPrice).toBeUndefined();
  });

  it('generates daily summary report separating completed and cancelled bills', async () => {
    const summary = await ReportEngine.generateDailySummaryReport('2026-08-28', '2026-08-28', true);

    expect(summary.length).toBe(1);
    const day = summary[0];
    expect(day.date).toBe('2026-08-28');
    expect(day.billCount).toBe(2); // 2 completed bills
    expect(day.cancelledCount).toBe(1); // 1 cancelled bill
    expect(day.totalSales).toBe(140); // 90 + 50
  });

  it('generates category-wise report rollup', async () => {
    const categories: Category[] = [
      { id: 'cat_tiffin', name: 'Tiffin', active: true, createdAt: 1724000000000 }
    ];
    const catReport = await ReportEngine.generateCategoryWiseReport('2026-08-28', '2026-08-28', categories, true);

    expect(catReport.length).toBeGreaterThan(0);
    const totalQty = catReport.reduce((sum, c) => sum + c.totalQuantity, 0);
    expect(totalQty).toBe(3); // 2 dosas + 1 coffee
  });

  it('exports formatted report data to Excel spreadsheet workbook', () => {
    const sampleData = [
      { 'Item Name': 'Masala Dosa', 'Qty Sold': 25, 'Total Sales (₹)': 1750 },
      { 'Item Name': 'Filter Coffee', 'Qty Sold': 40, 'Total Sales (₹)': 1200 }
    ];

    ReportEngine.exportToExcel(sampleData, 'daily_sales_august_28');
    expect(XLSX.writeFile).toHaveBeenCalledWith(
      expect.anything(),
      'daily_sales_august_28.xlsx'
    );
  });

  it('generates automatic DD-MM-YYYY backup filenames with hyphens (SSB_DD-MM-YYYY.pdf & .xlsx)', () => {
    expect(ReportEngine.formatDateDDMMYYYY('2026-11-02')).toBe('02-11-2026');
    expect(ReportEngine.getDailyBackupFileName('2026-11-02', 'pdf')).toBe('SSB_02-11-2026.pdf');
    expect(ReportEngine.getDailyBackupFileName('2026-11-02', 'xlsx')).toBe('SSB_02-11-2026.xlsx');
    expect(ReportEngine.getDailyBackupFileName('2026-11-02', 'pdf')).not.toContain('/');
  });

  it('generates Daily Sales Backup Report excluding cancelled bills and removing Item Code from rows', async () => {
    const backup = await ReportEngine.generateDailySalesBackupReport('2026-08-28');

    expect(backup.formattedDate).toBe('28-08-2026');
    expect(backup.pdfFileName).toBe('SSB_28-08-2026.pdf');
    expect(backup.excelFileName).toBe('SSB_28-08-2026.xlsx');
    // 2 completed bills (b1 and b2); b3 is CANCELLED and must be excluded
    expect(backup.totalBills).toBe(2);
    // 3 total items sold (1 Masala Dosa + 1 Filter Coffee in b1, 1 Masala Dosa in b2)
    expect(backup.totalItemsSold).toBe(3);
    // Total daily sales = 70 + 30 + 50 = 150
    expect(backup.totalDailySales).toBe(150);
    expect(backup.rows.length).toBe(3);

    // Verify exact row structure and that itemCode is not present on DailySalesBackupRow
    backup.rows.forEach((row, index) => {
      expect(row.sno).toBe(index + 1);
      expect(row.date).toBe('28-08-2026');
      expect(row.itemName).toBeTruthy();
      expect((row as any).itemCode).toBeUndefined();
    });
  });

  it('exports Daily Sales Backup Excel workbook with matching totals and no Item Code column', async () => {
    const backup = await ReportEngine.generateDailySalesBackupReport('2026-08-28');
    const fileName = ReportEngine.exportDailySalesBackupExcel(backup);

    expect(fileName).toBe('SSB_28-08-2026.xlsx');
    expect(XLSX.writeFile).toHaveBeenCalledWith(
      expect.anything(),
      'SSB_28-08-2026.xlsx'
    );

    const wb = vi.mocked(XLSX.writeFile).mock.calls.at(-1)?.[0] as XLSX.WorkBook;
    expect(wb).toBeDefined();
    expect(wb.SheetNames).toContain('Daily Sales Report');
    expect(wb.SheetNames).toContain('Daily Summary');

    const ws = wb.Sheets['Daily Sales Report'];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    const headerRow = rows.find((r) => Array.isArray(r) && r.includes('S.No') && r.includes('Bill No'));
    expect(headerRow).toEqual(['S.No', 'Bill No', 'Date', 'Time', 'Item Name', 'Quantity', 'Unit Price', 'Total']);
    expect(headerRow).not.toContain('Item Code');
  });
});
