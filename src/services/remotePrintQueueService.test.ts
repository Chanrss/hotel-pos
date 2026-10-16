import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RemotePrintQueueService } from './remotePrintQueueService';
import { Kot, KotItem } from '../types';

vi.mock('./firebase', () => ({
  db: {},
  getDeviceId: () => 'POS-TEST-001',
  sanitizeForFirestore: (data: any) => data
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  getDocs: vi.fn(async () => ({ empty: true, size: 0, docs: [] })),
  onSnapshot: vi.fn((_q, callback) => {
    return () => {};
  }),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(() => ({
    delete: vi.fn(),
    commit: vi.fn(async () => {})
  }))
}));

vi.mock('./PrintService', () => ({
  PrintService: {
    printKot: vi.fn(async () => ({ success: true })),
    printReceipt: vi.fn(async () => ({ success: true })),
    testPrint: vi.fn(async () => ({ success: true }))
  }
}));

describe('RemotePrintQueueService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('allows toggling primary print server role', () => {
    RemotePrintQueueService.setPrimaryPrintServer(true);
    expect(RemotePrintQueueService.isPrimaryPrintServer()).toBe(true);

    RemotePrintQueueService.setPrimaryPrintServer(false);
    expect(RemotePrintQueueService.isPrimaryPrintServer()).toBe(false);
  });

  it('allows toggling notification chime sound setting', () => {
    expect(RemotePrintQueueService.isSoundAlertEnabled()).toBe(true);
    RemotePrintQueueService.setSoundAlertEnabled(false);
    expect(RemotePrintQueueService.isSoundAlertEnabled()).toBe(false);
  });

  it('queues a remote KOT print job with PENDING status and correct device metadata', async () => {
    const mockKot: Kot = {
      id: 'kot_123',
      kotNumber: '05',
      businessDate: '2026-10-14',
      orderType: 'DINE_IN',
      tableNumber: 'T-4',
      waiterId: 'waiter_ramesh',
      waiterName: 'Ramesh',
      status: 'OPEN',
      printStatus: 'PENDING',
      printCount: 0,
      items: [],
      itemsCount: 2,
      createdBy: 'waiter_ramesh',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockItems: KotItem[] = [
      {
        id: 'ki_1',
        kotId: 'kot_123',
        itemId: 'item_dosa',
        itemCode: 'D01',
        itemName: 'Ghee Roast Dosa',
        quantity: 2,
        priceType: 'NON_AC',
        unitPrice: 90,
        status: 'PENDING',
        printStatus: 'PENDING',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const result = await RemotePrintQueueService.queueRemoteKotPrint(mockKot, mockItems, {
      sourceUserName: 'Ramesh'
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBeDefined();
    expect(result.jobId.startsWith('pjob_')).toBe(true);
  });

  it('queues a remote Bill print job successfully', async () => {
    const mockBill: any = {
      id: 'bill_999',
      billNumber: '105',
      businessDate: '2026-10-14',
      orderType: 'DINE_IN',
      tableNumber: 'T-2',
      cashierId: 'c1',
      cashierName: 'Sundar',
      totalAmount: 350,
      createdAt: Date.now()
    };

    const result = await RemotePrintQueueService.queueRemoteBillPrint(mockBill, []);
    expect(result.success).toBe(true);
    expect(result.jobId.startsWith('pjob_bill_')).toBe(true);
  });

  it('generates a descriptive device label based on current server role', () => {
    RemotePrintQueueService.setPrimaryPrintServer(true);
    expect(RemotePrintQueueService.getDeviceLabel()).toContain('Counter POS');

    RemotePrintQueueService.setPrimaryPrintServer(false);
    expect(RemotePrintQueueService.getDeviceLabel()).toContain('Waiter Mobile');
  });
});
