import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Bill, BillItem, Category, RestaurantSettings } from '../types';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getLocalBills, getLocalBillItems, mergeBills } from './localBillStore';
import { calculateDailyNetSales, getValidCompletedBills } from './salesCalculationEngine';

export interface ReportFilter {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  category?: string;
  orderType?: string;
  priceType?: string;
}

export interface ItemWiseReportRow {
  itemCode: string;
  itemName: string;
  categoryName?: string;
  quantitySold: number;
  orderCount: number;
  unitPrice?: number; // Only for permitted financial view
  salesValue?: number; // Only for permitted financial view
}

export interface CategoryWiseReportRow {
  categoryName: string;
  totalQuantity: number;
  orderCount: number;
  totalSalesValue?: number; // Only for permitted financial view
}

export interface DailySummaryRow {
  date: string;
  billCount: number;
  totalQuantity: number;
  totalSales?: number; // Only for permitted financial view
  cancelledCount: number;
}

export interface DailyNetSalesExportRow {
  date: string;
  validBillCount: number;
  dineInCount: number;
  takeAwayCount: number;
  cashSales: number;
  upiSales: number;
  cancelledCount: number;
  cancelledAmount: number;
  netSales: number;
}

export interface DailySalesBackupRow {
  sno: number;
  billId: string;
  billNo: string;
  date: string;         // DD-MM-YYYY
  businessDate: string; // YYYY-MM-DD
  time: string;         // HH:MM AM/PM
  itemName: string;     // Only Item Name (no Item Code)
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface DailySalesBackupReport {
  businessDate: string;      // YYYY-MM-DD
  formattedDate: string;     // DD-MM-YYYY
  pdfFileName: string;       // SSB_DD-MM-YYYY.pdf
  excelFileName: string;     // SSB_DD-MM-YYYY.xlsx
  totalBills: number;
  totalItemsSold: number;
  totalDailySales: number;
  rows: DailySalesBackupRow[];
  bills: Bill[];
}

export interface PDFReportExportOptions {
  restaurantName?: string;
  address?: string;
  phone?: string;
  startDate: string;
  endDate: string;
  reportType: 'daily-backup' | 'item-wise' | 'category-wise' | 'daily' | 'cancelled' | 'inventory';
  hasFinancialPermission: boolean;
  dailySummaryRows: DailyNetSalesExportRow[];
  transactions: Bill[];
  itemData?: ItemWiseReportRow[];
  categoryData?: CategoryWiseReportRow[];
  inventorySummary?: any[];
}

/**
 * Converts YYYY-MM-DD (or any date string) into DD-MM-YYYY with hyphens (Windows-safe filename format).
 */
export function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim().replace(/\//g, '-');
  const parts = cleaned.split('-');
  if (parts.length === 3) {
    // If YYYY-MM-DD
    if (parts[0].length === 4) {
      const [yyyy, mm, dd] = parts;
      return `${dd.padStart(2, '0')}-${mm.padStart(2, '0')}-${yyyy}`;
    }
    // Already DD-MM-YYYY
    if (parts[2].length === 4) {
      const [dd, mm, yyyy] = parts;
      return `${dd.padStart(2, '0')}-${mm.padStart(2, '0')}-${yyyy}`;
    }
  }
  return cleaned;
}

/**
 * Generates automatic backup filename: SSB_DD-MM-YYYY.pdf or SSB_DD-MM-YYYY.xlsx
 */
export function getDailyBackupFileName(dateStr: string, extension: 'pdf' | 'xlsx'): string {
  const ddmmyyyy = formatDateDDMMYYYY(dateStr);
  return `SSB_${ddmmyyyy}.${extension}`;
}

export function formatBillTime(createdAt: any): string {
  if (!createdAt) return '-';
  try {
    let d: Date | null = null;
    if (typeof createdAt?.toDate === 'function') {
      d = createdAt.toDate();
    } else if (typeof createdAt?.seconds === 'number') {
      d = new Date(createdAt.seconds * 1000);
    } else {
      d = new Date(createdAt);
    }
    if (d && !isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).toUpperCase();
    }
  } catch {
    // ignore parse failure
  }
  return '-';
}

export function formatIndianCurrency(amount: number | undefined): string {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Ensures Item Name never displays any accidental Item Code prefix while preserving the dish name.
 */
export function sanitizeItemNameOnly(itemName: string, itemCode?: string): string {
  if (!itemName) return 'Item';
  let cleaned = String(itemName).trim();
  if (itemCode) {
    const escapedCode = String(itemCode).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escapedCode) {
      cleaned = cleaned
        .replace(new RegExp(`^#?${escapedCode}\\s*[-:]\\s*`, 'i'), '')
        .replace(new RegExp(`^\\[${escapedCode}\\]\\s*`, 'i'), '')
        .trim();
    }
  }
  return cleaned || String(itemName).trim();
}

