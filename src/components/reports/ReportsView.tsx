import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart3, 
  Printer, 
  Calendar, 
  TrendingUp, 
  Layers, 
  FileSpreadsheet, 
  FileDown,
  Ban, 
  Boxes, 
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CreditCard,
  Receipt,
  Archive,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CloudUpload,
  FolderArchive,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  ReportEngine, 
  ItemWiseReportRow, 
  CategoryWiseReportRow, 
  DailySalesBackupReport,
  formatDateDDMMYYYY,
  getDailyBackupFileName,
  formatIndianCurrency,
  sanitizeItemNameOnly
} from '../../services/reportEngine';
import {
  getDailySalesBackupConfig,
  saveDailySalesBackupConfig,
  getDailySalesBackupStatusForDate,
  fetchDailySalesBackupHistory,
  runDailySalesBackupForDate,
  downloadDailySalesBackupFile,
  subscribeDailySalesBackupStatus,
  getCloudStorageFolderForDate,
  getCloudStorageFilePath
} from '../../services/autoDailyBackupService';
import { formatISTTimestamp } from '../../services/securityService';
import {
  Bill,
  RestaurantSettings,
  Category,
  DailySalesBackupStatusRecord,
  DailySalesBackupConfig,
  BackupProcessStatus
} from '../../types';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { MonthlyCalendarPicker } from '../common/MonthlyCalendarPicker';
import { subscribeToLocalBills } from '../../services/localBillStore';
import { purgeAllBills } from '../../services/billCleanupService';
import { getBusinessDate } from '../../services/billNumberEngine';
import { calculateDailyNetSales } from '../../services/salesCalculationEngine';

interface ReportsViewProps {
  settings?: RestaurantSettings;
}

