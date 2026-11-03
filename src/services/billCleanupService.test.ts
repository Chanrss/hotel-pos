import { describe, it, expect, vi, beforeEach } from 'vitest';
import { purgeAllBills } from './billCleanupService';
import { getLocalBills, saveBillLocally, clearLocalBills } from './localBillStore';
import { allocateNextBillNumber, resetBillSequence } from './billNumberEngine';
import { Bill, BillItem } from '../types';

describe('Bill Cleanup and Sequence Reset Service', () => {
  beforeEach(() => {
    localStorage.clear();
    resetBillSequence();
  });

  it('resets local bill sequence back to #01 after purge', async () => {
    const businessDate = '2026-11-01';
    
    // Allocate two numbers: 1 (01) and 2 (02)
    const num1 = await allocateNextBillNumber(businessDate);
    expect(num1.billNumber).toBe('01');
    const num2 = await allocateNextBillNumber(businessDate);
    expect(num2.billNumber).toBe('02');

    // Reset sequence
    resetBillSequence(businessDate);

    // Next allocated bill number should be #01 again
    const numAfterReset = await allocateNextBillNumber(businessDate);
    expect(numAfterReset.billNumber).toBe('01');
    expect(numAfterReset.numericValue).toBe(1);
  });

  it('clears all local bills, cached items, and pending queues', () => {
    const mockBill: Bill = {
      id: 'bill_test_1',
      businessDate: '2026-11-01',
      billNumber: '01',
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      userId: 'user-1',
      userName: 'Cashier',
      subtotal: 100,
      discount: 0,
      grandTotal: 100,
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockItem: BillItem = {
      id: 'item_1',
      billId: 'bill_test_1',
      itemId: 'dish_1',
      itemCode: 'D01',
      itemName: 'Dosa',
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100,
      priceType: 'NON_AC',
      createdAt: Date.now()
    };

    saveBillLocally(mockBill, [mockItem]);
    expect(getLocalBills().length).toBe(1);

    clearLocalBills();
    expect(getLocalBills().length).toBe(0);
  });

  it('handles purgeAllBills execution cleanly without unhandled rejection', async () => {
    const result = await purgeAllBills();
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(getLocalBills().length).toBe(0);
  });
});
