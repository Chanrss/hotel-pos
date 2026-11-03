import * as XLSX from 'xlsx';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
import { getLocalBills, getLocalBillItems, getLocalItemsMap } from './localBillStore';
import { getLocalKots } from './localKotStore';
import { getBusinessDate } from './billNumberEngine';
import {
  Bill,
  BillItem,
  BillingDraft,
  Kot,
  KotItem,
  BusinessDay,
  Category,
  MenuItem,
  RestaurantSettings,
  DailyBackupRecord
} from '../types';
import { saveDailyBackupRecord, triggerBlobDownload } from './backupService';

export interface ExcelBackupOptions {
  restaurantSettings?: RestaurantSettings;
  businessDate?: string;
  bills?: Bill[];
  billItems?: BillItem[];
  kots?: Kot[];
  autoDownload?: boolean;
}

export interface ExcelBackupResult {
  success: boolean;
  filename: string;
  fileSizeBytes: number;
  record?: DailyBackupRecord;
  billCount: number;
  totalRevenue: number;
  error?: string;
}

/**
 * Formats a numeric timestamp or date string into readable YYYY-MM-DD HH:mm:ss
 */
function formatReadableDateTime(timestamp?: number | string): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return String(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats timestamp into HH:mm:ss for clean time column
 */
function formatReadableTime(timestamp?: number | string): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Formats currency number into fixed 2 decimal places for accurate financial accounting
 */
function toCurrencyNum(val: any): number {
  const num = Number(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Fetches collection docs safely from Firestore with fallback to empty array
 */
async function fetchSafeCollection<T = any>(collectionName: string): Promise<T[]> {
  try {
    const colRef = collection(db, collectionName);
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => ({
      id: d.id,
      _id: d.id,
      ...d.data()
    })) as unknown as T[];
  } catch (err) {
    console.warn(`ExcelBackup: Could not fetch collection "${collectionName}":`, err);
    return [];
  }
}

/**
 * Generates and downloads a multi-worksheet Excel backup (.xlsx) for the business day.
 * Conforms strictly to requirements:
 * 1. Daily Summary
 * 2. Bill Details
 * 3. Sold Items
 * 4. KOT Details
 * 5. Business Day Ledger
 * 6. Store Profile and GST Settings
 */
export async function exportDailyBillingExcelBackup(
  options?: ExcelBackupOptions
): Promise<ExcelBackupResult> {
  const now = new Date();
  const exportTimestamp = now.toISOString();
  const exportTimestampMs = now.getTime();

  try {
    // 1. Resolve Settings
    let settings = options?.restaurantSettings;
    if (!settings) {
      try {
        const settingsDocs = await fetchSafeCollection<RestaurantSettings>('settings');
        if (settingsDocs.length > 0) {
          settings = settingsDocs[0];
        }
      } catch (e) {
        console.warn('ExcelBackup: could not load settings from firestore:', e);
      }
    }

    const restaurantName = settings?.restaurantName || 'Sri Saravana Bhavan';
    const businessDayStartHour = settings?.businessDayStartHour || '04:00';
    const targetBusinessDate = options?.businessDate || getBusinessDate(businessDayStartHour, now);

    // 2. Fetch or reuse Bills & Items
    let allBills: Bill[] = options?.bills || [];
    let allBillItems: BillItem[] = options?.billItems || [];
    let allKots: Kot[] = options?.kots || [];
    let rawBusinessDays: BusinessDay[] = [];
    let rawCategories: Category[] = [];
    let rawMenuItems: MenuItem[] = [];

    // If caller didn't pass full collections, fetch them concurrently
    if (allBills.length === 0 || allKots.length === 0) {
      const [
        fetchedBills,
        fetchedBillItems,
        fetchedKots,
        fetchedDays,
        fetchedCategories,
        fetchedMenuItems
      ] = await Promise.all([
        allBills.length === 0 ? fetchSafeCollection<Bill>('bills') : Promise.resolve(allBills),
        allBillItems.length === 0 ? fetchSafeCollection<BillItem>('bill_items') : Promise.resolve(allBillItems),
        allKots.length === 0 ? fetchSafeCollection<Kot>('kots') : Promise.resolve(allKots),
        fetchSafeCollection<BusinessDay>('business_days'),
        fetchSafeCollection<Category>('categories'),
        fetchSafeCollection<MenuItem>('menu_items')
      ]);

      allBills = fetchedBills;
      allBillItems = fetchedBillItems;
      allKots = fetchedKots;
      rawBusinessDays = fetchedDays;
      rawCategories = fetchedCategories;
      rawMenuItems = fetchedMenuItems;
    }

    // Include local offline cache to guarantee zero data loss
    try {
      const localBills = getLocalBills();
      const billIdMap = new Map<string, Bill>();
      allBills.forEach((b) => billIdMap.set(b.id || (b as any)._id, b));
      localBills.forEach((lb) => {
        const id = lb.id || (lb as any)._id;
        if (id && !billIdMap.has(id)) {
          billIdMap.set(id, lb);
        }
      });
      allBills = Array.from(billIdMap.values());

      const localKotEntries = getLocalKots();
      const kotIdMap = new Map<string, Kot>();
      allKots.forEach((k) => kotIdMap.set(k.id || (k as any)._id, k));
      localKotEntries.forEach((entry) => {
        const k = entry.kot;
        if (!k) return;
        const id = k.id || (k as any)._id;
        if (id && !kotIdMap.has(id)) {
          kotIdMap.set(id, k);
        }
      });
      allKots = Array.from(kotIdMap.values());

      const localItemsMap = getLocalItemsMap();
      const flattenedLocalItems = Object.values(localItemsMap).flat();
      const itemIdMap = new Map<string, BillItem>();
      allBillItems.forEach((item) => {
        const key = item.id ? item.id : `${item.billId}_${item.itemCode || item.itemName}`;
        itemIdMap.set(key, item);
      });
      flattenedLocalItems.forEach((li) => {
        const key = li.id ? li.id : `${li.billId}_${li.itemCode || li.itemName}`;
        if (!itemIdMap.has(key)) {
          itemIdMap.set(key, li);
        }
      });
      allBillItems = Array.from(itemIdMap.values());
    } catch (e) {
      console.warn('ExcelBackup: Local cache incorporation notice:', e);
    }

    // 3. Filter records strictly for the target business date
    const dayBills = allBills.filter((b) => b.businessDate === targetBusinessDate);
    // Sort bills numerically by billNumber or timestamp
    dayBills.sort((a, b) => {
      const numA = parseInt(String(a.billNumber).replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.billNumber).replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const dayKots = allKots.filter((k) => k.businessDate === targetBusinessDate);
    dayKots.sort((a, b) => {
      const numA = parseInt(String(a.kotNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.kotNumber || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    // 4. Calculate Financial & Reconciliation Totals (Without Double-Counting)
    let totalGrossSubtotal = 0;
    let totalDiscounts = 0;
    let totalGrandRevenue = 0;
    let totalCashRevenue = 0;
    let totalUpiRevenue = 0;
    let totalCardRevenue = 0;
    let totalOtherRevenue = 0;

    let completedBillsCount = 0;
    let cancelledBillsCount = 0;
    let dineInBillsCount = 0;
    let takeAwayBillsCount = 0;

    let totalCgst = 0;
    let totalSgst = 0;
    let totalGst = 0;

    dayBills.forEach((b) => {
      const isCompleted = b.status === 'COMPLETED';
      const isCancelled = b.status === 'CANCELLED';

      if (isCompleted) {
        completedBillsCount++;
        const sub = toCurrencyNum(b.subtotal);
        const disc = toCurrencyNum(b.discount);
        const grand = toCurrencyNum(b.grandTotal);

        totalGrossSubtotal += sub;
        totalDiscounts += disc;
        totalGrandRevenue += grand;

        // GST breakdown (Standard Indian Restaurant 5%: 2.5% CGST + 2.5% SGST)
        // If tax is inclusive or exclusive: Taxable = sub - disc; GST = taxable * 0.05
        const taxable = Math.max(0, sub - disc);
        const cgst = Math.round((taxable * 0.025) * 100) / 100;
        const sgst = Math.round((taxable * 0.025) * 100) / 100;
        totalCgst += cgst;
        totalSgst += sgst;
        totalGst += (cgst + sgst);

        const method = (b.paymentMethod || 'CASH').toUpperCase();
        if (method === 'CASH') {
          totalCashRevenue += grand;
        } else if (method === 'UPI' || method.includes('QR') || method.includes('GPAY') || method.includes('PAYTM') || method.includes('ONLINE')) {
          totalUpiRevenue += grand;
        } else if (method === 'CARD') {
          totalCardRevenue += grand;
        } else {
          totalOtherRevenue += grand;
        }

        if (b.orderType === 'DINE_IN') {
          dineInBillsCount++;
        } else {
          takeAwayBillsCount++;
        }
      } else if (isCancelled) {
        cancelledBillsCount++;
      }
    });

    const averageBillValue = completedBillsCount > 0 ? Math.round(totalGrandRevenue / completedBillsCount) : 0;
    const totalReconciledPayments = totalCashRevenue + totalUpiRevenue + totalCardRevenue + totalOtherRevenue;
    const paymentVariance = Math.round((totalReconciledPayments - totalGrandRevenue) * 100) / 100;

    // Sequence counters
    const billNumbersNumeric = dayBills
      .map((b) => parseInt(String(b.billNumber).replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n) && n > 0);
    const minBillNum = billNumbersNumeric.length > 0 ? Math.min(...billNumbersNumeric) : 0;
    const maxBillNum = billNumbersNumeric.length > 0 ? Math.max(...billNumbersNumeric) : 0;

    const kotNumbersNumeric = dayKots
      .map((k) => parseInt(String(k.kotNumber).replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n) && n > 0);
    const minKotNum = kotNumbersNumeric.length > 0 ? Math.min(...kotNumbersNumeric) : 0;
    const maxKotNum = kotNumbersNumeric.length > 0 ? Math.max(...kotNumbersNumeric) : 0;

    // 5. Gather Sold Items for Day
    const dayBillIds = new Set(dayBills.map((b) => b.id));
    const billMap = new Map<string, Bill>();
    dayBills.forEach((b) => billMap.set(b.id, b));

    const soldItemsList: Array<{
      billNumber: string;
      billStatus: string;
      businessDate: string;
      createdAt: number;
      itemCode: string;
      itemName: string;
      itemNameTamil?: string;
      category?: string;
      priceType: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      taxable: number;
      gstRate: string;
      gstAmount: number;
      grandTotal: number;
      tableNumber?: string;
      cashier?: string;
      itemStatus?: string;
    }> = [];

    // First collect items attached directly to day bills
    dayBills.forEach((b) => {
      if (b.items && b.items.length > 0) {
        b.items.forEach((item) => {
          const qty = Number(item.quantity) || 1;
          const uPrice = Number(item.unitPrice) || 0;
          const sub = Number(item.totalPrice) || (qty * uPrice);
          const taxable = sub;
          const gstAmt = Math.round((taxable * 0.05) * 100) / 100;

          soldItemsList.push({
            billNumber: b.billNumber || '-',
            billStatus: b.status || 'COMPLETED',
            businessDate: b.businessDate || targetBusinessDate,
            createdAt: item.createdAt || b.createdAt || 0,
            itemCode: item.itemCode || '-',
            itemName: item.itemName || 'Item',
            itemNameTamil: item.itemNameTamil || '',
            category: (item as any).category || (item as any).categoryName || '',
            priceType: item.priceType || b.priceType || 'NON_AC',
            quantity: qty,
            unitPrice: uPrice,
            subtotal: sub,
            taxable,
            gstRate: '5.0%',
            gstAmount: gstAmt,
            grandTotal: sub + (settings?.receiptFormat === 'gst_tax_invoice' ? gstAmt : 0),
            tableNumber: b.tableNumber || '-',
            cashier: b.userName || b.userId || 'Cashier',
            itemStatus: (item as any).status || 'SERVED'
          });
        });
      }
    });

    // Also include standalone bill items matching day bills if not already captured
    if (soldItemsList.length === 0) {
      allBillItems.forEach((item) => {
        if (dayBillIds.has(item.billId) || item.businessDate === targetBusinessDate) {
          const b = billMap.get(item.billId);
          const qty = Number(item.quantity) || 1;
          const uPrice = Number(item.unitPrice) || 0;
          const sub = Number(item.totalPrice) || (qty * uPrice);
          const taxable = sub;
          const gstAmt = Math.round((taxable * 0.05) * 100) / 100;

          soldItemsList.push({
            billNumber: b?.billNumber || item.billId || '-',
            billStatus: b?.status || 'COMPLETED',
            businessDate: item.businessDate || b?.businessDate || targetBusinessDate,
            createdAt: item.createdAt || b?.createdAt || 0,
            itemCode: item.itemCode || '-',
            itemName: item.itemName || 'Item',
            itemNameTamil: item.itemNameTamil || '',
            category: (item as any).category || '',
            priceType: item.priceType || b?.priceType || 'NON_AC',
            quantity: qty,
            unitPrice: uPrice,
            subtotal: sub,
            taxable,
            gstRate: '5.0%',
            gstAmount: gstAmt,
            grandTotal: sub,
            tableNumber: b?.tableNumber || '-',
            cashier: b?.userName || b?.userId || 'Cashier',
            itemStatus: (item as any).status || 'SERVED'
          });
        }
      });
    }

    // Sort sold items by bill number and time
    soldItemsList.sort((a, b) => {
      const numA = parseInt(String(a.billNumber).replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.billNumber).replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      return a.createdAt - b.createdAt;
    });

    // 6. BUILD THE 6 WORKSHEETS
    const workbook = XLSX.utils.book_new();

    // ==========================================
    // WORKSHEET 1: DAILY SUMMARY
    // ==========================================
    const summaryRows: any[][] = [
      [`${restaurantName.toUpperCase()} - DAILY BUSINESS DAY FINANCIAL & AUDIT SUMMARY`],
      [`Generated: ${formatReadableDateTime(exportTimestampMs)} | Business Date: ${targetBusinessDate} | Export Standard: POS-XLSX-V1.0`],
      [],
      ['BUSINESS DAY OVERVIEW', ''],
      ['Business Date', targetBusinessDate],
      ['Total Bills Generated', dayBills.length],
      ['Finalized Completed Bills', completedBillsCount],
      ['Cancelled / Voided Bills', cancelledBillsCount],
      ['Dine-In Bills Count', dineInBillsCount],
      ['Takeaway Bills Count', takeAwayBillsCount],
      ['Total Dishes / Items Sold', soldItemsList.reduce((acc, i) => acc + (i.billStatus === 'COMPLETED' ? i.quantity : 0), 0)],
      ['Total Kitchen Order Tickets (KOT)', dayKots.length],
      ['Average Order Value (AOV)', `₹ ${averageBillValue.toLocaleString('en-IN')}`],
      [],
      ['FINANCIAL REVENUE & GST BREAKDOWN', 'INR (₹)'],
      ['Gross Subtotal (Before Discounts)', toCurrencyNum(totalGrossSubtotal)],
      ['Total Customer Discounts Allowed', toCurrencyNum(totalDiscounts)],
      ['Net Taxable Turnover', toCurrencyNum(totalGrossSubtotal - totalDiscounts)],
      ['CGST @ 2.5% (Central Tax)', toCurrencyNum(totalCgst)],
      ['SGST @ 2.5% (State Tax)', toCurrencyNum(totalSgst)],
      ['Total GST (5.0%)', toCurrencyNum(totalGst)],
      ['NET GRAND TOTAL SALES', toCurrencyNum(totalGrandRevenue)],
      [],
      ['PAYMENT RECONCILIATION SUMMARY', 'INR (₹)'],
      ['Cash Payments Received', toCurrencyNum(totalCashRevenue)],
      ['UPI / Dynamic QR Payments', toCurrencyNum(totalUpiRevenue)],
      ['Card Terminal Payments', toCurrencyNum(totalCardRevenue)],
      ['Other / Credit Settlements', toCurrencyNum(totalOtherRevenue)],
      ['Total Reconciled Tendered', toCurrencyNum(totalReconciledPayments)],
      ['Reconciliation Variance', toCurrencyNum(paymentVariance)],
      ['Reconciliation Status', paymentVariance === 0 ? 'BALANCED' : 'VARIANCE_DETECTED'],
      [],
      ['SEQUENTIAL AUDIT COUNTERS', 'RECORDS'],
      ['Initial Starting Bill Number', minBillNum > 0 ? String(minBillNum).padStart(2, '0') : '01'],
      ['Final Closing Bill Number', maxBillNum > 0 ? String(maxBillNum).padStart(2, '0') : '-'],
      ['Total Sequential Bills Issued', dayBills.length],
      ['Initial Starting KOT Number', minKotNum > 0 ? `KOT-${String(minKotNum).padStart(2, '0')}` : 'KOT-01'],
      ['Final Closing KOT Number', maxKotNum > 0 ? `KOT-${String(maxKotNum).padStart(2, '0')}` : '-'],
      ['Total Sequential KOTs Issued', dayKots.length],
      [],
      ['STORE PROFILE REFERENCE', ''],
      ['Restaurant Legal Name', restaurantName],
      ['GSTIN Number', settings?.gstNumber || 'Not Registered / Unregistered'],
      ['FSSAI License', settings?.fssaiNumber || '-'],
      ['Store Address', settings?.address || '-'],
      ['Contact Phone', settings?.phone || '-'],
      ['Day Opening Time Cutoff', `${businessDayStartHour} AM/PM`]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Daily Summary');

    // ==========================================
    // WORKSHEET 2: BILL DETAILS
    // ==========================================
    const billHeaders = [
      'Bill #',
      'Business Date',
      'Bill Date & Time',
      'Status',
      'Order Type',
      'Table #',
      'Price Tier',
      'Cashier / Staff',
      'Items Count',
      'Subtotal (₹)',
      'Discount (₹)',
      'Taxable Value (₹)',
      'CGST 2.5% (₹)',
      'SGST 2.5% (₹)',
      'Total GST (₹)',
      'Grand Total (₹)',
      'Payment Method',
      'Payment Status',
      'Cancel Reason',
      'Cancelled By',
      'Device ID',
      'Transaction ID'
    ];

    const billRows: any[][] = [billHeaders];
    let sumSubtotal = 0;
    let sumDiscount = 0;
    let sumTaxable = 0;
    let sumCgst = 0;
    let sumSgst = 0;
    let sumGst = 0;
    let sumGrand = 0;

    dayBills.forEach((b) => {
      const isCompleted = b.status === 'COMPLETED';
      const sub = toCurrencyNum(b.subtotal);
      const disc = toCurrencyNum(b.discount);
      const taxable = Math.max(0, sub - disc);
      const cgst = isCompleted ? Math.round((taxable * 0.025) * 100) / 100 : 0;
      const sgst = isCompleted ? Math.round((taxable * 0.025) * 100) / 100 : 0;
      const totalTax = cgst + sgst;
      const grand = toCurrencyNum(b.grandTotal);

      if (isCompleted) {
        sumSubtotal += sub;
        sumDiscount += disc;
        sumTaxable += taxable;
        sumCgst += cgst;
        sumSgst += sgst;
        sumGst += totalTax;
        sumGrand += grand;
      }

      billRows.push([
        b.billNumber || '-',
        b.businessDate,
        formatReadableDateTime(b.createdAt),
        b.status,
        b.orderType === 'DINE_IN' ? 'Dine In' : 'Takeaway',
        b.tableNumber || '-',
        b.priceType || 'NON_AC',
        b.userName || b.userId || 'Cashier',
        b.items?.length || 0,
        sub,
        disc,
        taxable,
        cgst,
        sgst,
        totalTax,
        grand,
        (b.paymentMethod || 'CASH').toUpperCase(),
        b.paymentStatus || (isCompleted ? 'PAID' : 'CANCELLED'),
        b.cancelReason || '',
        b.cancelledBy || '',
        b.deviceId || '-',
        b.transactionId || ''
      ]);
    });

    // Summary total row for bills
    billRows.push([
      'TOTAL (Completed Bills)',
      '',
      '',
      `${completedBillsCount} COMPLETED / ${cancelledBillsCount} CANCELLED`,
      '',
      '',
      '',
      '',
      '',
      toCurrencyNum(sumSubtotal),
      toCurrencyNum(sumDiscount),
      toCurrencyNum(sumTaxable),
      toCurrencyNum(sumCgst),
      toCurrencyNum(sumSgst),
      toCurrencyNum(sumGst),
      toCurrencyNum(sumGrand),
      '',
      '',
      '',
      '',
      '',
      ''
    ]);

    const wsBills = XLSX.utils.aoa_to_sheet(billRows);
    wsBills['!cols'] = [
      { wch: 10 }, // Bill #
      { wch: 14 }, // Date
      { wch: 20 }, // Date & Time
      { wch: 14 }, // Status
      { wch: 12 }, // Order Type
      { wch: 10 }, // Table #
      { wch: 12 }, // Price Tier
      { wch: 16 }, // Staff
      { wch: 12 }, // Items Count
      { wch: 14 }, // Subtotal
      { wch: 14 }, // Discount
      { wch: 16 }, // Taxable
      { wch: 14 }, // CGST
      { wch: 14 }, // SGST
      { wch: 14 }, // Total GST
      { wch: 16 }, // Grand Total
      { wch: 16 }, // Payment Method
      { wch: 14 }, // Payment Status
      { wch: 22 }, // Cancel Reason
      { wch: 16 }, // Cancelled By
      { wch: 16 }, // Device ID
      { wch: 18 }  // Transaction ID
    ];
    if (billRows.length > 2) {
      wsBills['!autofilter'] = { ref: `A1:V${billRows.length - 1}` };
    }
    XLSX.utils.book_append_sheet(workbook, wsBills, 'Bill Details');

    // ==========================================
    // WORKSHEET 3: SOLD ITEMS
    // ==========================================
    const itemHeaders = [
      'Bill #',
      'Bill Status',
      'Business Date',
      'Bill Time',
      'Item Name (English)',
      'Item Name (Tamil)',
      'Category',
      'Price Type',
      'Quantity',
      'Unit Price (₹)',
      'Item Subtotal (₹)',
      'Taxable Value (₹)',
      'GST Rate',
      'GST Amount (₹)',
      'Net Total (₹)',
      'Table #',
      'Cashier / Staff',
      'Item Status'
    ];

    const itemRows: any[][] = [itemHeaders];
    let sumItemQty = 0;
    let sumItemSubtotal = 0;
    let sumItemGst = 0;
    let sumItemTotal = 0;

    soldItemsList.forEach((item) => {
      const isCompleted = item.billStatus === 'COMPLETED';
      if (isCompleted) {
        sumItemQty += item.quantity;
        sumItemSubtotal += item.subtotal;
        sumItemGst += item.gstAmount;
        sumItemTotal += item.grandTotal;
      }

      itemRows.push([
        item.billNumber,
        item.billStatus,
        item.businessDate,
        formatReadableTime(item.createdAt),
        item.itemName,
        item.itemNameTamil || '',
        item.category || '',
        item.priceType,
        item.quantity,
        toCurrencyNum(item.unitPrice),
        toCurrencyNum(item.subtotal),
        toCurrencyNum(item.taxable),
        item.gstRate,
        toCurrencyNum(item.gstAmount),
        toCurrencyNum(item.grandTotal),
        item.tableNumber,
        item.cashier,
        item.itemStatus
      ]);
    });

    itemRows.push([
      'TOTAL (Completed Dishes)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      sumItemQty,
      '',
      toCurrencyNum(sumItemSubtotal),
      toCurrencyNum(sumItemSubtotal),
      '',
      toCurrencyNum(sumItemGst),
      toCurrencyNum(sumItemTotal),
      '',
      '',
      ''
    ]);

    const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
    wsItems['!cols'] = [
      { wch: 10 }, // Bill #
      { wch: 12 }, // Status
      { wch: 14 }, // Date
      { wch: 12 }, // Time
      { wch: 24 }, // Name English
      { wch: 20 }, // Name Tamil
      { wch: 16 }, // Category
      { wch: 12 }, // Price Tier
      { wch: 10 }, // Quantity
      { wch: 14 }, // Unit Price
      { wch: 16 }, // Subtotal
      { wch: 16 }, // Taxable
      { wch: 10 }, // GST Rate
      { wch: 14 }, // GST Amount
      { wch: 16 }, // Net Total
      { wch: 10 }, // Table #
      { wch: 16 }, // Cashier
      { wch: 14 }  // Status
    ];
    if (itemRows.length > 2) {
      wsItems['!autofilter'] = { ref: `A1:R${itemRows.length - 1}` };
    }
    XLSX.utils.book_append_sheet(workbook, wsItems, 'Sold Items');

    // ==========================================
    // WORKSHEET 4: KOT DETAILS
    // ==========================================
    const kotHeaders = [
      'KOT #',
      'Business Date',
      'Created Date & Time',
      'Order Type',
      'Table #',
      'Waiter / Captain',
      'KOT Status',
      'Print Status',
      'Printed Date & Time',
      'Items Count',
      'Ordered Dishes & Quantities',
      'Created By Terminal / Staff'
    ];

    const kotRows: any[][] = [kotHeaders];
    dayKots.forEach((k) => {
      // Dish items breakdown string
      let dishesStr = '';
      if (k.items && k.items.length > 0) {
        dishesStr = k.items.map((i) => `${i.itemName} (x${i.quantity})`).join(', ');
      } else {
        dishesStr = `${k.itemsCount || 0} items`;
      }

      kotRows.push([
        k.kotNumber || '-',
        k.businessDate,
        formatReadableDateTime(k.createdAt),
        k.orderType === 'DINE_IN' ? 'Dine In' : 'Takeaway',
        k.tableNumber || '-',
        k.waiterName || k.waiterId || 'Server',
        k.status,
        k.printStatus || 'PRINTED',
        k.printedAt ? formatReadableDateTime(k.printedAt) : '-',
        k.items?.length || k.itemsCount || 0,
        dishesStr,
        k.createdBy || '-'
      ]);
    });

    if (dayKots.length === 0) {
      kotRows.push(['No Kitchen Order Tickets recorded for this business day', '', '', '', '', '', '', '', '', '', '', '']);
    }

    const wsKots = XLSX.utils.aoa_to_sheet(kotRows);
    wsKots['!cols'] = [
      { wch: 12 }, // KOT #
      { wch: 14 }, // Date
      { wch: 20 }, // Created Time
      { wch: 12 }, // Order Type
      { wch: 10 }, // Table #
      { wch: 16 }, // Waiter
      { wch: 14 }, // Status
      { wch: 14 }, // Print Status
      { wch: 20 }, // Printed Time
      { wch: 12 }, // Items Count
      { wch: 45 }, // Dishes & Quantities
      { wch: 20 }  // Created By
    ];
    if (kotRows.length > 2) {
      wsKots['!autofilter'] = { ref: `A1:L${kotRows.length}` };
    }
    XLSX.utils.book_append_sheet(workbook, wsKots, 'KOT Details');

    // ==========================================
    // WORKSHEET 5: BUSINESS DAY LEDGER
    // ==========================================
    const ledgerHeaders = [
      'Business Date',
      'Day Status',
      'Opened At',
      'Starting Bill #',
      'Last Bill #',
      'Total Bills Issued',
      'Starting KOT #',
      'Last KOT #',
      'Total KOTs Issued',
      'Completed Bills',
      'Cancelled Bills',
      'Gross Sales (₹)',
      'Total Discount (₹)',
      'Taxable Sales (₹)',
      'Total GST (₹)',
      'Net Sales Revenue (₹)',
      'Cash Sales (₹)',
      'UPI Sales (₹)',
      'Card Sales (₹)',
      'Other Sales (₹)',
      'Reconciliation'
    ];

    const currentDayRecord = rawBusinessDays.find((d) => d.businessDate === targetBusinessDate);
    const dayOpenedAt = currentDayRecord?.startedAt ? formatReadableDateTime(currentDayRecord.startedAt) : `${targetBusinessDate} ${businessDayStartHour}:00`;
    const isClosed = currentDayRecord ? currentDayRecord.isClosed : false;

    const ledgerRows: any[][] = [
      ledgerHeaders,
      [
        targetBusinessDate,
        isClosed ? 'CLOSED' : 'ACTIVE / OPEN',
        dayOpenedAt,
        minBillNum > 0 ? String(minBillNum).padStart(2, '0') : '01',
        maxBillNum > 0 ? String(maxBillNum).padStart(2, '0') : '-',
        dayBills.length,
        minKotNum > 0 ? `KOT-${String(minKotNum).padStart(2, '0')}` : 'KOT-01',
        maxKotNum > 0 ? `KOT-${String(maxKotNum).padStart(2, '0')}` : '-',
        dayKots.length,
        completedBillsCount,
        cancelledBillsCount,
        toCurrencyNum(totalGrossSubtotal),
        toCurrencyNum(totalDiscounts),
        toCurrencyNum(totalGrossSubtotal - totalDiscounts),
        toCurrencyNum(totalGst),
        toCurrencyNum(totalGrandRevenue),
        toCurrencyNum(totalCashRevenue),
        toCurrencyNum(totalUpiRevenue),
        toCurrencyNum(totalCardRevenue),
        toCurrencyNum(totalOtherRevenue),
        paymentVariance === 0 ? 'BALANCED (₹0.00 Var)' : `VARIANCE: ₹${paymentVariance}`
      ]
    ];

    // If other historical business days are available, append them too
    rawBusinessDays
      .filter((d) => d.businessDate !== targetBusinessDate)
      .slice(0, 14)
      .forEach((d) => {
        ledgerRows.push([
          d.businessDate,
          d.isClosed ? 'CLOSED' : 'OPEN',
          d.startedAt ? formatReadableDateTime(d.startedAt) : '-',
          '01',
          d.lastBillNumber ? String(d.lastBillNumber).padStart(2, '0') : '-',
          d.lastBillNumber || '-',
          'KOT-01',
          d.lastKotNumber ? `KOT-${String(d.lastKotNumber).padStart(2, '0')}` : '-',
          d.lastKotNumber || '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          'HISTORICAL_LEDGER'
        ]);
      });

    const wsLedger = XLSX.utils.aoa_to_sheet(ledgerRows);
    wsLedger['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 20 },
      { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 14 },
      { wch: 18 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsLedger, 'Business Day Ledger');

    // ==========================================
    // WORKSHEET 6: STORE PROFILE AND GST SETTINGS
    // ==========================================
    const storeProfileRows: any[][] = [
      ['CONFIGURATION PARAMETER', 'CURRENT STORE VALUE', 'GST & AUDIT COMPLIANCE CLASSIFICATION'],
      ['Store / Restaurant Name', restaurantName, 'Official Registered Brand Trade Name'],
      ['Tamil Regional Restaurant Name', settings?.restaurantNameTamil || 'ஸ்ரீ சரவண பவன்', 'Vernacular Regional Display Name'],
      ['Registered Premises Address', settings?.address || '12, South Car Street, Chidambaram, Tamil Nadu - 608001', 'Official Principal Place of Business'],
      ['Contact Phone / Mobile', settings?.phone || '+91 94432 10987', 'Registered Store Phone Number'],
      ['Contact Email Address', settings?.email || 'accounts@saravanabhavan.pos', 'Store Financial & Audit Correspondence'],
      ['GSTIN Number', settings?.gstNumber || '33AAAAA0000A1Z5', 'Goods and Services Tax Identification Number'],
      ['FSSAI Food License Number', settings?.fssaiNumber || '12418008000456', 'Food Safety and Standards Authority of India Registration'],
      ['Applicable GST Tax Regime', '5.0% Restaurant Service Rate (2.5% CGST + 2.5% SGST without ITC)', 'Government Standard Food & Beverage Hospitality Rate'],
      ['Business Day Opening Hour', `${businessDayStartHour} (4:00 AM Standard Reset)`, 'Cut-off time for attributing transactions to financial calendar date'],
      ['Thermal Printer Hardware Specification', settings?.printerType || 'THERMAL_80MM (Standard 80mm ESC/POS Spooler)', 'Receipt printer width and driver specification'],
      ['Receipt Layout Template', settings?.receiptFormat || 'gst_tax_invoice', 'Standard thermal receipt design preset'],
      ['Dynamic UPI Payment ID (QR)', settings?.upiId || 'saravanabhavan@sbi', 'NPCI UPI VPA address for table QR payment verification'],
      ['Sequential Bill Counter Digits', settings?.billNumberDigits || 2, 'Zero-padded sequential counter formatting (e.g. 01, 02)'],
      ['POS App Version', 'AI Studio Restaurant POS v2.6.4 (Enterprise)', 'Software Build Release for Financial Audit Trail'],
      ['Report Generated Timestamp', formatReadableDateTime(exportTimestampMs), 'Cryptographic timestamp of this Excel report generation']
    ];

    const wsStoreProfile = XLSX.utils.aoa_to_sheet(storeProfileRows);
    wsStoreProfile['!cols'] = [{ wch: 36 }, { wch: 42 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(workbook, wsStoreProfile, 'Store Profile and GST Settings');

    // 7. Generate Excel Binary Buffer & Filename
    // Filename requirement: Restaurant_Daily_Backup_YYYY-MM-DD_HH-mm-ss.xlsx
    const sanitizedName = restaurantName
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'Restaurant';

    const pad = (n: number) => String(n).padStart(2, '0');
    const timeFormatted = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `${sanitizedName}_Daily_Backup_${targetBusinessDate}_${timeFormatted}.xlsx`;

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const fileSizeBytes = blob.size;

    // 8. Trigger Browser File Download (if requested, default true)
    const shouldDownload = options?.autoDownload !== false;
    if (shouldDownload) {
      triggerBlobDownload(filename, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    // 9. Persist Audit Record into Firestore `/daily_backups`
    const totalDocsCount = dayBills.length + soldItemsList.length + dayKots.length + 2; // + summary + settings
    const record: DailyBackupRecord = {
      id: `backup_excel_${targetBusinessDate}_${exportTimestampMs}`,
      businessDate: targetBusinessDate,
      timestamp: exportTimestampMs,
      exportedAt: exportTimestamp,
      filename,
      triggerType: 'MANUAL',
      status: 'SUCCESS',
      scope: 'CORE_BILLING',
      exportFormat: 'Export Excel',
      action: 'Export Excel',
      exportType: 'Export Excel',
      description: 'Export Excel',
      billCount: dayBills.length,
      totalRevenue: totalGrandRevenue,
      cashTotal: totalCashRevenue,
      upiTotal: totalUpiRevenue,
      cardTotal: totalCardRevenue,
      cancelledBillCount: cancelledBillsCount,
      kotCount: dayKots.length,
      totalDocuments: totalDocsCount,
      fileSizeBytes,
      createdAt: exportTimestampMs
    };

    await saveDailyBackupRecord(record);

    return {
      success: true,
      filename,
      fileSizeBytes,
      record,
      billCount: dayBills.length,
      totalRevenue: totalGrandRevenue
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Failed to generate Excel report';
    console.error('exportDailyBillingExcelBackup error:', err);

    // Save failed audit entry
    try {
      const failedRecord: DailyBackupRecord = {
        id: `backup_excel_failed_${exportTimestampMs}`,
        businessDate: options?.businessDate || now.toISOString().split('T')[0],
        timestamp: exportTimestampMs,
        exportedAt: exportTimestamp,
        filename: '',
        triggerType: 'MANUAL',
        status: 'FAILED',
        scope: 'CORE_BILLING',
        exportFormat: 'Export Excel',
        action: 'Export Excel',
        exportType: 'Export Excel',
        description: 'Export Excel',
        billCount: 0,
        totalRevenue: 0,
        cashTotal: 0,
        upiTotal: 0,
        kotCount: 0,
        totalDocuments: 0,
        errorMessage: errMsg,
        createdAt: exportTimestampMs
      };
      await saveDailyBackupRecord(failedRecord);
    } catch (auditErr) {
      console.warn('Could not record failed backup audit:', auditErr);
    }

    return {
      success: false,
      filename: '',
      fileSizeBytes: 0,
      billCount: 0,
      totalRevenue: 0,
      error: errMsg
    };
  }
}

/**
 * Direct helper function for Daily Snapshot component to trigger Excel download
 */
export async function downloadDailyBillingExcel(
  restaurantSettings?: RestaurantSettings,
  businessDate?: string
): Promise<ExcelBackupResult> {
  return exportDailyBillingExcelBackup({
    restaurantSettings,
    businessDate,
    autoDownload: true
  });
}
