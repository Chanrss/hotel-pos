import { Bill } from '../types';

export interface NetSalesBreakdown {
  netSales: number;
  validBillCount: number;
  validBills: Bill[];
  cancelledCount: number;
  cancelledAmount: number;
  rebillCount: number;
  supersededCount: number;
  cashSales: number;
  upiSales: number;
  dineInCount: number;
  takeAwayCount: number;
  dineInSales: number;
  takeAwaySales: number;
  acSales: number;
  nonAcSales: number;
  acCount: number;
  nonAcCount: number;
}

/**
 * Standardizes bill numbers for exact comparisons (e.g. '1' vs '01').
 */
function normalizeBillNumber(num?: string | number): string {
  if (num === undefined || num === null) return '';
  const str = String(num).trim();
  const val = parseInt(str, 10);
  if (!isNaN(val) && val < 10 && !str.startsWith('0')) {
    return `0${val}`;
  }
  return str;
}

/**
 * Identifies all superseded bill IDs (bills that have been cancelled and replaced by a re-bill).
 */
export function getSupersededBillIds(bills: Bill[]): Set<string> {
  const supersededIds = new Set<string>();

  for (const b of bills) {
    if (!b) continue;

    // Direct reference by ID
    if (b.originalBillId) {
      supersededIds.add(b.originalBillId);
    }

    // Direct reference on original bill pointing to replacement
    if (b.replacementBillId) {
      supersededIds.add(b.id);
    }

    // Reference by bill number within the same business date
    if (b.replacesBillNumber && b.businessDate) {
      const targetNorm = normalizeBillNumber(b.replacesBillNumber);
      for (const candidate of bills) {
        if (
          candidate.id !== b.id &&
          candidate.businessDate === b.businessDate &&
          normalizeBillNumber(candidate.billNumber) === targetNorm
        ) {
          supersededIds.add(candidate.id);
        }
      }
    }

    // Check cancellation reason mentioning replacement
    if (b.cancelReason && typeof b.cancelReason === 'string') {
      const match = b.cancelReason.match(/replaced by bill\s*#?([0-9]+)/i) ||
                    b.cancelReason.match(/re-?billed as\s*#?([0-9]+)/i);
      if (match && match[1]) {
        // b itself is replaced
        supersededIds.add(b.id);
      }
    }
  }

  return supersededIds;
}

/**
 * Checks if an individual bill is superseded by a replacement bill.
 */
export function isBillSuperseded(bill: Bill, allBills: Bill[]): boolean {
  if (!bill) return false;
  const supersededIds = getSupersededBillIds(allBills);
  return supersededIds.has(bill.id);
}

/**
 * Finds the valid replacement bill for an original or cancelled bill, if any.
 */
export function getReplacementBill(bill: Bill, allBills: Bill[]): Bill | undefined {
  if (!bill) return undefined;
  const targetNorm = normalizeBillNumber(bill.billNumber);

  return allBills.find((b) => {
    if (b.id === bill.id) return false;
    if (b.status === 'CANCELLED') return false;

    if (b.originalBillId === bill.id) return true;
    if (bill.replacementBillId === b.id) return true;

    if (
      b.replacesBillNumber &&
      b.businessDate === bill.businessDate &&
      normalizeBillNumber(b.replacesBillNumber) === targetNorm
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Deduplicates and filters a list of bills to return only unique, valid, completed transactions.
 *
 * Rules:
 * 1. Excludes all cancelled bills (status === 'CANCELLED').
 * 2. Excludes superseded original bills that have been replaced by a re-bill.
 * 3. Prevents duplicate counting from multiple printings/reprints of the same bill.
 * 4. Deduplicates identical bill records by bill ID and transaction reference.
 */
export function getValidCompletedBills(bills: Bill[]): Bill[] {
  if (!bills || !Array.isArray(bills) || bills.length === 0) {
    return [];
  }

  // 1. Deduplicate by unique bill ID, selecting the most recently updated entry
  const idMap = new Map<string, Bill>();
  for (const b of bills) {
    if (!b || !b.id) continue;
    const existing = idMap.get(b.id);
    if (!existing || (b.updatedAt || 0) >= (existing.updatedAt || 0)) {
      idMap.set(b.id, b);
    }
  }

  const uniqueByIdBills = Array.from(idMap.values());

  // 2. Identify all superseded bills
  const supersededIds = getSupersededBillIds(uniqueByIdBills);

  // 3. Filter out cancelled, superseded, and non-completed bills
  const activeCandidates = uniqueByIdBills.filter((b) => {
    // Exclude cancelled bills
    const status = String(b.status || '').toUpperCase();
    if (status === 'CANCELLED') return false;

    // Exclude superseded bills
    if (supersededIds.has(b.id)) return false;

    // Only count completed or active paid bills
    return status === 'COMPLETED' || b.paymentStatus === 'PAID' || !b.status;
  });

  // 4. Secondary deduplication by transactionId (if set) and by (businessDate + billNumber)
  const finalBills: Bill[] = [];
  const seenTx = new Set<string>();
  const seenDateNumber = new Map<string, Bill>();

  for (const b of activeCandidates) {
    // If transactionId is present and already processed, do not double-count
    if (b.transactionId) {
      if (seenTx.has(b.transactionId)) {
        continue;
      }
      seenTx.add(b.transactionId);
    }

    // Check (businessDate + billNumber) collision for completed bills
    const key = `${b.businessDate || ''}_${normalizeBillNumber(b.billNumber)}`;
    const existing = seenDateNumber.get(key);
    if (existing) {
      // If one is marked as re-bill of another, prefer the re-bill
      if (b.isRebill || b.originalBillId) {
        // Replace previous
        const idx = finalBills.indexOf(existing);
        if (idx !== -1) finalBills.splice(idx, 1);
        seenDateNumber.set(key, b);
        finalBills.push(b);
      }
      // Otherwise keep the latest one, skip duplicate
      continue;
    }

    seenDateNumber.set(key, b);
    finalBills.push(b);
  }

  return finalBills;
}

/**
 * Calculates accurate Daily Net Sales according to the SRI SARAVANABHAVAN POS rules:
 *
 * Total Net Sales = Sum of all unique, valid, completed sales transactions for the selected business day.
 * Excludes:
 * - Cancelled bills (deducted immediately, 0 contribution to Net Sales)
 * - Duplicate bill entries
 * - Reprints of existing bills (printing again NEVER increases sales)
 * - Superseded original bills replaced by valid re-bills
 */
export function calculateDailyNetSales(bills: Bill[]): NetSalesBreakdown {
  if (!bills || !Array.isArray(bills) || bills.length === 0) {
    return {
      netSales: 0,
      validBillCount: 0,
      validBills: [],
      cancelledCount: 0,
      cancelledAmount: 0,
      rebillCount: 0,
      supersededCount: 0,
      cashSales: 0,
      upiSales: 0,
      dineInCount: 0,
      takeAwayCount: 0,
      dineInSales: 0,
      takeAwaySales: 0,
      acSales: 0,
      nonAcSales: 0,
      acCount: 0,
      nonAcCount: 0
    };
  }

  // 1. Deduplicate incoming list by unique bill ID
  const idMap = new Map<string, Bill>();
  for (const b of bills) {
    if (!b || !b.id) continue;
    const existing = idMap.get(b.id);
    if (!existing || (b.updatedAt || 0) >= (existing.updatedAt || 0)) {
      idMap.set(b.id, b);
    }
  }

  const allUniqueBills = Array.from(idMap.values());
  const supersededIds = getSupersededBillIds(allUniqueBills);

  // 2. Tally cancellations
  let cancelledCount = 0;
  let cancelledAmount = 0;
  for (const b of allUniqueBills) {
    const isCancelled = String(b.status || '').toUpperCase() === 'CANCELLED';
    if (isCancelled) {
      cancelledCount++;
      const amt = Number(b.grandTotal !== undefined && b.grandTotal !== null ? b.grandTotal : (b.subtotal || 0));
      cancelledAmount += (isNaN(amt) ? 0 : amt);
    }
  }

  // 3. Extract valid completed bills (excluding cancelled, superseded, and duplicates)
  const validBills = getValidCompletedBills(allUniqueBills);

  // 4. Calculate Net Sales and breakdown
  let netSales = 0;
  let cashSales = 0;
  let upiSales = 0;
  let rebillCount = 0;
  let dineInCount = 0;
  let takeAwayCount = 0;
  let dineInSales = 0;
  let takeAwaySales = 0;
  let acSales = 0;
  let nonAcSales = 0;
  let acCount = 0;
  let nonAcCount = 0;

  for (const b of validBills) {
    const amt = Number(b.grandTotal !== undefined && b.grandTotal !== null ? b.grandTotal : (b.subtotal || 0));
    const safeAmt = isNaN(amt) ? 0 : amt;

    netSales += safeAmt;

    const method = String(b.paymentMethod || 'CASH').toUpperCase();
    if (method === 'CASH') {
      cashSales += safeAmt;
    } else {
      upiSales += safeAmt;
    }

    if (b.orderType === 'TAKE_AWAY') {
      takeAwayCount++;
      takeAwaySales += safeAmt;
    } else {
      dineInCount++;
      dineInSales += safeAmt;
    }

    if (b.priceType === 'AC') {
      acCount++;
      acSales += safeAmt;
    } else {
      nonAcCount++;
      nonAcSales += safeAmt;
    }

    if (b.isRebill || b.originalBillId || b.replacesBillNumber) {
      rebillCount++;
    }
  }

  return {
    netSales: Math.round(netSales * 100) / 100,
    validBillCount: validBills.length,
    validBills,
    cancelledCount,
    cancelledAmount: Math.round(cancelledAmount * 100) / 100,
    rebillCount,
    supersededCount: supersededIds.size,
    cashSales: Math.round(cashSales * 100) / 100,
    upiSales: Math.round(upiSales * 100) / 100,
    dineInCount,
    takeAwayCount,
    dineInSales: Math.round(dineInSales * 100) / 100,
    takeAwaySales: Math.round(takeAwaySales * 100) / 100,
    acSales: Math.round(acSales * 100) / 100,
    nonAcSales: Math.round(nonAcSales * 100) / 100,
    acCount,
    nonAcCount
  };
}
