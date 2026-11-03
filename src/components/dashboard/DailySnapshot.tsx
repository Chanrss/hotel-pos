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
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PackageCheck,
  Wind,
  X
} from 'lucide-react';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { getLocalBillItems, getLocalItemsMap } from '../../services/localBillStore';
import { downloadDailyBillingExcel } from '../../services/excelBackupService';
import { DailyPrintSummaryModal } from './DailyPrintSummaryModal';
import { calculateDailyNetSales } from '../../services/salesCalculationEngine';
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

  // 1. Compute exact Daily Net Sales breakdown using canonical salesCalculationEngine
  const salesBreakdown = useMemo(() => {
    const dayBills = bills.filter((b) => !businessDate || b.businessDate === businessDate);
    return calculateDailyNetSales(dayBills);
  }, [bills, businessDate]);

  const completedBills = salesBreakdown.validBills;

  // 2. Compute Total Sales metrics including Dine-In, AC, and Takeaway sales
  const {
    totalSales,
    cashSales,
    upiSales,
    dineInCount,
    takeAwayCount,
    dineInSales,
    takeAwaySales,
    acSales,
    nonAcSales,
    acCount,
    nonAcCount,
    averageBillValue
  } = useMemo(() => {
    const total = salesBreakdown.netSales;
    const aov = salesBreakdown.validBillCount > 0 ? Math.round(total / salesBreakdown.validBillCount) : 0;

    return {
      totalSales: total,
      cashSales: salesBreakdown.cashSales,
      upiSales: salesBreakdown.upiSales,
      dineInCount: salesBreakdown.dineInCount,
      takeAwayCount: salesBreakdown.takeAwayCount,
      dineInSales: salesBreakdown.dineInSales,
      takeAwaySales: salesBreakdown.takeAwaySales,
      acSales: salesBreakdown.acSales,
      nonAcSales: salesBreakdown.nonAcSales,
      acCount: salesBreakdown.acCount,
      nonAcCount: salesBreakdown.nonAcCount,
      averageBillValue: aov
    };
  }, [salesBreakdown]);

  // 3. Aggregate item-wise sales to identify Total Items Sold & Top-Selling Items
  const { totalItemsSoldCount, topSellingItem, top3Items } = useMemo(() => {
    const allItems: BillItem[] = [];
    const seenKeys = new Set<string>();
    const validBillIds = new Set(completedBills.map((b) => b.id));
    const cancelledBillIds = new Set(
      bills.filter((b) => b.status === 'CANCELLED').map((b) => b.id)
    );
    const localItemsMap = getLocalItemsMap();

    const pushUnique = (item: BillItem, fallbackBillId?: string) => {
      const bId = item.billId || fallbackBillId || 'unknown';
      if (cancelledBillIds.has(bId)) return;
      const key = item.id || `${bId}_${item.itemCode || item.itemName}_${item.quantity}_${item.totalPrice}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      allItems.push(item);
    };

    completedBills.forEach((b) => {
      if (b.items && b.items.length > 0) {
        b.items.forEach((i) => pushUnique(i, b.id));
      } else {
        const local = localItemsMap[b.id] || getLocalBillItems(b.id);
        if (local && local.length > 0) {
          local.forEach((i) => pushUnique(i, b.id));
        }
      }
    });

    if (billItems && billItems.length > 0) {
      billItems.forEach((i) => {
        if (!i.businessDate || i.businessDate === businessDate) {
          if (!i.billId || validBillIds.has(i.billId) || completedBills.length === 0) {
            pushUnique(i, i.billId);
          }
        }
      });
    }

    const itemMap = new Map<string, TopSellingItemData>();
    let totalQty = 0;

    allItems.forEach((item) => {
      const key = (item.itemCode || item.itemName || '').trim().toLowerCase();
      if (!key) return;

      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      const revenue = Number(item.totalPrice) || (unitPrice * qty);
      totalQty += qty;

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

    const sorted = Array.from(itemMap.values()).sort((a, b) => {
      if (b.quantitySold !== a.quantitySold) {
        return b.quantitySold - a.quantitySold;
      }
      return b.totalRevenue - a.totalRevenue;
    });

    return {
      totalItemsSoldCount: totalQty,
      topSellingItem: sorted[0] || null,
      top3Items: sorted.slice(0, 3)
    };
  }, [completedBills, bills, billItems, businessDate]);

  return (
    <section 
      id="daily-snapshot-section" 
      aria-labelledby="daily-snapshot-heading"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0F172A] text-emerald-400 flex items-center justify-center shadow-2xs">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 id="daily-snapshot-heading" className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Daily Sales Overview</span>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Sync
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Complete billing & service channel breakdown for <span className="font-mono font-bold text-slate-800">{businessDate}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Excel Report Button */}
          <button
            type="button"
            disabled={isExportingExcel}
            onClick={handleExportExcel}
            id="snapshot-export-excel-btn"
            className="text-xs text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl px-3 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed"
            title="Export multi-worksheet formatted Excel spreadsheet (.xlsx) for this business day"
          >
            {isExportingExcel ? (
              <Loader2 className="w-3.5 h-3.5 text-emerald-700 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            )}
            <span className="hidden sm:inline">Download Excel (.xlsx)</span>
            <span className="sm:hidden">Excel</span>
          </button>

          {/* Export PDF Report Button */}
          <button
            type="button"
            onClick={() => setIsPdfModalOpen(true)}
            id="snapshot-export-pdf-btn"
            className="text-xs text-white bg-[#0F172A] hover:bg-slate-800 rounded-xl px-3 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            title="Open printable summary for saving as PDF or printing"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Download PDF Report</span>
            <span className="md:hidden">PDF</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs text-[#0F172A] hover:text-emerald-700 font-bold flex items-center gap-1 cursor-pointer transition-colors ml-1"
            >
              <span>All Reports</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Export Status / Feedback Toast Notification */}
      {feedbackToast && (
        <div 
          className={`px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-3 border transition-all ${
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

      {/* Row 1: Primary 3 KPI Cards (Today's Total Sales, Total Bills Generated, Total Items Sold & Top Dish) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        
        {/* 1. TODAY'S TOTAL SALES */}
        <div 
          id="snapshot-total-sales-card"
          className="bg-[#0F172A] text-white border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5" />
                <span>Today's Total Sales</span>
              </span>
              <div className="mt-1.5">
                {canViewRevenue ? (
                  <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white flex items-baseline gap-1 tabular-nums">
                    <span className="text-lg text-emerald-400 font-sans">₹</span>
                    <span>{totalSales.toLocaleString('en-IN')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400 py-1 text-sm font-bold">
                    <Lock className="w-4 h-4" />
                    <span>Protected</span>
                  </div>
                )}
              </div>
            </div>

            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            {canViewRevenue ? (
              <>
                <div className="text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Cash: ₹{cashSales.toLocaleString('en-IN')}</span>
                </div>
                <div className="text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span>UPI: ₹{upiSales.toLocaleString('en-IN')}</span>
                </div>
              </>
            ) : (
              <span className="text-slate-400 text-[11px]">Requires financial report permission</span>
            )}
          </div>
        </div>

        {/* 2. TOTAL BILLS GENERATED */}
        <div 
          id="snapshot-bill-count-card"
          className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-[#0F172A]" />
                <span>Total Bills Generated</span>
              </span>
              <div className="mt-1.5">
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 flex items-baseline gap-1.5 tabular-nums">
                  <span>{completedBills.length}</span>
                  <span className="text-xs font-bold text-slate-500 font-sans">
                    {completedBills.length === 1 ? 'Completed Bill' : 'Completed Bills'}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-[#0F172A] flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="text-slate-600 flex items-center gap-1">
              <Utensils className="w-3 h-3 text-emerald-600" />
              <span>Dine-In: {dineInCount}</span>
            </div>
            <div className="text-slate-600 flex items-center gap-1">
              <ShoppingBag className="w-3 h-3 text-slate-600" />
              <span>Takeaway: {takeAwayCount}</span>
            </div>
            {canViewRevenue && completedBills.length > 0 && (
              <div className="text-emerald-700 font-bold text-[11px]">
                Avg: ₹{averageBillValue}
              </div>
            )}
          </div>
        </div>

        {/* 3. TOTAL ITEMS SOLD & TOP DISH */}
        <div 
          id="snapshot-top-selling-card"
          className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Total Items Sold</span>
              </span>

              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 tabular-nums">
                  {totalItemsSoldCount.toLocaleString('en-IN')}
                </span>
                <span className="text-xs font-bold text-slate-500">portions served</span>
              </div>
            </div>

            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
            {topSellingItem ? (
              <div className="flex items-center justify-between w-full gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Flame className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-slate-500 font-medium shrink-0">Top Dish:</span>
                  <span className="font-bold text-slate-900 truncate">{topSellingItem.itemName}</span>
                </div>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                  {topSellingItem.quantitySold} qty
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> No items billed on this date yet
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Row 2: Service & Hall Channel Breakdown (Dine-In Sales, AC Sales, Takeaway Sales) */}
      {canViewRevenue && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Dine-In Sales */}
          <div
            data-testid="dashboard-dine-in-sales-card"
            className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-3.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-white flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Dine-In Sales
                </span>
                <div className="text-lg font-extrabold font-mono text-slate-900 tabular-nums">
                  ₹{dineInSales.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <div className="text-right font-mono shrink-0">
              <span className="inline-block px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-bold text-slate-700">
                {dineInCount} {dineInCount === 1 ? 'bill' : 'bills'}
              </span>
            </div>
          </div>

          {/* AC Sales */}
          <div
            data-testid="dashboard-ac-sales-card"
            className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-3.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Wind className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  AC Hall Sales
                </span>
                <div className="text-lg font-extrabold font-mono text-slate-900 tabular-nums">
                  ₹{acSales.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <div className="text-right font-mono shrink-0">
              <span className="inline-block px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-bold text-emerald-700">
                {acCount} AC {acCount === 1 ? 'bill' : 'bills'}
              </span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                Non-AC: ₹{nonAcSales.toLocaleString('en-IN')} ({nonAcCount})
              </span>
            </div>
          </div>

          {/* Takeaway Sales */}
          <div
            data-testid="dashboard-takeaway-sales-card"
            className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-3.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Takeaway / Parcel Sales
                </span>
                <div className="text-lg font-extrabold font-mono text-slate-900 tabular-nums">
                  ₹{takeAwaySales.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <div className="text-right font-mono shrink-0">
              <span className="inline-block px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-bold text-slate-700">
                {takeAwayCount} {takeAwayCount === 1 ? 'parcel' : 'parcels'}
              </span>
            </div>
          </div>
        </div>
      )}

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