function shiftDateYMD(ymd: string, deltaDays: number): string {
  const parts = ymd.split('-').map((p) => parseInt(p, 10));
  const year = parts[0] || new Date().getFullYear();
  const month = parts[1] || (new Date().getMonth() + 1);
  const day = parts[2] || new Date().getDate();
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getBackupStatusBadgeClass(status: BackupProcessStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Processing':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'Pending':
    default:
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
}

export const ReportsView: React.FC<ReportsViewProps> = ({ settings }) => {
  const { currentUser, isOwner, isManager, hasPermission } = useAuth();
  // Owner and Store Manager have permission to view and download daily sales reports
  const hasFinancialPermission =
    isOwner || isManager || hasPermission('reports.financial') || hasPermission('reports.view');

  const currentBusinessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');
  const yesterdayBusinessDate = useMemo(() => shiftDateYMD(currentBusinessDate, -1), [currentBusinessDate]);

  const [reportType, setReportType] = useState<
    | 'daily-backup'
    | 'item-wise'
    | 'bill-wise'
    | 'ac-non-ac'
    | 'dinein-takeaway'
    | 'monthly'
    | 'category-wise'
    | 'daily'
    | 'cancelled'
    | 'inventory'
  >('daily-backup');
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');
  const [selectedBusinessDate, setSelectedBusinessDate] = useState<string>(() => currentBusinessDate);
  const [startDate, setStartDate] = useState<string>(() => currentBusinessDate);
  const [endDate, setEndDate] = useState<string>(() => currentBusinessDate);

  const isSingleBusinessDay = startDate === endDate;

  const handleSelectSingleBusinessDay = (dateStr: string) => {
    if (!dateStr) return;
    setSelectedBusinessDate(dateStr);
    setStartDate(dateStr);
    setEndDate(dateStr);
  };

  const [loading, setLoading] = useState(false);
  const [dailyBackupReport, setDailyBackupReport] = useState<DailySalesBackupReport>(() => ({
    businessDate: currentBusinessDate,
    formattedDate: formatDateDDMMYYYY(currentBusinessDate),
    pdfFileName: getDailyBackupFileName(currentBusinessDate, 'pdf'),
    excelFileName: getDailyBackupFileName(currentBusinessDate, 'xlsx'),
    totalBills: 0,
    totalItemsSold: 0,
    totalDailySales: 0,
    rows: [],
    bills: []
  }));
  const [itemData, setItemData] = useState<ItemWiseReportRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryWiseReportRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [billsInRange, setBillsInRange] = useState<Bill[]>([]);
  const [cancelledBills, setCancelledBills] = useState<Bill[]>([]);
  const [inventorySummary, setInventorySummary] = useState<any[]>([]);

  // Automatic Daily Sales Backup state
  const [backupConfig, setBackupConfig] = useState<DailySalesBackupConfig>(getDailySalesBackupConfig);
  const [closingTimeInput, setClosingTimeInput] = useState<string>(() => getDailySalesBackupConfig().dailyClosingTime);
  const [savingClosingTime, setSavingClosingTime] = useState(false);
  const [selectedDateBackupStatus, setSelectedDateBackupStatus] = useState<DailySalesBackupStatusRecord | null>(null);
  const [backupHistoryList, setBackupHistoryList] = useState<DailySalesBackupStatusRecord[]>([]);
  const [regeneratingBackup, setRegeneratingBackup] = useState(false);

  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'categories'))
      .then((snap) => {
        const list: Category[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
        setCategories(list);
      })
      .catch((e) => console.warn('Categories report load notice:', e));
  }, []);

  const loadBackupStatusAndHistory = useCallback(async (targetDate: string) => {
    try {
      const cfg = getDailySalesBackupConfig();
      setBackupConfig(cfg);
      const [statusRec, historyRecs] = await Promise.all([
        getDailySalesBackupStatusForDate(targetDate),
        fetchDailySalesBackupHistory(30)
      ]);
      setSelectedDateBackupStatus(statusRec);
      setBackupHistoryList(historyRecs);
    } catch (err) {
      console.warn('Backup status fetch notice:', err);
    }
  }, []);

  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Generate Daily Sales Backup Report for selectedBusinessDate directly from Firebase Firestore
      const backupData = await ReportEngine.generateDailySalesBackupReport(selectedBusinessDate);
      setDailyBackupReport(backupData);

      // 1b. Load Automatic Daily Sales Backup status & history
      await loadBackupStatusAndHistory(selectedBusinessDate);

      // 2. Process Item-Wise Report
      const itemRows = await ReportEngine.generateItemWiseReport(startDate, endDate, hasFinancialPermission);
      setItemData(itemRows);

      // 3. Process Category-Wise Report
      const catRows = await ReportEngine.generateCategoryWiseReport(
        startDate,
        endDate,
        categories,
        hasFinancialPermission
      );
      setCategoryData(catRows);

      // 4. Fetch All Bills in Range for Net Sales Analysis & Cancelled Bills
      const allBills = await ReportEngine.fetchBillsInRange(startDate, endDate);
      setBillsInRange(allBills);
      setCancelledBills(allBills.filter((b) => b.status === 'CANCELLED'));

      // 5. Fetch Inventory Snapshot
      try {
        const invSnap = await getDocs(collection(db, 'inventory_items'));
        const invList: any[] = [];
        invSnap.forEach((d) => invList.push({ id: d.id, ...d.data() }));
        setInventorySummary(invList);
      } catch (e) {
        console.warn('Inventory fetch report notice:', e);
      }
    } catch (err) {
      console.error('Error generating report:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBusinessDate, startDate, endDate, hasFinancialPermission, categories, loadBackupStatusAndHistory]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Subscribe to Automatic Daily Sales Backup events
  useEffect(() => {
    const unsubscribeBackupStatus = subscribeDailySalesBackupStatus((rec) => {
      if (rec.businessDate === selectedBusinessDate) {
        setSelectedDateBackupStatus(rec);
      }
      loadBackupStatusAndHistory(selectedBusinessDate);
    });
    return () => unsubscribeBackupStatus();
  }, [selectedBusinessDate, loadBackupStatusAndHistory]);

  useEffect(() => {
    const unsubscribeLocal = subscribeToLocalBills(() => {
      loadReportData();
    });
    const handleErased = () => {
      setItemData([]);
      setCategoryData([]);
      setBillsInRange([]);
      setCancelledBills([]);
      loadReportData();
    };
    window.addEventListener('pos_bills_erased', handleErased);
    return () => {
      unsubscribeLocal();
      window.removeEventListener('pos_bills_erased', handleErased);
    };
  }, [loadReportData]);

  // Canonical Net Sales Calculation for the selected business day or date range
  const netSalesAnalysis = useMemo(() => calculateDailyNetSales(billsInRange), [billsInRange]);

  // Day-by-day Net Sales breakdown for Daily Net Sales report tab
  const dailyNetSalesRows = useMemo(() => {
    const byDate = new Map<string, Bill[]>();
    billsInRange.forEach((bill) => {
      if (!bill.businessDate) return;
      const list = byDate.get(bill.businessDate) || [];
      list.push(bill);
      byDate.set(bill.businessDate, list);
    });

    const rows = Array.from(byDate.entries()).map(([date, dayBills]) => {
      const breakdown = calculateDailyNetSales(dayBills);
      return {
        date,
        validBillCount: breakdown.validBillCount,
        dineInCount: breakdown.dineInCount,
        takeAwayCount: breakdown.takeAwayCount,
        dineInSales: breakdown.dineInSales,
        takeAwaySales: breakdown.takeAwaySales,
        acCount: breakdown.acCount,
        nonAcCount: breakdown.nonAcCount,
        acSales: breakdown.acSales,
        nonAcSales: breakdown.nonAcSales,
        cashSales: breakdown.cashSales,
        upiSales: breakdown.upiSales,
        cancelledCount: breakdown.cancelledCount,
        cancelledAmount: breakdown.cancelledAmount,
        netSales: breakdown.netSales
      };
    });

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [billsInRange]);

  // Monthly Sales aggregation
  const monthlySalesRows = useMemo(() => {
    const byMonth = new Map<string, Bill[]>();
    billsInRange.forEach((bill) => {
      if (!bill.businessDate) return;
      const monthKey = bill.businessDate.slice(0, 7); // YYYY-MM
      const list = byMonth.get(monthKey) || [];
      list.push(bill);
      byMonth.set(monthKey, list);
    });

    return Array.from(byMonth.entries())
      .map(([monthKey, monthBills]) => {
        const b = calculateDailyNetSales(monthBills);
        return {
          monthKey,
          validBillCount: b.validBillCount,
          dineInSales: b.dineInSales,
          takeAwaySales: b.takeAwaySales,
          acSales: b.acSales,
          nonAcSales: b.nonAcSales,
          netSales: b.netSales
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [billsInRange]);

  const completedBillsInRange = useMemo(
    () =>
      netSalesAnalysis.validBills.filter((b) => {
        const q = reportSearchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          String(b.billNumber || '').toLowerCase().includes(q) ||
          String(b.orderType || '').toLowerCase().includes(q) ||
          String(b.priceType || '').toLowerCase().includes(q) ||
          String(b.businessDate || '').toLowerCase().includes(q)
        );
      }),
    [netSalesAnalysis.validBills, reportSearchQuery]
  );

  const handlePurgeSalesData = async () => {
    setClearing(true);
    try {
      await purgeAllBills();
      setItemData([]);
      setCategoryData([]);
      setBillsInRange([]);
      setCancelledBills([]);
      setShowClearModal(false);
      setFeedbackNotice('All bills, backups, and sales history cleared successfully! Starting fresh with 0.');
      setTimeout(() => setFeedbackNotice(null), 4000);
      loadReportData();
    } catch (err: any) {
      setFeedbackNotice('Failed to clear sales data: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setFeedbackNotice(null), 4000);
    } finally {
      setClearing(false);
    }
  };

  /**
   * Downloads Daily Sales Report & Backup as PDF (SSB_DD-MM-YYYY.pdf)
   */
  const handleDownloadDailySalesPDF = async (targetDate: string = selectedBusinessDate) => {
    try {
      const fileName = await downloadDailySalesBackupFile(targetDate, 'pdf', currentUser, settings);
      if (targetDate === selectedBusinessDate) {
        const freshReport = await ReportEngine.generateDailySalesBackupReport(selectedBusinessDate);
        setDailyBackupReport(freshReport);
      }
      await loadBackupStatusAndHistory(selectedBusinessDate);
      setFeedbackNotice(`Daily Sales PDF downloaded: ${fileName}`);
      setTimeout(() => setFeedbackNotice(null), 4000);
    } catch (err: any) {
      console.error('Daily Sales PDF export error:', err);
      setFeedbackNotice('Unable to generate Daily Sales PDF: ' + (err?.message || 'Unexpected error'));
      setTimeout(() => setFeedbackNotice(null), 4000);
    }
  };

  /**
   * Downloads Daily Sales Report & Backup as Excel (SSB_DD-MM-YYYY.xlsx)
   */
  const handleDownloadDailySalesExcel = async (targetDate: string = selectedBusinessDate) => {
    try {
      const fileName = await downloadDailySalesBackupFile(targetDate, 'xlsx', currentUser, settings);
      if (targetDate === selectedBusinessDate) {
        const freshReport = await ReportEngine.generateDailySalesBackupReport(selectedBusinessDate);
        setDailyBackupReport(freshReport);
      }
      await loadBackupStatusAndHistory(selectedBusinessDate);
      setFeedbackNotice(`Daily Sales Excel downloaded: ${fileName}`);
      setTimeout(() => setFeedbackNotice(null), 4000);
    } catch (err: any) {
      console.error('Daily Sales Excel export error:', err);
      setFeedbackNotice('Unable to generate Daily Sales Excel: ' + (err?.message || 'Unexpected error'));
      setTimeout(() => setFeedbackNotice(null), 4000);
    }
  };

  /**
   * Manually regenerates both PDF and Excel backup files for a specific business date
   * and uploads them to Firebase Cloud Storage (`Daily_Sales_Backup/{YYYY}/{MM-MonthName}/SSB_{DD-MM-YYYY}.{pdf|xlsx}`).
   */
  const handleRegenerateBackupForDate = async (targetDate: string = selectedBusinessDate) => {
    setRegeneratingBackup(true);
    try {
      const result = await runDailySalesBackupForDate(targetDate, {
        triggerType: 'MANUAL_REGENERATE',
        initiatedBy: currentUser?.username || currentUser?.name || 'authorized_user',
        force: true,
        settings
      });
      await loadBackupStatusAndHistory(selectedBusinessDate);
      if (result.status === 'Completed') {
        setFeedbackNotice(
          `Backup regenerated & verified for ${result.formattedDate}: ${result.pdfFileName} & ${result.excelFileName}`
        );
      } else {
        setFeedbackNotice(
          `Backup status for ${result.formattedDate}: ${result.status}${result.failureReason ? ` (${result.failureReason})` : ''}`
        );
      }
      setTimeout(() => setFeedbackNotice(null), 4500);
    } catch (err: any) {
      setFeedbackNotice('Failed to regenerate backup: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setFeedbackNotice(null), 4000);
    } finally {
      setRegeneratingBackup(false);
    }
  };

  /**
   * Owner-only: Saves the daily sales closing time (Asia/Kolkata) for automatic backups.
   */
  const handleSaveClosingTime = async () => {
    if (!isOwner) return;
    setSavingClosingTime(true);
    try {
      const updated = await saveDailySalesBackupConfig(
        {
          dailyClosingTime: closingTimeInput,
          timezone: 'Asia/Kolkata',
          enabled: true
        },
        currentUser
      );
      setBackupConfig(updated);
      setFeedbackNotice(`Daily closing time updated to ${updated.dailyClosingTime} (Asia/Kolkata).`);
      setTimeout(() => setFeedbackNotice(null), 4000);
    } catch (err: any) {
      setFeedbackNotice('Unable to update closing time: ' + (err?.message || 'Permission denied'));
      setTimeout(() => setFeedbackNotice(null), 4000);
    } finally {
      setSavingClosingTime(false);
    }
  };

  const handleExportPDF = () => {
    if (reportType === 'daily-backup' || isSingleBusinessDay) {
      handleDownloadDailySalesPDF(selectedBusinessDate);
      return;
    }
    try {
      ReportEngine.exportReportToPDF({
        restaurantName: 'SRI SARAVANAN BHAVAN',
        address: 'PURE VEG FAMILY RESTAURANT, KALLAKURICHI',
        phone: settings?.phone,
        startDate,
        endDate,
        reportType,
        hasFinancialPermission,
        dailySummaryRows: dailyNetSalesRows,
        transactions: billsInRange,
        itemData,
        categoryData,
        inventorySummary
      });
      setFeedbackNotice(`PDF Report downloaded for ${formatDateDDMMYYYY(startDate)} to ${formatDateDDMMYYYY(endDate)}.`);
      setTimeout(() => setFeedbackNotice(null), 4000);
    } catch (err: any) {
      console.error('PDF export error:', err);
      setFeedbackNotice('Unable to generate PDF report: ' + (err?.message || 'Unexpected error'));
      setTimeout(() => setFeedbackNotice(null), 4000);
    }
  };

  const handleExportXLSX = () => {
    if (reportType === 'daily-backup' || isSingleBusinessDay) {
      handleDownloadDailySalesExcel(selectedBusinessDate);
      return;
    }
    const formattedRange = `${formatDateDDMMYYYY(startDate)}_to_${formatDateDDMMYYYY(endDate)}`;
    if (reportType === 'item-wise') {
      ReportEngine.exportToExcel(
        itemData.map((i, idx) => ({
          'S.No': idx + 1,
          'Item Name': sanitizeItemNameOnly(i.itemName, i.itemCode),
          'Quantity Sold': i.quantitySold,
          'Orders': i.orderCount,
          'Total Revenue (₹)': i.salesValue
        })),
        `SSB_Item_Sales_${formattedRange}`
      );
    } else if (reportType === 'category-wise') {
      ReportEngine.exportToExcel(
        categoryData.map((c) => ({
          'Category': c.categoryName,
          'Quantity Sold': c.totalQuantity,
          'Total Revenue (₹)': c.totalSalesValue,
          'Orders': c.orderCount
        })),
        `SSB_Category_Sales_${formattedRange}`
      );
    } else if (reportType === 'daily') {
      ReportEngine.exportToExcel(
        dailyNetSalesRows.map((d) => ({
          'Business Date': formatDateDDMMYYYY(d.date),
          'Valid Bills': d.validBillCount,
          'Dine-In Orders': d.dineInCount,
          'Takeaway Orders': d.takeAwayCount,
          'Cash Sales (₹)': d.cashSales,
          'UPI Sales (₹)': d.upiSales,
          'Cancelled Bills': d.cancelledCount,
          'Net Sales (₹)': d.netSales
        })),
        `SSB_Daily_Net_Sales_${formattedRange}`
      );
    } else if (reportType === 'cancelled') {
      ReportEngine.exportToExcel(
        cancelledBills.map((b) => ({
          'Bill Number': b.billNumber,
          'Date': formatDateDDMMYYYY(b.businessDate),
          'Total (₹)': b.grandTotal,
          'Reason': b.cancelReason || 'Cancelled',
          'Cancelled By': b.cancelledBy || 'Staff'
        })),
        `SSB_Cancelled_Bills_${formattedRange}`
      );
    } else if (reportType === 'inventory') {
      ReportEngine.exportToExcel(
        inventorySummary.map((inv, idx) => ({
          'S.No': idx + 1,
          'Item Name': sanitizeItemNameOnly(inv.itemName, inv.itemCode),
          'Current Stock': inv.currentStock,
          'Unit': inv.unit,
          'Low Stock Threshold': inv.minimumStock || 5
        })),
        `SSB_Inventory_${formatDateDDMMYYYY(currentBusinessDate)}`
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalRevenue = itemData.reduce((s, i) => s + (i.salesValue || 0), 0);
  const totalQuantity = itemData.reduce((s, i) => s + i.quantitySold, 0);

  // Derived backup status metrics for the selected date
  const pdfBackupStatus: BackupProcessStatus = selectedDateBackupStatus?.pdfBackupStatus || 'Pending';
  const excelBackupStatus: BackupProcessStatus = selectedDateBackupStatus?.excelBackupStatus || 'Pending';
  const overallBackupStatus: BackupProcessStatus = selectedDateBackupStatus?.status || 'Pending';
  const cloudStorageFolder = getCloudStorageFolderForDate(selectedBusinessDate);
  const pdfCloudPath =
    selectedDateBackupStatus?.pdfStoragePath || getCloudStorageFilePath(selectedBusinessDate, 'pdf');
  const excelCloudPath =
    selectedDateBackupStatus?.excelStoragePath || getCloudStorageFilePath(selectedBusinessDate, 'xlsx');

  const latestSuccessfulBackup = useMemo(() => {
    const completed = backupHistoryList.filter((r) => r.status === 'Completed' && r.lastSuccessfulBackupAt);
    if (completed.length === 0) return null;
    return completed.sort((a, b) => (b.lastSuccessfulBackupAt || 0) - (a.lastSuccessfulBackupAt || 0))[0];
  }, [backupHistoryList]);

  const failedBackups = useMemo(
    () => backupHistoryList.filter((r) => r.status === 'Failed' || r.pdfBackupStatus === 'Failed' || r.excelBackupStatus === 'Failed'),
    [backupHistoryList]
  );

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 bg-slate-100/90 text-slate-800 p-2 sm:p-4 gap-3 sm:gap-4 overflow-y-auto pb-24 md:pb-6 font-sans">
      
      {/* Owner Alert Banner if any Automatic Daily Sales Backup failed */}
      {isOwner && failedBackups.length > 0 && (
        <div
          data-testid="owner-backup-failure-alert"
          className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-red-900 uppercase tracking-wide">
                Owner Alert: Automatic Daily Sales Backup Failed ({failedBackups.length} date{failedBackups.length > 1 ? 's' : ''})
              </h4>
              <p className="text-[11px] text-red-700 mt-0.5">
                Date: <strong>{failedBackups[0].formattedDate}</strong> — Reason:{' '}
                {failedBackups[0].failureReason || 'Cloud upload or generation interrupted'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={regeneratingBackup}
            onClick={() => handleRegenerateBackupForDate(failedBackups[0].businessDate)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${regeneratingBackup ? 'animate-spin' : ''}`} />
            <span>Retry Backup Now</span>
          </button>
        </div>
      )}

      {/* 1. Report Header & Filter Bar */}
      <div className="bg-[#0F172A] text-white border border-slate-800 rounded-xl px-3.5 sm:px-4 py-3.5 flex flex-col gap-3 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-2xs shrink-0">
              <BarChart3 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-black text-sm sm:text-base tracking-tight text-white uppercase leading-none">
                  SRI SARAVANAN BHAVAN • Enterprise Sales Reports &amp; Backup
                </h2>
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950 border border-emerald-700/60 px-2.5 py-0.5 rounded-md font-mono">
                  Sales Date: {formatDateDDMMYYYY(selectedBusinessDate)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                PURE VEG FAMILY RESTAURANT, KALLAKURICHI — Daily, Monthly, Item-Wise, Bill-Wise, AC/Non-AC &amp; Dine-In/Takeaway Analytics
              </p>
            </div>
          </div>

          {/* Date Range & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <MonthlyCalendarPicker
              startDate={startDate}
              endDate={endDate}
              onChange={({ startDate: s, endDate: e }) => {
                setStartDate(s);
                setEndDate(e);
                if (s === e) {
                  setSelectedBusinessDate(s);
                }
              }}
            />

            <button
              type="button"
              onClick={loadReportData}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl cursor-pointer transition-colors"
              title="Refresh Sales Data from Firebase"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => handleDownloadDailySalesPDF(selectedBusinessDate)}
              data-testid="download-pdf-report-btn"
              className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title={`Download ${dailyBackupReport.pdfFileName}`}
            >
              <FileDown className="w-4 h-4 text-emerald-400" />
              <span>Download Daily Sales – PDF</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadDailySalesExcel(selectedBusinessDate)}
              data-testid="download-excel-report-btn"
              className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title={`Download ${dailyBackupReport.excelFileName}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Daily Sales – Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => handleRegenerateBackupForDate(selectedBusinessDate)}
              disabled={regeneratingBackup}
              data-testid="regenerate-daily-backup-btn"
              className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title={`Regenerate & Upload ${dailyBackupReport.pdfFileName} and ${dailyBackupReport.excelFileName} to Cloud Storage`}
            >
              <CloudUpload className={`w-4 h-4 ${regeneratingBackup ? 'animate-bounce' : ''}`} />
              <span>{regeneratingBackup ? 'Generating...' : 'Regenerate Backup'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 text-red-200 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                title="Erase all sales data from software"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span className="hidden sm:inline">Clear Sales Data</span>
                <span className="sm:hidden">Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Specific Business Day Date Picker & Fast Search Bar */}
        <div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Sales Date:</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1">
              <button
                type="button"
                onClick={() => handleSelectSingleBusinessDay(shiftDateYMD(selectedBusinessDate, -1))}
                className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Previous Sales Date"
                aria-label="Previous Business Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <input
                type="date"
                data-testid="reports-business-date-picker"
                value={selectedBusinessDate}
                max={currentBusinessDate}
                onChange={(e) => {
                  if (e.target.value) {
                    handleSelectSingleBusinessDay(e.target.value);
                  }
                }}
                aria-label="Select Sales Date for Daily Backup"
                className="bg-slate-800 border border-slate-700 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => {
                  const next = shiftDateYMD(selectedBusinessDate, 1);
                  if (next <= currentBusinessDate) {
                    handleSelectSingleBusinessDay(next);
                  }
                }}
                disabled={selectedBusinessDate >= currentBusinessDate}
                className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Next Sales Date"
                aria-label="Next Business Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectSingleBusinessDay(currentBusinessDate)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedBusinessDate === currentBusinessDate
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Today ({formatDateDDMMYYYY(currentBusinessDate)})
              </button>
              <button
                type="button"
                onClick={() => handleSelectSingleBusinessDay(yesterdayBusinessDate)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedBusinessDate === yesterdayBusinessDate
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Yesterday ({formatDateDDMMYYYY(yesterdayBusinessDate)})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300">
            <input
              type="text"
              value={reportSearchQuery}
              onChange={(e) => setReportSearchQuery(e.target.value)}
              placeholder="Filter items or bills..."
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-sans text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-44"
            />
            <span className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
              PDF: <strong className="text-emerald-400">{dailyBackupReport.pdfFileName}</strong>
            </span>
            <span className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
              Excel: <strong className="text-emerald-400">{dailyBackupReport.excelFileName}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackNotice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs">
          <span>✓ {feedbackNotice}</span>
        </div>
      )}

      {/* 2. Report Types Tabs (All Requested POS Reports) */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-white border border-slate-200 p-1.5 rounded-xl shadow-2xs text-xs scrollbar-thin shrink-0">
        {[
          { id: 'daily-backup', label: 'Daily Sales & Backup', icon: Archive, testId: 'tab-daily-sales-backup' },
          { id: 'item-wise', label: 'Item-Wise Sales', icon: TrendingUp },
          { id: 'bill-wise', label: 'Bill-Wise Sales', icon: Receipt },
          { id: 'ac-non-ac', label: 'AC / Non-AC Report', icon: Layers },
          { id: 'dinein-takeaway', label: 'Dine-In / Takeaway', icon: FileText },
          { id: 'daily', label: 'Date-Wise Report', icon: Calendar },
          { id: 'monthly', label: 'Monthly Sales Report', icon: BarChart3 },
          { id: 'category-wise', label: 'Category-Wise', icon: Layers },
          { id: 'cancelled', label: 'Cancelled Bills', icon: Ban },
          { id: 'inventory', label: 'Inventory Balances', icon: Boxes }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = reportType === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setReportType(tab.id as any)}
              data-testid={tab.testId}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#0F172A] text-white font-black shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : ''}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Daily Sales Backup Dedicated Summary, Automatic Cloud Backup Status & Download Panel */}
      {reportType === 'daily-backup' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-2xs shrink-0 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-900">
                  SRI SARAVANAN BHAVAN — PURE VEG FAMILY RESTAURANT, KALLAKURICHI
                </h3>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Completed Bills Only
                </span>
                <span
                  data-testid="overall-backup-status-badge"
                  className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${getBackupStatusBadgeClass(overallBackupStatus)}`}
                >
                  Backup Status: {overallBackupStatus}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Excludes cancelled, deleted, and duplicate bills. Item codes are hidden from all report displays and exports.
              </p>
            </div>

            {/* Dedicated Download & Regenerate Buttons inside Daily Sales Backup Screen */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadDailySalesPDF(selectedBusinessDate)}
                data-testid="daily-backup-download-pdf-btn"
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>Download Daily Sales – PDF ({dailyBackupReport.pdfFileName})</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadDailySalesExcel(selectedBusinessDate)}
                data-testid="daily-backup-download-excel-btn"
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Daily Sales – Excel (.xlsx) ({dailyBackupReport.excelFileName})</span>
              </button>

              <button
                type="button"
                onClick={() => handleRegenerateBackupForDate(selectedBusinessDate)}
                disabled={regeneratingBackup}
                data-testid="daily-backup-regenerate-btn"
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                <CloudUpload className="w-4 h-4" />
                <span>{regeneratingBackup ? 'Generating...' : 'Regenerate Backup'}</span>
              </button>
            </div>
          </div>

          {/* 4 Required Sales Summary Cards: Selected Sales Date, Total Number of Bills, Total Items Sold, Total Daily Sales Amount */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Selected Sales Date</span>
              <div
                data-testid="summary-selected-sales-date"
                className="text-base sm:text-xl font-mono font-black text-slate-900 mt-0.5"
              >
                {dailyBackupReport.formattedDate}
              </div>
              <span className="text-[10px] text-slate-500">DD-MM-YYYY format</span>
            </div>

            <div className="bg-blue-50/60 border border-blue-200/80 p-3 rounded-xl">
              <span className="text-[10px] text-blue-800 uppercase font-bold block">Total Number of Bills</span>
              <div
                data-testid="summary-total-bills"
                className="text-base sm:text-xl font-mono font-black text-blue-700 mt-0.5"
              >
                {dailyBackupReport.totalBills}
              </div>
              <span className="text-[10px] text-blue-700 font-medium">Completed bills</span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl">
              <span className="text-[10px] text-amber-900 uppercase font-bold block">Total Items Sold</span>
              <div
                data-testid="summary-total-items-sold"
                className="text-base sm:text-xl font-mono font-black text-amber-800 mt-0.5"
              >
                {dailyBackupReport.totalItemsSold}
              </div>
              <span className="text-[10px] text-amber-800 font-medium">Total quantity sold</span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl">
              <span className="text-[10px] text-emerald-800 uppercase font-bold block">Total Daily Sales Amount</span>
              <div
                data-testid="summary-total-daily-sales"
                className="text-base sm:text-xl font-mono font-black text-emerald-700 mt-0.5"
              >
                {formatIndianCurrency(dailyBackupReport.totalDailySales)}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium">Net completed sales</span>
            </div>
          </div>

          {/* Automatic Backup Status Cards: PDF Backup Status, Excel Backup Status, Last Successful Backup Date & Time, Cloud Storage Structure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold">PDF Backup Status</span>
                <span
                  data-testid="pdf-backup-status"
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${getBackupStatusBadgeClass(pdfBackupStatus)}`}
                >
                  {pdfBackupStatus}
                </span>
              </div>
              <div className="font-mono font-bold text-xs text-slate-900 mt-1.5 truncate" title={pdfCloudPath}>
                {dailyBackupReport.pdfFileName}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 truncate" title={pdfCloudPath}>
                Path: {pdfCloudPath}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Excel Backup Status</span>
                <span
                  data-testid="excel-backup-status"
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${getBackupStatusBadgeClass(excelBackupStatus)}`}
                >
                  {excelBackupStatus}
                </span>
              </div>
              <div className="font-mono font-bold text-xs text-slate-900 mt-1.5 truncate" title={excelCloudPath}>
                {dailyBackupReport.excelFileName}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 truncate" title={excelCloudPath}>
                Path: {excelCloudPath}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Last Successful Backup</span>
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div
                data-testid="last-successful-backup-time"
                className="font-mono font-bold text-xs text-slate-900 mt-1.5"
              >
                {selectedDateBackupStatus?.lastSuccessfulBackupFormatted ||
                  latestSuccessfulBackup?.lastSuccessfulBackupFormatted ||
                  (selectedDateBackupStatus?.lastSuccessfulBackupAt
                    ? formatISTTimestamp(selectedDateBackupStatus.lastSuccessfulBackupAt)
                    : 'Pending Daily Closing')}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">
                Timezone: Asia/Kolkata (IST)
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Daily Closing Schedule</span>
                <FolderArchive className="w-3.5 h-3.5 text-amber-600" />
              </div>
              {isOwner ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="time"
                    data-testid="owner-closing-time-input"
                    value={closingTimeInput}
                    onChange={(e) => setClosingTimeInput(e.target.value)}
                    aria-label="Daily Sales Closing Time (Asia/Kolkata)"
                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    disabled={savingClosingTime}
                    onClick={handleSaveClosingTime}
                    data-testid="save-closing-time-btn"
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] rounded-lg cursor-pointer transition-colors"
                  >
                    {savingClosingTime ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="font-mono font-bold text-xs text-slate-900 mt-1.5">
                  Auto-Backup at {backupConfig.dailyClosingTime} IST
                </div>
              )}
              <span className="text-[10px] text-slate-500 mt-0.5 truncate" title={cloudStorageFolder}>
                Folder: {cloudStorageFolder}/
              </span>
            </div>
          </div>

          {/* Date-Wise Automatic Backup History & Quick Download Bar */}
          {backupHistoryList.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Date-Wise Automatic Sales Backup Archive (Cloud Storage: Daily_Sales_Backup/)
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Showing {Math.min(backupHistoryList.length, 5)} recent business dates
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {backupHistoryList.slice(0, 6).map((rec) => (
                  <div
                    key={rec.businessDate}
                    className={`border rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                      rec.businessDate === selectedBusinessDate
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectSingleBusinessDay(rec.businessDate)}
                          className="font-mono font-black text-slate-900 hover:text-amber-700 cursor-pointer"
                        >
                          {rec.formattedDate}
                        </button>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getBackupStatusBadgeClass(rec.status)}`}
                        >
                          {rec.status}
                        </span>
                        {rec.totalsVerified && (
                          <span title="PDF, Excel, and Firestore sales totals verified identical">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {rec.totalBills} bills • {rec.totalItemsSold} items • {formatIndianCurrency(rec.totalDailySales)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadDailySalesPDF(rec.businessDate)}
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded cursor-pointer"
                        title={`Download ${rec.pdfFileName}`}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadDailySalesExcel(rec.businessDate)}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded cursor-pointer"
                        title={`Download ${rec.excelFileName}`}
                      >
                        Excel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Business Day Net Sales Analysis Summary Panel (for other tabs) */}
      {reportType !== 'daily-backup' && hasFinancialPermission && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Net Sales Analysis ({isSingleBusinessDay ? `Sales Date: ${formatDateDDMMYYYY(startDate)}` : `${formatDateDDMMYYYY(startDate)} → ${formatDateDDMMYYYY(endDate)}`})
              </span>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                Deduplicated • Excludes Cancelled & Reprints
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Valid Bills: <b>{netSalesAnalysis.validBillCount}</b> • Dine-In: <b>{netSalesAnalysis.dineInCount}</b> • Takeaway: <b>{netSalesAnalysis.takeAwayCount}</b>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-emerald-50/60 border border-emerald-200/80 p-3 rounded-xl">
              <span className="text-[10px] text-emerald-800 uppercase font-bold block">Total Net Sales</span>
              <div className="text-lg sm:text-xl font-mono font-black text-emerald-700 mt-0.5">
                ₹{netSalesAnalysis.netSales.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium">
                {netSalesAnalysis.validBillCount} completed bills
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                <Banknote className="w-3 h-3 text-emerald-600" /> Cash Sales
              </span>
              <div className="text-lg sm:text-xl font-mono font-black text-slate-800 mt-0.5">
                ₹{netSalesAnalysis.cashSales.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-slate-500">
                Cash drawer collection
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-blue-600" /> UPI / Digital Sales
              </span>
              <div className="text-lg sm:text-xl font-mono font-black text-blue-700 mt-0.5">
                ₹{netSalesAnalysis.upiSales.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-slate-500">
                QR & online settlements
              </span>
            </div>

            <div className="bg-red-50/50 border border-red-200/70 p-3 rounded-xl">
              <span className="text-[10px] text-red-700 uppercase font-bold block">Cancelled (Excluded)</span>
              <div className="text-lg sm:text-xl font-mono font-black text-red-600 mt-0.5">
                ₹{netSalesAnalysis.cancelledAmount.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-red-600 font-medium">
                {netSalesAnalysis.cancelledCount} cancelled bills
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Summary KPI Cards for Item-Wise / Category-Wise */}
      {(reportType === 'item-wise' || reportType === 'category-wise') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
          {hasFinancialPermission && (
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
              <span className="text-[11px] text-slate-500 uppercase font-bold">Total Sales Revenue</span>
              <div className="text-xl sm:text-2xl font-mono font-black text-emerald-700 mt-1">
                ₹{totalRevenue.toLocaleString('en-IN')}
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
            <span className="text-[11px] text-slate-500 uppercase font-bold">Total Items Sold</span>
            <div className="text-xl sm:text-2xl font-mono font-black text-amber-800 mt-1">
              {totalQuantity} qty
            </div>
          </div>
          <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-500 uppercase font-bold">Unique Menu Products</span>
            <div className="text-xl sm:text-2xl font-mono font-black text-blue-700 mt-1">
              {itemData.length} items
            </div>
          </div>
        </div>
      )}

      {/* 4. Report Tables Container */}
      <div className="flex-1 min-h-[320px] max-h-[calc(100dvh-260px)] flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="w-full flex-1 overflow-x-auto overflow-y-auto scrollbar-thin">
          
          {/* 0. Daily Sales Backup Detailed Table (S.No | Bill No | Date | Time | Item Name | Quantity | Unit Price | Total) */}
          {reportType === 'daily-backup' && (
            <table
              data-testid="daily-sales-backup-table"
              className="w-full min-w-[720px] text-xs text-left border-collapse"
            >
              <thead className="sticky top-0 z-10 bg-slate-800 text-white font-bold text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center whitespace-nowrap border-r border-slate-700">S.No</th>
                  <th className="py-2.5 px-3 w-24 text-center whitespace-nowrap border-r border-slate-700">Bill No</th>
                  <th className="py-2.5 px-3 w-28 text-center whitespace-nowrap border-r border-slate-700">Date</th>
                  <th className="py-2.5 px-3 w-28 text-center whitespace-nowrap border-r border-slate-700">Time</th>
                  <th className="py-2.5 px-3 min-w-[220px] whitespace-nowrap border-r border-slate-700">Item Name</th>
                  <th className="py-2.5 px-3 w-24 text-center whitespace-nowrap border-r border-slate-700">Quantity</th>
                  <th className="py-2.5 px-3 w-32 text-right whitespace-nowrap border-r border-slate-700">Unit Price</th>
                  <th className="py-2.5 px-3 w-36 text-right whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dailyBackupReport.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      data-testid="no-sales-records-message"
                      className="py-12 text-center text-slate-500 font-bold text-sm"
                    >
                      No sales records found for the selected date.
                    </td>
                  </tr>
                ) : (
                  dailyBackupReport.rows.map((row) => (
                    <tr key={`${row.billId}_${row.sno}`} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                        {row.sno}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                        {row.billNo}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700 border-r border-slate-100 whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                        {row.time}
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                        {row.itemName}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                        {row.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800 border-r border-slate-100 whitespace-nowrap">
                        {formatIndianCurrency(row.unitPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                        {formatIndianCurrency(row.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {dailyBackupReport.rows.length > 0 && (
                <tfoot className="sticky bottom-0 bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900 text-xs">
                  <tr>
                    <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider border-r border-slate-200">
                      Grand Total
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-amber-900 border-r border-slate-200">
                      {dailyBackupReport.totalItemsSold}
                    </td>
                    <td className="py-3 px-3 border-r border-slate-200"></td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-800 text-sm">
                      {formatIndianCurrency(dailyBackupReport.totalDailySales)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* 1. Item-Wise Sales Table (Item Code Removed) */}
          {reportType === 'item-wise' && (
            <table className="w-full min-w-[640px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center whitespace-nowrap">S.No</th>
                  <th className="py-2.5 px-3 min-w-[220px] whitespace-nowrap">Item Name</th>
                  <th className="py-2.5 px-3 w-28 min-w-[100px] text-center whitespace-nowrap">Qty Sold</th>
                  <th className="py-2.5 px-3 w-28 min-w-[100px] text-center whitespace-nowrap">Order Count</th>
                  {hasFinancialPermission && <th className="py-2.5 px-3 w-32 min-w-[120px] text-right whitespace-nowrap">Revenue (₹)</th>}
                  {hasFinancialPermission && <th className="py-2.5 px-3 w-24 min-w-[90px] text-right whitespace-nowrap">% Share</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No sales records found for the selected date.
                    </td>
                  </tr>
                ) : (
                  itemData.map((item, idx) => {
                    const pct = totalRevenue > 0 && item.salesValue ? ((item.salesValue / totalRevenue) * 100).toFixed(1) : '0';
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500 whitespace-nowrap">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">
                          {sanitizeItemNameOnly(item.itemName, item.itemCode)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 whitespace-nowrap">{item.quantitySold}</td>
                        <td className="py-2.5 px-3 text-center text-slate-500 whitespace-nowrap">{item.orderCount}</td>
                        {hasFinancialPermission && (
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            {formatIndianCurrency(item.salesValue || 0)}
                          </td>
                        )}
                        {hasFinancialPermission && (
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">{pct}%</td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* 2. Category-Wise Sales Table */}
          {reportType === 'category-wise' && (
            <table className="w-full min-w-[600px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 min-w-[200px] whitespace-nowrap">Category Name</th>
                  <th className="py-2.5 px-3 w-40 min-w-[140px] text-center whitespace-nowrap">Total Quantity Sold</th>
                  <th className="py-2.5 px-3 w-32 min-w-[120px] text-center whitespace-nowrap">Order Count</th>
                  {hasFinancialPermission && <th className="py-2.5 px-3 w-40 min-w-[140px] text-right whitespace-nowrap">Total Revenue (₹)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No sales records found for the selected date.
                    </td>
                  </tr>
                ) : (
                  categoryData.map((cat, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">{cat.categoryName}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-800 whitespace-nowrap">{cat.totalQuantity}</td>
                      <td className="py-2.5 px-3 text-center text-slate-500 whitespace-nowrap">{cat.orderCount}</td>
                      {hasFinancialPermission && (
                        <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 text-sm whitespace-nowrap">
                          {formatIndianCurrency(cat.totalSalesValue || 0)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 2b. Daily Net Sales Breakdown Table */}
          {reportType === 'daily' && (
            <table className="w-full min-w-[680px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-36 min-w-[120px] whitespace-nowrap">Sales Date</th>
                  <th className="py-2.5 px-3 w-28 min-w-[90px] text-center whitespace-nowrap">Valid Bills</th>
                  <th className="py-2.5 px-3 w-36 min-w-[120px] text-center whitespace-nowrap">Dine-In / Takeaway</th>
                  {hasFinancialPermission && <th className="py-2.5 px-3 w-32 min-w-[110px] text-right whitespace-nowrap">Cash Sales (₹)</th>}
                  {hasFinancialPermission && <th className="py-2.5 px-3 w-32 min-w-[110px] text-right whitespace-nowrap">UPI Sales (₹)</th>}
                  <th className="py-2.5 px-3 w-28 min-w-[90px] text-center whitespace-nowrap">Cancelled</th>
                  {hasFinancialPermission && <th className="py-2.5 px-3 w-36 min-w-[120px] text-right whitespace-nowrap">Net Sales (₹)</th>}
                  <th className="py-2.5 px-3 w-36 min-w-[120px] text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyNetSalesRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No sales records found for the selected date.
                    </td>
                  </tr>
                ) : (
                  dailyNetSalesRows.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatDateDDMMYYYY(row.date)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 whitespace-nowrap">{row.validBillCount}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">
                        {row.dineInCount} Dine / {row.takeAwayCount} Parcel
                      </td>
                      {hasFinancialPermission && (
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {formatIndianCurrency(row.cashSales)}
                        </td>
                      )}
                      {hasFinancialPermission && (
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700 whitespace-nowrap">
                          {formatIndianCurrency(row.upiSales)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center font-mono text-red-600 whitespace-nowrap">
                        {row.cancelledCount}
                      </td>
                      {hasFinancialPermission && (
                        <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 text-sm whitespace-nowrap">
                          {formatIndianCurrency(row.netSales)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectSingleBusinessDay(row.date);
                            setReportType('daily-backup');
                          }}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Open Day Backup →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 3. Cancelled Bills Table */}
          {reportType === 'cancelled' && (
            <table className="w-full min-w-[660px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-28 min-w-[100px] whitespace-nowrap">Bill No</th>
                  <th className="py-2.5 px-3 w-32 min-w-[110px] whitespace-nowrap">Date</th>
                  <th className="py-2.5 px-3 w-32 min-w-[110px] text-right whitespace-nowrap">Grand Total</th>
                  <th className="py-2.5 px-3 min-w-[200px] whitespace-nowrap">Cancellation Reason</th>
                  <th className="py-2.5 px-3 w-32 min-w-[110px] text-right whitespace-nowrap">Cancelled By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cancelledBills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No cancelled bills recorded.
                    </td>
                  </tr>
                ) : (
                  cancelledBills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-red-600 whitespace-nowrap">{b.billNumber}</td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{formatDateDDMMYYYY(b.businessDate)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-800 whitespace-nowrap">
                        {formatIndianCurrency(b.grandTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-red-700 font-medium">{b.cancelReason || 'No reason provided'}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">{b.cancelledBy || 'Staff'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 4. Inventory Balances Table (Item Code Removed) */}
          {reportType === 'inventory' && (
            <table className="w-full min-w-[600px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center whitespace-nowrap">S.No</th>
                  <th className="py-2.5 px-3 min-w-[220px] whitespace-nowrap">Item Name</th>
                  <th className="py-2.5 px-3 w-28 min-w-[90px] whitespace-nowrap">Unit</th>
                  <th className="py-2.5 px-3 w-36 min-w-[120px] text-right whitespace-nowrap">Current Stock</th>
                  <th className="py-2.5 px-3 w-32 min-w-[110px] text-right whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventorySummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No inventory records found.
                    </td>
                  </tr>
                ) : (
                  inventorySummary.map((item, idx) => {
                    const isLow = (item.currentStock || 0) <= (item.minimumStock || 5);
                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500 whitespace-nowrap">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">
                          {sanitizeItemNameOnly(item.itemName, item.itemCode)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{item.unit || 'Units'}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-black whitespace-nowrap ${isLow ? 'text-red-600' : 'text-emerald-700'}`}>
                          {item.currentStock || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isLow ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {isLow ? 'LOW STOCK' : 'OPTIMAL'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* 5. Bill-Wise Sales Report */}
          {reportType === 'bill-wise' && (
            <table className="w-full min-w-[680px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0F172A] text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center whitespace-nowrap">S.No</th>
                  <th className="py-2.5 px-3 w-28 whitespace-nowrap">Bill No</th>
                  <th className="py-2.5 px-3 w-32 whitespace-nowrap">Date</th>
                  <th className="py-2.5 px-3 w-28 whitespace-nowrap">Time</th>
                  <th className="py-2.5 px-3 w-28 whitespace-nowrap">Service Mode</th>
                  <th className="py-2.5 px-3 w-28 whitespace-nowrap">Tariff (AC/Non-AC)</th>
                  <th className="py-2.5 px-3 w-28 whitespace-nowrap">Payment</th>
                  <th className="py-2.5 px-3 w-36 text-right whitespace-nowrap">Bill Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedBillsInRange.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No completed bills found for the selected period.
                    </td>
                  </tr>
                ) : (
                  completedBillsInRange.map((b, idx) => (
                    <tr key={b.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">#{b.billNumber}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{formatDateDDMMYYYY(b.businessDate)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {b.orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          b.priceType === 'AC'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {b.priceType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{b.paymentMode || 'CASH'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                        {formatIndianCurrency(Number(b.grandTotal || b.subtotal || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 6. AC / Non-AC Sales Report */}
          {reportType === 'ac-non-ac' && (
            <table className="w-full min-w-[640px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0F172A] text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Sales Date</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">AC Bills</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">AC Sales (₹)</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Non-AC Bills</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Non-AC Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Net Sales (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyNetSalesRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No AC / Non-AC sales records found for the selected period.
                    </td>
                  </tr>
                ) : (
                  dailyNetSalesRows.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{formatDateDDMMYYYY(row.date)}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700">{row.acCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{formatIndianCurrency(row.acSales)}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700">{row.nonAcCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatIndianCurrency(row.nonAcSales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">{formatIndianCurrency(row.netSales)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 7. Dine-In / Takeaway Report */}
          {reportType === 'dinein-takeaway' && (
            <table className="w-full min-w-[640px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0F172A] text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Sales Date</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Dine-In Bills</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Dine-In Sales (₹)</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Takeaway Bills</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Takeaway Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Net Sales (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyNetSalesRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No Dine-In / Takeaway sales records found for the selected period.
                    </td>
                  </tr>
                ) : (
                  dailyNetSalesRows.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{formatDateDDMMYYYY(row.date)}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700">{row.dineInCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatIndianCurrency(row.dineInSales)}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700">{row.takeAwayCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{formatIndianCurrency(row.takeAwaySales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">{formatIndianCurrency(row.netSales)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* 8. Monthly Sales Report */}
          {reportType === 'monthly' && (
            <table className="w-full min-w-[680px] text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0F172A] text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Month (YYYY-MM)</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Completed Bills</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Dine-In Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Takeaway Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">AC Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Non-AC Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Monthly Net Sales (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlySalesRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No monthly sales records found for the selected period.
                    </td>
                  </tr>
                ) : (
                  monthlySalesRows.map((m) => (
                    <tr key={m.monthKey} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{m.monthKey}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">{m.validBillCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatIndianCurrency(m.dineInSales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatIndianCurrency(m.takeAwaySales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatIndianCurrency(m.acSales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatIndianCurrency(m.nonAcSales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">{formatIndianCurrency(m.netSales)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

        </div>
      </div>

      {/* Clear All Sales Data Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Clear All Sales Data?</h3>
                <p className="text-[11px] text-red-600 font-semibold">Irreversible Action • Customer Deploy Clean</p>
              </div>
            </div>

            <div className="bg-red-50/80 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 space-y-2">
              <p className="font-medium">
                This will wipe all bills, line items, daily backups, and sales metrics from cloud Firestore and local browser storage.
              </p>
              <ul className="list-disc pl-4 text-[11px] space-y-1 text-red-800">
                <li>Reports, dashboard graphs, and orders will start completely fresh from 0.</li>
                <li>The bill sequence will restart at <strong>#01</strong>.</li>
                <li>Menu items, prices, categories, and settings will remain untouched.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={clearing}
                onClick={() => setShowClearModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeSalesData}
                disabled={clearing}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Trash2 className={`w-3.5 h-3.5 ${clearing ? 'animate-spin' : ''}`} />
                <span>{clearing ? 'Clearing Sales Data...' : 'Yes, Clear All Sales Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

