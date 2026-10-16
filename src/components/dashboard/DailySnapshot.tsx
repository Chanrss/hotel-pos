import React, { useMemo, useState, useEffect } from 'react';
import { 
  IndianRupee, 
  Receipt, 
  Flame, 
  Sparkles, 
  TrendingUp, 
  ShoppingBag, 
  Utensils, 
  Clock, 
  Lock,
  ArrowUpRight,
  Award,
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { getLocalBillItems, getLocalItemsMap } from '../../services/localBillStore';
import { downloadCoreBillingBackup } from '../../services/backupService';
import { downloadDailyBillingExcel } from '../../services/excelBackupService';
import { DailyPrintSummaryModal } from './DailyPrintSummaryModal';
import { NavTab } from '../common/Sidebar';

export interface TopSellingItemData {
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantitySold: number;
  totalRevenue: number;
  ordersCount: number;
}

export interface DailySnapshotProps {
  businessDate: string;
  bills: Bill[];
  billItems?: BillItem[];
  canViewRevenue?: boolean;
  onNavigate?: (tab: NavTab) => void;
  settings?: RestaurantSettings;
}

export const DailySnapshot: React.FC<DailySnapshotProps> = ({
  businessDate,
  bills,
  billItems,
  canViewRevenue = true,
  onNavigate,
  settings
}) => {
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss feedback toast after 7 seconds
  useEffect(() => {
    if (!feedbackToast) return;
    const timer = setTimeout(() => {
      setFeedbackToast(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [feedbackToast]);

  const handleDownloadJson = async () => {
    try {
      setIsExportingJson(true);
      const res = await downloadCoreBillingBackup(settings, businessDate);
      if (res && res.success) {
        const sizeStr = res.record?.fileSizeBytes ? ` (${Math.round(res.record.fileSizeBytes / 1024 * 10) / 10} KB)` : '';
        setFeedbackToast({
          type: 'success',
          message: `JSON backup downloaded successfully: ${res.filename}${sizeStr}`
        });
      } else {
        setFeedbackToast({
          type: 'error',
          message: res?.error || 'Failed to download JSON backup. Please try again.'
        });
      }
    } catch (err: any) {
      setFeedbackToast({
        type: 'error',
        message: err?.message || 'Error downloading JSON backup.'
      });
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      const res = await downloadDailyBillingExcel(settings, businessDate);
      if (res && res.success) {
        const sizeStr = res.fileSizeBytes ? ` (${Math.round(res.fileSizeBytes / 1024 * 10) / 10} KB)` : '';
        setFeedbackToast({
          type: 'success',
          message: `Excel report downloaded: ${res.filename}${sizeStr}`
        });
      } else {
        setFeedbackToast({
          type: 'error',
          message: res?.error || 'Failed to export Excel report. Please try again.'
        });
      }
    } catch (err: any) {
      setFeedbackToast({
        type: 'error',
        message: err?.message || 'Error generating Excel report.'
      });
    } finally {
      setIsExportingExcel(false);
    }
  };
  // 1. Filter completed bills for the current business date
  const completedBills = useMemo(() => {
    return bills.filter(
      (b) => b.businessDate === businessDate && b.status === 'COMPLETED'
    );
  }, [bills, businessDate]);

  // 2. Compute Total Sales metrics
  const { totalSales, cashSales, upiSales, dineInCount, takeAwayCount, averageBillValue } = useMemo(() => {
    let total = 0;
    let cash = 0;
    let upi = 0;
    let dineIn = 0;
    let takeAway = 0;

    completedBills.forEach((b) => {
      const amount = Number(b.grandTotal) || 0;
      total += amount;

      const method = (b.paymentMethod || 'CASH').toUpperCase();
      if (method === 'CASH') {
        cash += amount;
      } else {
        upi += amount;
      }

      if (b.orderType === 'DINE_IN') {
        dineIn += 1;
      } else {
        takeAway += 1;
      }
    });

    const aov = completedBills.length > 0 ? Math.round(total / completedBills.length) : 0;

    return {
      totalSales: total,
      cashSales: cash,
      upiSales: upi,
      dineInCount: dineIn,
      takeAwayCount: takeAway,
      averageBillValue: aov
    };
  }, [completedBills]);

  // 3. Aggregate item-wise sales to identify Top-Selling Items
  const { topSellingItem, top3Items } = useMemo(() => {
    // Collect all bill items: from props, bill.items, or local items map
    const allItems: BillItem[] = [];

    if (billItems && billItems.length > 0) {
      allItems.push(...billItems.filter((i) => !i.businessDate || i.businessDate === businessDate));
    }

    const localItemsMap = getLocalItemsMap();

    completedBills.forEach((b) => {
      if (b.items && b.items.length > 0) {
        allItems.push(...b.items);
      } else {
        const local = localItemsMap[b.id] || getLocalBillItems(b.id);
        if (local && local.length > 0) {
          allItems.push(...local);
        }
      }
    });

    // Deduplicate by item unique key if items came from multiple sources
    const itemMap = new Map<string, TopSellingItemData>();

    allItems.forEach((item) => {
      const key = (item.itemCode || item.itemName || '').trim().toLowerCase();
      if (!key) return;

      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      const revenue = Number(item.totalPrice) || (unitPrice * qty);

      const existing = itemMap.get(key);
      if (!existing) {
        itemMap.set(key, {
          itemCode: item.itemCode || '',
          itemName: item.itemName,
          itemNameTamil: item.itemNameTamil,
          quantitySold: qty,
          totalRevenue: revenue,
          ordersCount: 1
        });
      } else {
        existing.quantitySold += qty;
        existing.totalRevenue += revenue;
        existing.ordersCount += 1;
        if (!existing.itemNameTamil && item.itemNameTamil) {
          existing.itemNameTamil = item.itemNameTamil;
        }
      }
    });

    // Sort descending by quantity sold; break ties by total revenue
    const sorted = Array.from(itemMap.values()).sort((a, b) => {
      if (b.quantitySold !== a.quantitySold) {
        return b.quantitySold - a.quantitySold;
      }
      return b.totalRevenue - a.totalRevenue;
    });

    return {
      topSellingItem: sorted[0] || null,
      top3Items: sorted.slice(0, 3)
    };
  }, [completedBills, billItems, businessDate]);

  return (
    <section 
      id="daily-snapshot-section" 
      aria-labelledby="daily-snapshot-heading"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 id="daily-snapshot-heading" className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Daily Snapshot</span>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Key business day performance for <span className="font-mono font-bold text-slate-700">{businessDate}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Download JSON Backup Button (Preserved ID & Functionality) */}
          <button
            type="button"
            disabled={isExportingJson || isExportingExcel}
            onClick={handleDownloadJson}
            id="snapshot-download-backup-btn"
            className="text-xs text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-lg px-2.5 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed"
            title="Download core billing JSON archive for disaster recovery & technical backup (Archive JSON)"
          >
            {isExportingJson ? (
              <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span className="hidden sm:inline">Download JSON Backup</span>
            <span className="sm:hidden">Archive JSON</span>
          </button>

          {/* 2. Export Excel Report Button */}
          <button
            type="button"
            disabled={isExportingJson || isExportingExcel}
            onClick={handleExportExcel}
            id="snapshot-export-excel-btn"
            className="text-xs text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100/80 border border-teal-200/80 rounded-lg px-2.5 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed"
            title="Export multi-worksheet formatted Excel spreadsheet (.xlsx) for this business day"
          >
            {isExportingExcel ? (
              <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
            )}
            <span className="hidden sm:inline">Export Excel Report</span>
            <span className="sm:hidden">Export Excel</span>
          </button>

          {/* 3. Export PDF Report Button (Printable Summary) */}
          <button
            type="button"
            onClick={() => setIsPdfModalOpen(true)}
            id="snapshot-export-pdf-btn"
            className="text-xs text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-lg px-2.5 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            title="Open printable summary for saving as PDF or printing"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden md:inline">Export PDF Report</span>
            <span className="md:hidden">Export PDF</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 cursor-pointer transition-colors ml-1"
            >
              <span>Detailed Reports</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Export Status / Feedback Toast Notification */}
      {feedbackToast && (
        <div 
          className={`px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-3 border transition-all animate-in fade-in slide-in-from-top-1 ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
          role="status"
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedbackToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold truncate">{feedbackToast.message}</span>
          </div>
          <button 
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="p-1 hover:bg-black/5 rounded-md text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3 Main Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        
        {/* 1. TOTAL SALES */}
        <div 
          id="snapshot-total-sales-card"
          className="bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 border border-amber-200/80 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-amber-300 transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 font-mono flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
                <span>Total Sales</span>
              </span>
              <div className="mt-1">
                {canViewRevenue ? (
                  <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900 flex items-baseline gap-1">
                    <span className="text-lg text-amber-600 font-sans">₹</span>
                    <span>{totalSales.toLocaleString('en-IN')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-500 py-1 text-sm font-bold">
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>Protected</span>
                  </div>
                )}
              </div>
            </div>

            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-amber-100 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            {canViewRevenue ? (
              <>
                <div className="text-slate-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Cash: ₹{cashSales.toLocaleString('en-IN')}</span>
                </div>
                <div className="text-slate-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span>UPI: ₹{upiSales.toLocaleString('en-IN')}</span>
                </div>
              </>
            ) : (
              <span className="text-slate-400 text-[11px]">Requires financial report permission</span>
            )}
          </div>
        </div>

        {/* 2. BILL COUNT */}
        <div 
          id="snapshot-bill-count-card"
          className="bg-gradient-to-br from-blue-50/50 via-white to-blue-50/20 border border-blue-200/80 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-blue-300 transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 font-mono flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-blue-600" />
                <span>Bill Count</span>
              </span>
              <div className="mt-1">
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900 flex items-baseline gap-1.5">
                  <span>{completedBills.length}</span>
                  <span className="text-xs font-bold text-slate-500 font-sans">
                    {completedBills.length === 1 ? 'Bill' : 'Bills'}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-blue-100 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="text-slate-600 flex items-center gap-1">
              <Utensils className="w-3 h-3 text-slate-400" />
              <span>Dine: {dineInCount}</span>
            </div>
            <div className="text-slate-600 flex items-center gap-1">
              <ShoppingBag className="w-3 h-3 text-slate-400" />
              <span>Takeaway: {takeAwayCount}</span>
            </div>
            {canViewRevenue && completedBills.length > 0 && (
              <div className="text-blue-700 font-bold text-[11px]">
                AOV: ₹{averageBillValue}
              </div>
            )}
          </div>
        </div>

        {/* 3. TOP-SELLING ITEM */}
        <div 
          id="snapshot-top-selling-card"
          className="bg-gradient-to-br from-purple-50/50 via-white to-purple-50/20 border border-purple-200/80 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-purple-300 transition-all sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 font-mono flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                <span>Top-Selling Item</span>
              </span>

              {topSellingItem ? (
                <div className="mt-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-base sm:text-lg font-black text-slate-900 truncate">
                      {topSellingItem.itemName}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-mono font-bold text-xs">
                      <Award className="w-3 h-3 text-purple-600" />
                      <span>{topSellingItem.quantitySold} sold</span>
                    </span>
                    {canViewRevenue && (
                      <span className="text-xs font-mono font-bold text-slate-600">
                        ₹{topSellingItem.totalRevenue.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 py-1">
                  <p className="text-xs font-bold text-slate-600">No items sold yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Complete bills to see today's top dish</p>
                </div>
              )}
            </div>

            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-purple-100 flex items-center justify-between gap-2 text-xs">
            {top3Items.length > 1 ? (
              <div className="text-[11px] text-slate-500 truncate">
                <span className="font-bold text-slate-600">Also popular: </span>
                <span>
                  {top3Items.slice(1).map(i => `${i.itemName} (${i.quantitySold})`).join(', ')}
                </span>
              </div>
            ) : topSellingItem ? (
              <span className="text-[11px] text-purple-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Leading kitchen dish today
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Waiting for first order
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Printable Daily Summary Modal */}
      <DailyPrintSummaryModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        businessDate={businessDate}
        bills={bills}
        billItems={billItems}
        settings={settings}
      />
    </section>
  );
};
