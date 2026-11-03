import { describe, it, expect } from 'vitest';
import { calculateDailyNetSales, getValidCompletedBills, isBillSuperseded, getReplacementBill } from './salesCalculationEngine';
import { Bill } from '../types';

describe('SalesCalculationEngine – SRI SARAVANABHAVAN POS Net Sales Calculation', () => {
  const baseBill: Bill = {
    id: 'bill_2026-11-01_01_1001',
    businessDate: '2026-11-01',
    billNumber: '01',
    orderType: 'DINE_IN',
    priceType: 'NON_AC',
    userId: 'user_1',
    userName: 'Cashier',
    subtotal: 500,
    discount: 0,
    grandTotal: 500,
    status: 'COMPLETED',
    reprintCount: 0,
    paymentMethod: 'CASH',
    createdAt: 1000,
    updatedAt: 1000
  };

  it('calculates net sales correctly for valid completed bills', () => {
    const bill1: Bill = { ...baseBill, id: 'bill_1', billNumber: '01', grandTotal: 250 };
    const bill2: Bill = { ...baseBill, id: 'bill_2', billNumber: '02', grandTotal: 350 };

    const result = calculateDailyNetSales([bill1, bill2]);
    expect(result.netSales).toBe(600);
    expect(result.validBillCount).toBe(2);
    expect(result.cancelledCount).toBe(0);
    expect(result.cancelledAmount).toBe(0);
  });

  it('1. PREVENT DUPLICATE SALES FROM REPRINTING: reprinting existing bill does not increase net sales', () => {
    // Bill originally generated
    const originalBill: Bill = {
      ...baseBill,
      id: 'bill_1',
      billNumber: '01',
      grandTotal: 500,
      reprintCount: 0
    };

    // After 1st reprint (same ID, reprintCount = 1)
    const reprint1: Bill = {
      ...originalBill,
      reprintCount: 1,
      lastReprintedAt: 2000,
      updatedAt: 2000
    };

    // Array containing the updated reprinted bill
    const resultAfterReprint = calculateDailyNetSales([reprint1]);
    expect(resultAfterReprint.netSales).toBe(500);
    expect(resultAfterReprint.validBillCount).toBe(1);

    // If both original copy and reprint copy exist in memory simultaneously
    const resultWithDuplicateObjects = calculateDailyNetSales([originalBill, reprint1]);
    expect(resultWithDuplicateObjects.netSales).toBe(500);
    expect(resultWithDuplicateObjects.validBillCount).toBe(1);

    // Even if printed 5 times
    const reprint5: Bill = { ...originalBill, reprintCount: 5, updatedAt: 5000 };
    const resultAfter5Reprints = calculateDailyNetSales([originalBill, reprint1, reprint5]);
    expect(resultAfter5Reprints.netSales).toBe(500);
    expect(resultAfter5Reprints.validBillCount).toBe(1);
  });

  it('2. EXCLUDE CANCELLED BILLS: cancelled bills are strictly deducted from net sales', () => {
    const bill1: Bill = { ...baseBill, id: 'bill_1', billNumber: '01', grandTotal: 300, status: 'COMPLETED' };
    const bill2: Bill = {
      ...baseBill,
      id: 'bill_2',
      billNumber: '02',
      grandTotal: 200,
      status: 'CANCELLED',
      cancelReason: 'Customer changed order'
    };

    const result = calculateDailyNetSales([bill1, bill2]);
    // Net sales should be only 300, 200 must be deducted/excluded
    expect(result.netSales).toBe(300);
    expect(result.validBillCount).toBe(1);
    expect(result.cancelledCount).toBe(1);
    expect(result.cancelledAmount).toBe(200);

    // Valid bills list should contain only bill1
    expect(result.validBills.map(b => b.id)).toEqual(['bill_1']);
  });

  it('3. HANDLE RE-BILLS CORRECTLY: superseded original bill is excluded, replacement counted only once', () => {
    // Bill 1 was created for 400
    const bill1Cancelled: Bill = {
      ...baseBill,
      id: 'bill_1',
      billNumber: '01',
      grandTotal: 400,
      status: 'CANCELLED',
      cancelReason: 'Re-billed as Bill #02',
      replacementBillId: 'bill_2'
    };

    // Bill 2 is the replacement re-bill for 450
    const bill2Replacement: Bill = {
      ...baseBill,
      id: 'bill_2',
      billNumber: '02',
      grandTotal: 450,
      status: 'COMPLETED',
      originalBillId: 'bill_1',
      replacesBillNumber: '01',
      isRebill: true
    };

    expect(isBillSuperseded(bill1Cancelled, [bill1Cancelled, bill2Replacement])).toBe(true);
    expect(getReplacementBill(bill1Cancelled, [bill1Cancelled, bill2Replacement])?.id).toBe('bill_2');

    const result = calculateDailyNetSales([bill1Cancelled, bill2Replacement]);
    // Total Net Sales must be ONLY 450 (the replacement bill), NOT 400 + 450 = 850
    expect(result.netSales).toBe(450);
    expect(result.validBillCount).toBe(1);
    expect(result.cancelledCount).toBe(1);
    expect(result.cancelledAmount).toBe(400);
    expect(result.rebillCount).toBe(1);
    expect(result.validBills.map(b => b.id)).toEqual(['bill_2']);
  });

  it('4. PREVENTS DUPLICATE BILL ENTRIES: duplicate records with same transactionId are not double-counted', () => {
    const txId = 'tx-unique-12345';
    const billA: Bill = { ...baseBill, id: 'bill_a', transactionId: txId, grandTotal: 500, createdAt: 1000 };
    const billB: Bill = { ...baseBill, id: 'bill_b', transactionId: txId, grandTotal: 500, createdAt: 1001 };

    const result = calculateDailyNetSales([billA, billB]);
    expect(result.netSales).toBe(500);
    expect(result.validBillCount).toBe(1);
  });

  it('5. ORDER HISTORY: all records remain intact in the list', () => {
    const bill1: Bill = { ...baseBill, id: 'bill_1', billNumber: '01', grandTotal: 200, status: 'CANCELLED' };
    const bill2: Bill = { ...baseBill, id: 'bill_2', billNumber: '02', grandTotal: 300, status: 'COMPLETED', isRebill: true, originalBillId: 'bill_1' };

    const allBills = [bill1, bill2];
    expect(allBills.length).toBe(2); // History preserved

    const validBills = getValidCompletedBills(allBills);
    expect(validBills.length).toBe(1);
    expect(validBills[0].id).toBe('bill_2');
  });
});