function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs = 1500): Promise<T> {
  const isTestEnv =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'test') ||
    (typeof process !== 'undefined' && Boolean(process.env?.VITEST));
  const effectiveTimeout = isTestEnv ? 30 : timeoutMs;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Firestore query timeout')), effectiveTimeout);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export class ReportEngine {
  static formatDateDDMMYYYY = formatDateDDMMYYYY;
  static getDailyBackupFileName = getDailyBackupFileName;

  /**
   * Fetches bills within date range directly from Firebase Firestore and merges with local resilient store
   */
  static async fetchBillsInRange(startDate: string, endDate: string): Promise<Bill[]> {
    let remoteBills: Bill[] = [];
    try {
      const q =
        startDate === endDate
          ? query(collection(db, 'bills'), where('businessDate', '==', startDate))
          : query(
              collection(db, 'bills'),
              where('businessDate', '>=', startDate),
              where('businessDate', '<=', endDate)
            );
      const snap = await withFirestoreTimeout(getDocs(q), 1500);
      remoteBills = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bill));
    } catch (e) {
      // Offline or timeout fallback to local bills
    }

    const localBills = getLocalBills().filter(
      (b) => b.businessDate >= startDate && b.businessDate <= endDate
    );

    const merged = mergeBills(remoteBills, localBills);
    return merged.sort((a, b) => {
      const dateCmp = (a.businessDate || '').localeCompare(b.businessDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  /**
   * Fetches all bill items for completed bills within date range
   */
  static async fetchBillItemsInRange(billIds: string[]): Promise<BillItem[]> {
    if (!billIds || billIds.length === 0) return [];
    
    const allItems: BillItem[] = [];
    const foundBillIds = new Set<string>();

    try {
      // Firestore where in is limited to 30 per batch, so fetch in chunks
      const chunks: string[][] = [];
      for (let i = 0; i < billIds.length; i += 30) {
        chunks.push(billIds.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const q = query(
          collection(db, 'bill_items'),
          where('billId', 'in', chunk)
        );
        const snap = await withFirestoreTimeout(getDocs(q), 1500);
        snap.docs.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as BillItem;
          allItems.push(item);
          foundBillIds.add(item.billId);
        });
      }
    } catch (e) {
      // Offline or timeout fallback to local bill items
    }

    // For any billId not retrieved from remote Firestore, get from local store
    for (const id of billIds) {
      if (!foundBillIds.has(id)) {
        const localItems = getLocalBillItems(id);
        if (localItems && localItems.length > 0) {
          allItems.push(...localItems);
        }
      }
    }

    return allItems;
  }

  /**
   * Generates complete Daily Sales Backup & Report for a selected business date (YYYY-MM-DD).
   * - Includes all valid completed bills for the selected date.
   * - Excludes cancelled, deleted, superseded, and duplicate bills.
   * - Strips Item Code from display rows while keeping item names and accurate totals.
   */
  static async generateDailySalesBackupReport(businessDate: string): Promise<DailySalesBackupReport> {
    const formattedDate = formatDateDDMMYYYY(businessDate);
    const pdfFileName = getDailyBackupFileName(businessDate, 'pdf');
    const excelFileName = getDailyBackupFileName(businessDate, 'xlsx');

    const allBillsForDate = await ReportEngine.fetchBillsInRange(businessDate, businessDate);
    const validBills = getValidCompletedBills(allBillsForDate);

    // Sort valid completed bills by billNumber ascending, then createdAt ascending
    const sortedBills = [...validBills].sort((a, b) => {
      const numA = parseInt(String(a.billNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.billNumber || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    // Identify bills that do not already have embedded items
    const billsMissingEmbeddedItems = sortedBills
      .filter((b) => !Array.isArray(b.items) || b.items.length === 0)
      .map((b) => b.id);

    const fetchedItems =
      billsMissingEmbeddedItems.length > 0
        ? await ReportEngine.fetchBillItemsInRange(billsMissingEmbeddedItems)
        : [];

    const itemsByBillId = new Map<string, BillItem[]>();
    fetchedItems.forEach((item) => {
      const list = itemsByBillId.get(item.billId) || [];
      list.push(item);
      itemsByBillId.set(item.billId, list);
    });

    const rows: DailySalesBackupRow[] = [];
    let snoCounter = 1;
    let totalItemsSold = 0;
    let totalDailySales = 0;

    for (const bill of sortedBills) {
      const billItems: BillItem[] =
        Array.isArray(bill.items) && bill.items.length > 0
          ? bill.items
          : itemsByBillId.get(bill.id) || getLocalBillItems(bill.id) || [];

      const billDateFormatted = formatDateDDMMYYYY(bill.businessDate || businessDate);
      const billTimeFormatted = formatBillTime(bill.createdAt);

      if (billItems.length > 0) {
        for (const item of billItems) {
          const qty = Number(item.quantity) || 0;
          const unitPrice = Math.round((Number(item.unitPrice) || 0) * 100) / 100;
          const lineTotal =
            item.totalPrice !== undefined && item.totalPrice !== null
              ? Math.round(Number(item.totalPrice) * 100) / 100
              : Math.round(qty * unitPrice * 100) / 100;

          rows.push({
            sno: snoCounter++,
            billId: bill.id,
            billNo: String(bill.billNumber || '-'),
            date: billDateFormatted,
            businessDate: bill.businessDate || businessDate,
            time: formatBillTime(item.createdAt || bill.createdAt) || billTimeFormatted,
            itemName: sanitizeItemNameOnly(item.itemName, item.itemCode),
            quantity: qty,
            unitPrice,
            total: lineTotal
          });

          totalItemsSold += qty;
          totalDailySales += lineTotal;
        }
      } else {
        // Fallback if a completed bill record had no separate item entries
        const billAmt = Math.round((Number(bill.grandTotal ?? bill.subtotal ?? 0) || 0) * 100) / 100;
        rows.push({
          sno: snoCounter++,
          billId: bill.id,
          billNo: String(bill.billNumber || '-'),
          date: billDateFormatted,
          businessDate: bill.businessDate || businessDate,
          time: billTimeFormatted,
          itemName: 'Food & Beverage Order',
          quantity: 1,
          unitPrice: billAmt,
          total: billAmt
        });
        totalItemsSold += 1;
        totalDailySales += billAmt;
      }
    }

    return {
      businessDate,
      formattedDate,
      pdfFileName,
      excelFileName,
      totalBills: sortedBills.length,
      totalItemsSold,
      totalDailySales: Math.round(totalDailySales * 100) / 100,
      rows,
      bills: sortedBills
    };
  }

  /**
   * Generates Item-wise sales report
   */
  static async generateItemWiseReport(
    startDate: string, 
    endDate: string, 
    hasFinancialPermission: boolean
  ): Promise<ItemWiseReportRow[]> {
    const bills = await ReportEngine.fetchBillsInRange(startDate, endDate);
    const completedBills = getValidCompletedBills(bills);
    const billIds = completedBills.map((b) => b.id);
    
    // Collect embedded items first, and fetch from bill_items for any bills without embedded items
    const items: BillItem[] = [];
    const missingBillIds: string[] = [];

    for (const bill of completedBills) {
      if (Array.isArray(bill.items) && bill.items.length > 0) {
        items.push(...bill.items);
      } else {
        missingBillIds.push(bill.id);
      }
    }

    if (missingBillIds.length > 0 || items.length === 0) {
      const targetIds = items.length === 0 ? billIds : missingBillIds;
      const fetched = await ReportEngine.fetchBillItemsInRange(targetIds);
      if (items.length === 0) {
        items.push(...fetched);
      } else {
        const missingSet = new Set(missingBillIds);
        items.push(...fetched.filter((i) => missingSet.has(i.billId)));
      }
    }

    const itemMap = new Map<string, ItemWiseReportRow>();

    items.forEach((item) => {
      const key = item.itemCode || item.itemName;
      const cleanName = sanitizeItemNameOnly(item.itemName, item.itemCode);
      const existing = itemMap.get(key) || {
        itemCode: item.itemCode,
        itemName: cleanName,
        quantitySold: 0,
        orderCount: 0,
        unitPrice: hasFinancialPermission ? item.unitPrice : undefined,
        salesValue: hasFinancialPermission ? 0 : undefined
      };

      existing.quantitySold += item.quantity;
      existing.orderCount += 1;
      if (hasFinancialPermission) {
        existing.salesValue = (existing.salesValue || 0) + (item.totalPrice || (item.unitPrice * item.quantity));
      }

      itemMap.set(key, existing);
    });

    return Array.from(itemMap.values()).sort((a, b) => b.quantitySold - a.quantitySold);
  }

  /**
   * Generates Category-wise sales report
   */
  static async generateCategoryWiseReport(
    startDate: string, 
    endDate: string,
    categories: Category[],
    hasFinancialPermission: boolean
  ): Promise<CategoryWiseReportRow[]> {
    const itemReport = await ReportEngine.generateItemWiseReport(startDate, endDate, hasFinancialPermission);
    const catMap = new Map<string, CategoryWiseReportRow>();

    itemReport.forEach((item) => {
      const catName = 'General / All';
      const existing = catMap.get(catName) || {
        categoryName: catName,
        totalQuantity: 0,
        orderCount: 0,
        totalSalesValue: hasFinancialPermission ? 0 : undefined
      };

      existing.totalQuantity += item.quantitySold;
      existing.orderCount += item.orderCount;
      if (hasFinancialPermission && item.salesValue) {
        existing.totalSalesValue = (existing.totalSalesValue || 0) + item.salesValue;
      }
      catMap.set(catName, existing);
    });

    return Array.from(catMap.values());
  }

  /**
   * Generates Daily / Periodic summary report
   */
  static async generateDailySummaryReport(
    startDate: string,
    endDate: string,
    hasFinancialPermission: boolean
  ): Promise<DailySummaryRow[]> {
    const bills = await ReportEngine.fetchBillsInRange(startDate, endDate);
    const billsByDate = new Map<string, Bill[]>();

    bills.forEach((bill) => {
      const date = bill.businessDate;
      const list = billsByDate.get(date) || [];
      list.push(bill);
      billsByDate.set(date, list);
    });

    const summaryRows: DailySummaryRow[] = [];
    billsByDate.forEach((dayBills, date) => {
      const breakdown = calculateDailyNetSales(dayBills);
      summaryRows.push({
        date,
        billCount: breakdown.validBillCount,
        totalQuantity: 0,
        totalSales: hasFinancialPermission ? breakdown.netSales : undefined,
        cancelledCount: breakdown.cancelledCount
      });
    });

    return summaryRows.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Generates real formatted Excel (.xlsx) file and triggers download in browser
   */
  static exportToExcel(data: Record<string, any>[], fileName: string, sheetName = 'Report'): void {
    if (!data || data.length === 0) {
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Auto-fit column widths
    const keys = Object.keys(data[0]);
    worksheet['!cols'] = keys.map((key) => {
      const maxLen = Math.max(
        key.length,
        ...data.map((row) => String(row[key] || '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
    });

    const cleanFileName = fileName.replace(/\//g, '-').replace(/\.xlsx$/i, '');
    XLSX.writeFile(workbook, `${cleanFileName}.xlsx`);
  }

  /**
   * Builds a jsPDF instance for the Daily Sales Backup PDF report (SSB_DD-MM-YYYY.pdf)
   */
  static createDailySalesBackupPDFDoc(
    report: DailySalesBackupReport,
    _settings?: RestaurantSettings
  ): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Restaurant Header Banner
    doc.setFillColor(15, 23, 42); // Deep slate-900 header
    doc.rect(0, 0, pageWidth, 36, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SRI SARAVANAN BHAVAN', pageWidth / 2, 12, { align: 'center' });

    doc.setFontSize(10.5);
    doc.setTextColor(251, 191, 36); // Amber-400
    doc.text('PURE VEG FAMILY RESTAURANT', pageWidth / 2, 18.5, { align: 'center' });

    doc.setFontSize(9.5);
    doc.setTextColor(226, 232, 240);
    doc.text('KALLAKURICHI', pageWidth / 2, 24, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`DAILY SALES REPORT  •  DATE: ${report.formattedDate}`, pageWidth / 2, 31, { align: 'center' });

    let currentY = 43;

    // 2. Daily Sales Summary Section
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Daily Sales Summary', 14, currentY);
    currentY += 2.5;

    autoTable(doc, {
      startY: currentY,
      head: [['Selected Sales Date', 'Total Number of Bills', 'Total Items Sold', 'Total Daily Sales Amount']],
      body: [[
        report.formattedDate,
        String(report.totalBills),
        String(report.totalItemsSold),
        formatIndianCurrency(report.totalDailySales)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [245, 158, 11], // Amber-500
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9.5,
        fontStyle: 'bold',
        textColor: [15, 23, 42],
        halign: 'center'
      },
      margin: { left: 14, right: 14 }
    });

    currentY = ((doc as any).lastAutoTable?.finalY || currentY + 18) + 8;

    // 3. Detailed Sales Table (S.No | Bill No | Date | Time | Item Name | Quantity | Unit Price | Total)
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Detailed Daily Sales Statement', 14, currentY);
    currentY += 2.5;

    const tableHead = [['S.No', 'Bill No', 'Date', 'Time', 'Item Name', 'Quantity', 'Unit Price', 'Total']];

    const tableBody =
      report.rows.length > 0
        ? report.rows.map((row) => [
            String(row.sno),
            String(row.billNo),
            row.date,
            row.time,
            row.itemName,
            String(row.quantity),
            formatIndianCurrency(row.unitPrice),
            formatIndianCurrency(row.total)
          ])
        : [['-', '-', report.formattedDate, '-', 'No sales records found for the selected date.', '0', formatIndianCurrency(0), formatIndianCurrency(0)]];

    const tableFoot = [
      [
        '',
        '',
        '',
        '',
        'GRAND TOTAL',
        String(report.totalItemsSold),
        '',
        formatIndianCurrency(report.totalDailySales)
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      head: tableHead,
      body: tableBody,
      foot: tableFoot,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59], // Slate-800
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [30, 41, 59]
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 9
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 13 }, // S.No
        1: { halign: 'center', cellWidth: 18 }, // Bill No
        2: { halign: 'center', cellWidth: 23 }, // Date
        3: { halign: 'center', cellWidth: 21 }, // Time
        4: { halign: 'left', cellWidth: 51 },   // Item Name
        5: { halign: 'center', cellWidth: 16 }, // Quantity
        6: { halign: 'right', cellWidth: 20 },  // Unit Price
        7: { halign: 'right', cellWidth: 20 }   // Total
      },
      margin: { left: 14, right: 14 }
    });

    // Add Page Footers
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `SRI SARAVANAN BHAVAN, KALLAKURICHI  •  Sales Date: ${report.formattedDate}`,
        14,
        290
      );
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, 290, { align: 'right' });
    }

    return doc;
  }

  /**
   * Returns binary PDF bytes (Uint8Array) for Cloud Storage upload & verification
   */
  static buildDailySalesBackupPDFBytes(
    report: DailySalesBackupReport,
    settings?: RestaurantSettings
  ): Uint8Array {
    const doc = ReportEngine.createDailySalesBackupPDFDoc(report, settings);
    const arrayBuffer = doc.output('arraybuffer');
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Generates and downloads the Daily Sales Backup PDF report (SSB_DD-MM-YYYY.pdf)
   */
  static exportDailySalesBackupPDF(
    report: DailySalesBackupReport,
    settings?: RestaurantSettings
  ): string {
    const doc = ReportEngine.createDailySalesBackupPDFDoc(report, settings);
    doc.save(report.pdfFileName);
    return report.pdfFileName;
  }

  /**
   * Builds the XLSX Workbook for the Daily Sales Backup Excel report (SSB_DD-MM-YYYY.xlsx)
   * with Daily Summary section and Detailed Sales columns:
   *   | S.No | Bill No | Date | Time | Item Name | Quantity | Unit Price | Total |
   * (No Item Code column).
   */
  static createDailySalesBackupExcelWorkbook(
    report: DailySalesBackupReport,
    _settings?: RestaurantSettings
  ): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();

    // Build main worksheet containing Daily Summary + Detailed Sales Table
    const sheetRows: any[][] = [
      ['SRI SARAVANAN BHAVAN'],
      ['PURE VEG FAMILY RESTAURANT'],
      ['KALLAKURICHI'],
      [],
      ['DAILY SALES SUMMARY', ''],
      ['Restaurant Name', 'SRI SARAVANAN BHAVAN - PURE VEG FAMILY RESTAURANT, KALLAKURICHI'],
      ['Sales Date', report.formattedDate],
      ['Total Bills', report.totalBills],
      ['Total Items Sold', report.totalItemsSold],
      ['Total Daily Sales', report.totalDailySales],
      [],
      ['S.No', 'Bill No', 'Date', 'Time', 'Item Name', 'Quantity', 'Unit Price', 'Total']
    ];

    const dataStartRowIndex = 13; // 1-based Excel row index where item rows begin

    if (report.rows.length > 0) {
      for (const row of report.rows) {
        sheetRows.push([
          row.sno,
          row.billNo,
          row.date,
          row.time,
          row.itemName,
          row.quantity,
          row.unitPrice,
          row.total
        ]);
      }
    } else {
      sheetRows.push([
        '-',
        '-',
        report.formattedDate,
        '-',
        'No sales records found for the selected date.',
        0,
        0,
        0
      ]);
    }

    // Grand Total Row
    sheetRows.push([
      '',
      '',
      '',
      '',
      'Grand Total',
      report.totalItemsSold,
      '',
      report.totalDailySales
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    // Format currency cells with Indian Rupee format ("₹"#,##0.00)
    const currencyFormat = '"₹"#,##0.00';
    if (ws['B10']) {
      ws['B10'].t = 'n';
      ws['B10'].v = report.totalDailySales;
      ws['B10'].z = currencyFormat;
    }

    const itemRowCount = Math.max(report.rows.length, 1);
    for (let i = 0; i < itemRowCount; i++) {
      const rIdx = dataStartRowIndex + i;
      const unitPriceCell = ws[`G${rIdx}`];
      const totalCell = ws[`H${rIdx}`];
      if (unitPriceCell && typeof unitPriceCell.v === 'number') {
        unitPriceCell.z = currencyFormat;
      }
      if (totalCell && typeof totalCell.v === 'number') {
        totalCell.z = currencyFormat;
      }
    }

    const grandTotalExcelRow = dataStartRowIndex + itemRowCount;
    const lastDataExcelRow = grandTotalExcelRow - 1;
    if (report.rows.length > 0) {
      ws[`F${grandTotalExcelRow}`] = {
        t: 'n',
        v: report.totalItemsSold,
        f: `SUM(F${dataStartRowIndex}:F${lastDataExcelRow})`
      };
      ws[`H${grandTotalExcelRow}`] = {
        t: 'n',
        v: report.totalDailySales,
        f: `SUM(H${dataStartRowIndex}:H${lastDataExcelRow})`,
        z: currencyFormat
      };
    } else if (ws[`H${grandTotalExcelRow}`]) {
      ws[`H${grandTotalExcelRow}`].z = currencyFormat;
    }

    // Proper column widths
    ws['!cols'] = [
      { wch: 10 }, // S.No
      { wch: 14 }, // Bill No
      { wch: 15 }, // Date
      { wch: 14 }, // Time
      { wch: 36 }, // Item Name
      { wch: 12 }, // Quantity
      { wch: 16 }, // Unit Price
      { wch: 18 }  // Total
    ];

    XLSX.utils.book_append_sheet(workbook, ws, 'Daily Sales Report');

    // Also include a dedicated 'Daily Summary' sheet
    const summarySheetRows: any[][] = [
      ['SRI SARAVANAN BHAVAN'],
      ['PURE VEG FAMILY RESTAURANT'],
      ['KALLAKURICHI'],
      [],
      ['Field', 'Value'],
      ['Restaurant Name', 'SRI SARAVANAN BHAVAN'],
      ['Sales Date', report.formattedDate],
      ['Total Bills', report.totalBills],
      ['Total Items Sold', report.totalItemsSold],
      ['Total Daily Sales', report.totalDailySales]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetRows);
    if (wsSummary['B10']) {
      wsSummary['B10'].t = 'n';
      wsSummary['B10'].v = report.totalDailySales;
      wsSummary['B10'].z = currencyFormat;
    }
    wsSummary['!cols'] = [{ wch: 24 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Daily Summary');

    return workbook;
  }

  /**
   * Returns binary Excel (.xlsx) bytes (Uint8Array) for Cloud Storage upload & verification
   */
  static buildDailySalesBackupExcelBytes(
    report: DailySalesBackupReport,
    settings?: RestaurantSettings
  ): Uint8Array {
    const workbook = ReportEngine.createDailySalesBackupExcelWorkbook(report, settings);
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Uint8Array(buffer);
  }

  /**
   * Generates and downloads the Daily Sales Backup Excel workbook (SSB_DD-MM-YYYY.xlsx)
   */
  static exportDailySalesBackupExcel(
    report: DailySalesBackupReport,
    settings?: RestaurantSettings
  ): string {
    const workbook = ReportEngine.createDailySalesBackupExcelWorkbook(report, settings);
    XLSX.writeFile(workbook, report.excelFileName);
    return report.excelFileName;
  }

  /**
   * Generates a formatted client-side PDF report containing Daily Sales Summaries,
   * Active Report Breakdown, and Transaction Lists, and triggers download.
   */
  static exportReportToPDF(options: PDFReportExportOptions): void {
    const {
      startDate,
      endDate,
      reportType,
      hasFinancialPermission,
      dailySummaryRows,
      transactions,
      itemData = [],
      categoryData = [],
      inventorySummary = []
    } = options;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const isSingleDay = startDate === endDate;
    const formattedStart = formatDateDDMMYYYY(startDate);
    const formattedEnd = formatDateDDMMYYYY(endDate);
    const periodLabel = isSingleDay
      ? `Sales Date: ${formattedStart}`
      : `Period: ${formattedStart} to ${formattedEnd}`;

    const netSalesBreakdown = calculateDailyNetSales(transactions);

    // 1. Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 34, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('SRI SARAVANAN BHAVAN', 105, 11, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(251, 191, 36);
    doc.text('PURE VEG FAMILY RESTAURANT', 105, 17, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(226, 232, 240);
    doc.text('KALLAKURICHI', 105, 22.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(periodLabel, 14, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, 30, { align: 'right' });

    let currentY = 42;

    // 2. Executive Net Sales Summary KPIs
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('1. Daily Sales Summary & KPIs', 14, currentY);
    currentY += 3;

    const kpiHeaders = hasFinancialPermission
      ? [['Net Sales', 'Valid Bills', 'Cash Sales', 'UPI / Digital', 'Dine-In / Takeaway', 'Cancelled Bills']]
      : [['Valid Bills', 'Dine-In Orders', 'Takeaway Orders', 'Cancelled Bills']];

    const kpiBody = hasFinancialPermission
      ? [[
          formatIndianCurrency(netSalesBreakdown.netSales),
          String(netSalesBreakdown.validBillCount),
          formatIndianCurrency(netSalesBreakdown.cashSales),
          formatIndianCurrency(netSalesBreakdown.upiSales),
          `${netSalesBreakdown.dineInCount} / ${netSalesBreakdown.takeAwayCount}`,
          `${netSalesBreakdown.cancelledCount} (${formatIndianCurrency(netSalesBreakdown.cancelledAmount)})`
        ]]
      : [[
          String(netSalesBreakdown.validBillCount),
          String(netSalesBreakdown.dineInCount),
          String(netSalesBreakdown.takeAwayCount),
          String(netSalesBreakdown.cancelledCount)
        ]];

    autoTable(doc, {
      startY: currentY,
      head: kpiHeaders,
      body: kpiBody,
      theme: 'grid',
      headStyles: {
        fillColor: [245, 158, 11],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 9,
        fontStyle: 'bold',
        textColor: [15, 23, 42]
      },
      margin: { left: 14, right: 14 }
    });

    currentY = ((doc as any).lastAutoTable?.finalY || currentY + 18) + 8;

    // 3. Day-by-Day Sales Summary Table
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('2. Business Day Sales Breakdown', 14, currentY);
    currentY += 3;

    const dailyHead = hasFinancialPermission
      ? [['Business Date', 'Valid Bills', 'Dine-In / Parcel', 'Cash Sales', 'UPI Sales', 'Cancelled', 'Net Sales']]
      : [['Business Date', 'Valid Bills', 'Dine-In', 'Takeaway', 'Cancelled']];

    const dailyBody = dailySummaryRows.length > 0
      ? dailySummaryRows.map((row) =>
          hasFinancialPermission
            ? [
                formatDateDDMMYYYY(row.date),
                String(row.validBillCount),
                `${row.dineInCount} / ${row.takeAwayCount}`,
                formatIndianCurrency(row.cashSales),
                formatIndianCurrency(row.upiSales),
                `${row.cancelledCount} (${formatIndianCurrency(row.cancelledAmount)})`,
                formatIndianCurrency(row.netSales)
              ]
            : [
                formatDateDDMMYYYY(row.date),
                String(row.validBillCount),
                String(row.dineInCount),
                String(row.takeAwayCount),
                String(row.cancelledCount)
              ]
        )
      : [[hasFinancialPermission ? 'No daily sales recorded for selected period' : 'No daily sales recorded', '-', '-', '-', '-', '-', '-'].slice(0, dailyHead[0].length)];

    autoTable(doc, {
      startY: currentY,
      head: dailyHead,
      body: dailyBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [30, 41, 59]
      },
      margin: { left: 14, right: 14 }
    });

    currentY = ((doc as any).lastAutoTable?.finalY || currentY + 20) + 8;

    // 4. Optional Active Report Section (Item-Wise / Category-Wise / Inventory — without Item Code)
    let nextSectionIndex = 3;
    if (reportType === 'item-wise' && itemData.length > 0) {
      if (currentY > 245) {
        doc.addPage();
        currentY = 18;
      }
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${nextSectionIndex}. Item-Wise Sales Summary`, 14, currentY);
      nextSectionIndex++;
      currentY += 3;

      const itemHead = hasFinancialPermission
        ? [['S.No', 'Item Name', 'Qty Sold', 'Orders', 'Sales Value']]
        : [['S.No', 'Item Name', 'Qty Sold', 'Orders']];

      const itemBody = itemData.map((item, idx) =>
        hasFinancialPermission
          ? [
              String(idx + 1),
              sanitizeItemNameOnly(item.itemName, item.itemCode),
              String(item.quantitySold),
              String(item.orderCount),
              formatIndianCurrency(item.salesValue)
            ]
          : [
              String(idx + 1),
              sanitizeItemNameOnly(item.itemName, item.itemCode),
              String(item.quantitySold),
              String(item.orderCount)
            ]
      );

      autoTable(doc, {
        startY: currentY,
        head: itemHead,
        body: itemBody,
        theme: 'grid',
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [30, 41, 59]
        },
        margin: { left: 14, right: 14 }
      });

      currentY = ((doc as any).lastAutoTable?.finalY || currentY + 20) + 8;
    } else if (reportType === 'category-wise' && categoryData.length > 0) {
      if (currentY > 245) {
        doc.addPage();
        currentY = 18;
      }
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${nextSectionIndex}. Category-Wise Sales Summary`, 14, currentY);
      nextSectionIndex++;
      currentY += 3;

      const catHead = hasFinancialPermission
        ? [['Category Name', 'Total Qty Sold', 'Orders', 'Total Sales Value']]
        : [['Category Name', 'Total Qty Sold', 'Orders']];

      const catBody = categoryData.map((cat) =>
        hasFinancialPermission
          ? [cat.categoryName, String(cat.totalQuantity), String(cat.orderCount), formatIndianCurrency(cat.totalSalesValue)]
          : [cat.categoryName, String(cat.totalQuantity), String(cat.orderCount)]
      );

      autoTable(doc, {
        startY: currentY,
        head: catHead,
        body: catBody,
        theme: 'grid',
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [30, 41, 59]
        },
        margin: { left: 14, right: 14 }
      });

      currentY = ((doc as any).lastAutoTable?.finalY || currentY + 20) + 8;
    } else if (reportType === 'inventory' && inventorySummary.length > 0) {
      if (currentY > 245) {
        doc.addPage();
        currentY = 18;
      }
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${nextSectionIndex}. Inventory Stock Snapshot`, 14, currentY);
      nextSectionIndex++;
      currentY += 3;

      autoTable(doc, {
        startY: currentY,
        head: [['S.No', 'Item Name', 'Current Stock', 'Unit', 'Min Stock']],
        body: inventorySummary.map((inv, idx) => [
          String(idx + 1),
          sanitizeItemNameOnly(inv.itemName || '-', inv.itemCode),
          String(inv.currentStock ?? 0),
          inv.unit || '-',
          String(inv.minimumStock || 5)
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [30, 41, 59]
        },
        margin: { left: 14, right: 14 }
      });

      currentY = ((doc as any).lastAutoTable?.finalY || currentY + 20) + 8;
    }

    // 5. Transaction List (Valid Completed Bills & Cancelled Bills)
    if (currentY > 240) {
      doc.addPage();
      currentY = 18;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${nextSectionIndex}. Transaction List (${transactions.length} Bills)`, 14, currentY);
    currentY += 3;

    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateCmp = (b.businessDate || '').localeCompare(a.businessDate || '');
      if (dateCmp !== 0) return dateCmp;
      return Number(b.billNumber || 0) - Number(a.billNumber || 0);
    });

    const txHead = hasFinancialPermission
      ? [['Bill No', 'Date', 'Time', 'Order Type', 'Payment', 'Status', 'Amount']]
      : [['Bill No', 'Date', 'Time', 'Order Type', 'Payment', 'Status']];

    const txBody = sortedTransactions.length > 0
      ? sortedTransactions.map((bill) => {
          const orderTypeLabel =
            bill.orderType === 'TAKE_AWAY' || (bill.orderType as string) === 'TAKEAWAY'
              ? 'Takeaway'
              : 'Dine-In';
          const statusLabel = bill.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
          return hasFinancialPermission
            ? [
                String(bill.billNumber),
                formatDateDDMMYYYY(bill.businessDate || '-'),
                formatBillTime(bill.createdAt),
                orderTypeLabel,
                bill.paymentMethod || 'CASH',
                statusLabel,
                formatIndianCurrency(bill.grandTotal)
              ]
            : [
                String(bill.billNumber),
                formatDateDDMMYYYY(bill.businessDate || '-'),
                formatBillTime(bill.createdAt),
                orderTypeLabel,
                bill.paymentMethod || 'CASH',
                statusLabel
              ];
        })
      : [[hasFinancialPermission ? 'No sales records found for the selected date.' : 'No sales records found for the selected date.', '-', '-', '-', '-', '-', '-'].slice(0, txHead[0].length)];

    autoTable(doc, {
      startY: currentY,
      head: txHead,
      body: txBody,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59]
      },
      margin: { left: 14, right: 14 }
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `SRI SARAVANAN BHAVAN, KALLAKURICHI • POS Report (${isSingleDay ? formattedStart : `${formattedStart} to ${formattedEnd}`})`,
        14,
        290
      );
      doc.text(`Page ${i} of ${totalPages}`, 196, 290, { align: 'right' });
    }

    const fileName = isSingleDay
      ? getDailyBackupFileName(startDate, 'pdf')
      : `SSB_${formattedStart}_to_${formattedEnd}.pdf`;
    doc.save(fileName);
  }
}


