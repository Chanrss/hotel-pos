import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { exportDailyBillingExcelBackup, downloadDailyBillingExcel } from './excelBackupService';
import { Bill, BillItem, Kot, RestaurantSettings } from '../types';

// Mock firebase
vi.mock('./firebase', () => ({
  db: {},
  sanitizeForFirestore: (obj: any) => obj,
  getDeviceId: () => 'POS-TEST-TERM'
}));

// Mock firestore functions
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) })
}));

// Mock backupService's triggerBlobDownload and saveDailyBackupRecord
vi.mock('./backupService', () => ({
  saveDailyBackupRecord: vi.fn().mockResolvedValue(undefined),
  triggerBlobDownload: vi.fn()
}));

import { saveDailyBackupRecord, triggerBlobDownload } from './backupService';

describe('excelBackupService: Multi-worksheet Daily Billing Excel Backup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const mockSettings: RestaurantSettings = {
    restaurantName: 'Sri Saravana Bhavan',
    restaurantNameTamil: 'ஸ்ரீ சரவண பவன்',
    address: '12, Car Street, Chidambaram, Tamil Nadu - 608001',
    phone: '+91 94432 10987',
    email: 'accounts@saravanabhavan.pos',
    gstNumber: '33AAAAA0000A1Z5',
    fssaiNumber: '12418008000456',
    businessDayStartHour: '04:00',
    receiptFormat: 'gst_tax_invoice',
    printerType: 'THERMAL_80MM',
    upiId: 'saravanabhavan@sbi'
  };

  const mockBills: Bill[] = [
    {
      id: 'bill-1',
      businessDate: '2026-10-15',
      billNumber: '01',
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      tableNumber: 'T-01',
      userName: 'Vignesh',
      subtotal: 300,
      discount: 20,
      grandTotal: 280,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: 1760520000000,
      items: [
        {
          id: 'item-1',
          billId: 'bill-1',
          itemId: 'm-1',
          itemCode: 'IDL-01',
          itemName: 'Idli (2 Pcs)',
          itemNameTamil: 'இட்லி',
          quantity: 2,
          unitPrice: 50,
          totalPrice: 100,
          priceType: 'NON_AC',
          createdAt: 1760520000000
        },
        {
          id: 'item-2',
          billId: 'bill-1',
          itemId: 'm-2',
          itemCode: 'DOS-01',
          itemName: 'Masala Dosa',
          itemNameTamil: 'மசாலா தோசை',
          quantity: 2,
          unitPrice: 100,
          totalPrice: 200,
          priceType: 'NON_AC',
          createdAt: 1760520000000
        }
      ]
    },
    {
      id: 'bill-2',
      businessDate: '2026-10-15',
      billNumber: '02',
      orderType: 'TAKE_AWAY',
      priceType: 'NON_AC',
      tableNumber: 'Counter',
      userName: 'Cashier-1',
      subtotal: 150,
      discount: 0,
      grandTotal: 150,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: 1760521000000,
      items: [
        {
          id: 'item-3',
          billId: 'bill-2',
          itemId: 'm-3',
          itemCode: 'VAD-01',
          itemName: 'Medu Vada (1 Pc)',
          itemNameTamil: 'மெது வடை',
          quantity: 3,
          unitPrice: 50,
          totalPrice: 150,
          priceType: 'NON_AC',
          createdAt: 1760521000000
        }
      ]
    },
    {
      id: 'bill-3',
      businessDate: '2026-10-15',
      billNumber: '03',
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      tableNumber: 'T-02',
      userName: 'Vignesh',
      subtotal: 100,
      discount: 0,
      grandTotal: 100,
      paymentMethod: 'CASH',
      paymentStatus: 'CANCELLED',
      status: 'CANCELLED',
      cancelReason: 'Customer changed order before cooking',
      cancelledBy: 'Manager',
      reprintCount: 0,
      createdAt: 1760522000000
    }
  ];

  const mockKots: Kot[] = [
    {
      id: 'kot-1',
      kotNumber: 'KOT-01',
      businessDate: '2026-10-15',
      orderType: 'DINE_IN',
      tableNumber: 'T-01',
      waiterId: 'waiter-1',
      waiterName: 'Karthik',
      status: 'BILLED',
      printStatus: 'PRINTED',
      createdAt: 1760519000000,
      updatedAt: 1760520000000,
      createdBy: 'Waiter-Tab',
      itemsCount: 2,
      items: [
        {
          id: 'ki-1',
          kotId: 'kot-1',
          itemId: 'm-1',
          itemCode: 'IDL-01',
          itemName: 'Idli (2 Pcs)',
          quantity: 2,
          priceType: 'NON_AC',
          createdAt: 1760519000000,
          updatedAt: 1760519000000
        }
      ]
    }
  ];

  it('1. Generates a valid .xlsx file with all 6 required worksheets', async () => {
    const result = await exportDailyBillingExcelBackup({
      restaurantSettings: mockSettings,
      businessDate: '2026-10-15',
      bills: mockBills,
      kots: mockKots,
      autoDownload: true
    });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/Sri_Saravana_Bhavan_Daily_Backup_2026-10-15_\d{2}-\d{2}-\d{2}\.xlsx/);
    expect(triggerBlobDownload).toHaveBeenCalled();

    const blob = vi.mocked(triggerBlobDownload).mock.calls[0][1] as Blob;
    expect(blob).toBeInstanceOf(Blob);

    // Read and verify the actual parsed workbook from the generated binary XLSX blob
    const arrayBuffer = await blob.arrayBuffer();
    const parsedWb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    const sheetNames = parsedWb.SheetNames;
    expect(sheetNames).toContain('Daily Summary');
    expect(sheetNames).toContain('Bill Details');
    expect(sheetNames).toContain('Sold Items');
    expect(sheetNames).toContain('KOT Details');
    expect(sheetNames).toContain('Business Day Ledger');
    expect(sheetNames).toContain('Store Profile and GST Settings');
    expect(sheetNames.length).toBe(6);
  });

  it('2. Preserves exact billing numbers and avoids double counting', async () => {
    const result = await exportDailyBillingExcelBackup({
      restaurantSettings: mockSettings,
      businessDate: '2026-10-15',
      bills: mockBills,
      kots: mockKots,
      autoDownload: false
    });

    expect(result.success).toBe(true);
    // 2 completed bills (280 + 150 = 430 total revenue)
    expect(result.totalRevenue).toBe(430);
    // 3 total bills recorded (2 completed + 1 cancelled)
    expect(result.billCount).toBe(3);
  });

  it('3. Writes audit record to /daily_backups with action and exportFormat Export Excel, status, timestamp, billCount, and revenue totals', async () => {
    await exportDailyBillingExcelBackup({
      restaurantSettings: mockSettings,
      businessDate: '2026-10-15',
      bills: mockBills,
      kots: mockKots,
      autoDownload: true
    });

    expect(saveDailyBackupRecord).toHaveBeenCalledTimes(1);
    const savedRecord = vi.mocked(saveDailyBackupRecord).mock.calls[0][0];

    expect(savedRecord.businessDate).toBe('2026-10-15');
    expect(savedRecord.action).toBe('Export Excel');
    expect(savedRecord.exportFormat).toBe('Export Excel');
    expect(savedRecord.status).toBe('SUCCESS');
    expect(savedRecord.scope).toBe('CORE_BILLING');
    expect(typeof savedRecord.timestamp).toBe('number');
    expect(savedRecord.timestamp).toBeGreaterThan(0);
    expect(savedRecord.billCount).toBe(3);
    expect(savedRecord.totalRevenue).toBe(430);
    expect(savedRecord.cashTotal).toBe(280);
    expect(savedRecord.upiTotal).toBe(150);
    expect(savedRecord.cancelledBillCount).toBe(1);
    expect(savedRecord.kotCount).toBe(1);
    expect(savedRecord.fileSizeBytes).toBeGreaterThan(0);
  });

  it('4. Handles empty business day data safely without throwing errors', async () => {
    const result = await exportDailyBillingExcelBackup({
      restaurantSettings: mockSettings,
      businessDate: '2026-10-16',
      bills: [],
      kots: [],
      autoDownload: true
    });

    expect(result.success).toBe(true);
    expect(result.billCount).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(triggerBlobDownload).toHaveBeenCalled();
  });

  it('5. Does not modify or mutate original bill or KOT records during export', async () => {
    const originalSubtotal = mockBills[0].subtotal;
    const originalGrandTotal = mockBills[0].grandTotal;
    const originalKotStatus = mockKots[0].status;

    await exportDailyBillingExcelBackup({
      restaurantSettings: mockSettings,
      businessDate: '2026-10-15',
      bills: mockBills,
      kots: mockKots,
      autoDownload: false
    });

    expect(mockBills[0].subtotal).toBe(originalSubtotal);
    expect(mockBills[0].grandTotal).toBe(originalGrandTotal);
    expect(mockKots[0].status).toBe(originalKotStatus);
  });
});
