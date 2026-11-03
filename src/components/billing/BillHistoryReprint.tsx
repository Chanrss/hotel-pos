import React, { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Printer, 
  Ban, 
  RotateCcw, 
  Calendar, 
  CheckCircle, 
  AlertCircle,
  Eye,
  FileText,
  ChevronDown,
  ChevronRight,
  Clock,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { ReprintEngine } from '../../services/reprintEngine';
import { BillingEngine } from '../../services/billingEngine';
import { PrintService } from '../../services/PrintService';
import { getBusinessDate } from '../../services/billNumberEngine';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { MonthlyCalendarPicker } from '../common/MonthlyCalendarPicker';
import { getLocalBills, mergeBills, subscribeToLocalBills } from '../../services/localBillStore';
import { purgeAllBills } from '../../services/billCleanupService';
import { calculateDailyNetSales, isBillSuperseded, getReplacementBill } from '../../services/salesCalculationEngine';

interface BillHistoryReprintProps {
  settings?: RestaurantSettings;
}

export const BillHistoryReprint: React.FC<BillHistoryReprintProps> = ({ settings }) => {
  const { currentUser, isOwner, isManager } = useAuth();

  // Current business day calculated from restaurant settings
  const todayBusinessDate = useMemo(() => {
    return getBusinessDate(settings?.businessDayStartHour || '04:00');
  }, [settings?.businessDayStartHour]);

  const [bills, setBills] = useState<Bill[]>([]);
  const [searchNumber, setSearchNumber] = useState('');
  
  // By default, display ONLY the present day's bills
  const [startDate, setStartDate] = useState<string>(() => todayBusinessDate);
  const [endDate, setEndDate] = useState<string>(() => todayBusinessDate);
  
  // Track collapsed day sections when multiple days are displayed
  const [collapsedDates, setCollapsedDates] = useState<{ [date: string]: boolean }>({});

  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedBillItems, setSelectedBillItems] = useState<BillItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loading, setLoading] = useState(true);

  // Synchronize default dates when business date updates
  useEffect(() => {
    if (todayBusinessDate && (!startDate || startDate > todayBusinessDate)) {
      setStartDate(todayBusinessDate);
      setEndDate(todayBusinessDate);
    }
  }, [todayBusinessDate]);

  // Cancellation modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Erase all bills modal state
  const [eraseModalOpen, setEraseModalOpen] = useState(false);
  const [erasing, setErasing] = useState(false);

  // Thermal modal & Reprint Preview
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Erase all bills from software (cloud and local)
  const handleEraseAllBills = async () => {
    setErasing(true);
    try {
      const res = await purgeAllBills();
      setBills([]);
      setSelectedBill(null);
      setSelectedBillItems([]);
      setEraseModalOpen(false);
      setNotification({
        type: 'success',
        message: `All bills erased successfully (${res.billsDeleted} deleted). Next bill will start from #01!`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error('Erase bills error:', err);
      setNotification({
        type: 'error',
        message: 'Failed to erase bills: ' + (err?.message || 'Unknown error')
      });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setErasing(false);
    }
  };

  // Fetch recent bills (with local storage merge and real-time subscription)
  useEffect(() => {
    // 1. Prime with local bills first for 0ms immediate rendering
    const local = getLocalBills();
    if (local.length > 0) {
      setBills(local);
      setLoading(false);
    }

    // 2. Listen to local bills updates (when new bills are saved or cleared in POS)
    const unsubLocal = subscribeToLocalBills(() => {
      const currentLocal = getLocalBills();
      if (currentLocal.length === 0) {
        setBills([]);
      } else {
        setBills((prev) => mergeBills(prev, currentLocal));
      }
    });

    // 3. Listen to remote bills erased event
    const handleErased = () => {
      setBills([]);
      setSelectedBill(null);
      setSelectedBillItems([]);
    };
    window.addEventListener('pos_bills_erased', handleErased);

    // 4. Listen to Firestore collection
    let unsubFirestore: (() => void) | undefined;
    try {
      const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'), limit(200));
      unsubFirestore = onSnapshot(
        q, 
        (snap) => {
          const remoteList: Bill[] = [];
          snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() } as Bill));
          const currentLocal = getLocalBills();
          if (remoteList.length === 0 && currentLocal.length === 0) {
            setBills([]);
          } else {
            setBills(mergeBills(remoteList, currentLocal));
          }
          setLoading(false);
        },
        (err) => {
          console.warn('Firestore bills snapshot notice (displaying local bills):', err?.message || err);
          setBills(getLocalBills());
          setLoading(false);
        }
      );
    } catch (e) {
      console.warn('Firestore bills query notice:', e);
      setBills(getLocalBills());
      setLoading(false);
    }

    return () => {
      unsubLocal();
      if (unsubFirestore) unsubFirestore();
      window.removeEventListener('pos_bills_erased', handleErased);
    };
  }, []);

  const handleSelectBill = async (bill: Bill) => {
    setSelectedBill(bill);
    // If bill already contains items, use them immediately to prevent empty view
    if (bill.items && bill.items.length > 0) {
      setSelectedBillItems(bill.items);
      setLoadingItems(false);
      return;
    }

    setLoadingItems(true);
    try {
      const items = await ReprintEngine.getBillItems(bill.id);
      setSelectedBillItems(items);
    } catch (e) {
      console.error('Error loading bill items:', e);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleDirectSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchNumber.trim()) return;

    try {
      const found = await ReprintEngine.findBill(searchNumber.trim());
      if (found) {
        setSelectedBill(found);
        setSelectedBillItems(found.items || []);
        setNotification({ type: 'success', message: `Found Bill #${found.billNumber}` });
      } else {
        setNotification({ type: 'error', message: `No bill found matching "${searchNumber}"` });
      }
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Search failed' });
    }
  };

  // Direct reprint by bill number: Loads bill, generates receipt, and prints directly to default thermal printer
  const handleDirectReprint = async (billToReprint?: Bill) => {
    const targetBill = billToReprint || selectedBill;
    if (!targetBill) return;

    setReprinting(true);
    try {
      // 1. Ensure bill items are loaded
      let itemsToPrint = (targetBill.items && targetBill.items.length > 0)
        ? targetBill.items
        : (selectedBill?.id === targetBill.id && selectedBillItems.length > 0)
        ? selectedBillItems
        : [];

      if (itemsToPrint.length === 0) {
        setLoadingItems(true);
        try {
          itemsToPrint = await ReprintEngine.getBillItems(targetBill.id);
          setSelectedBill(targetBill);
          setSelectedBillItems(itemsToPrint);
        } finally {
          setLoadingItems(false);
        }
      }

      // 2. Record duplicate reprint audit entry in Firestore
      await ReprintEngine.recordReprint(targetBill.id, currentUser?.name || 'Staff');

      // 3. Prepare updated bill with incremented reprint count
      const nextCount = (targetBill.reprintCount || 0) + 1;
      const updatedBill: Bill = { ...targetBill, reprintCount: nextCount };

      // 4. Trigger direct thermal print using centralized PrintService
      await PrintService.printReceipt({
        bill: updatedBill,
        items: itemsToPrint,
        settings,
        forcePrint: true
      });

      // 5. Update local state
      setSelectedBill(updatedBill);
      setSelectedBillItems(itemsToPrint);
      setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));

      setNotification({
        type: 'success',
        message: `Reprinted Bill #${updatedBill.billNumber} (Duplicate #${nextCount}) directly to thermal printer!`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (e) {
      console.error('Thermal printer reprint failed:', e);
      setNotification({ type: 'error', message: 'Failed to record or trigger reprint' });
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setReprinting(false);
    }
  };

  // Open Thermal Receipt Preview Modal before triggering printer
  const handleOpenReprintPreview = async (bill?: Bill) => {
    const targetBill = bill || selectedBill;
    if (!targetBill) return;

    setSelectedBill(targetBill);

    if (targetBill.items && targetBill.items.length > 0) {
      setSelectedBillItems(targetBill.items);
      setIsReceiptOpen(true);
      return;
    }

    // If items are not loaded yet or bill changed, fetch items first
    if (selectedBill?.id !== targetBill.id || selectedBillItems.length === 0) {
      setLoadingItems(true);
      try {
        const items = await ReprintEngine.getBillItems(targetBill.id);
        setSelectedBillItems(items);
      } catch (e) {
        console.error('Error loading bill items:', e);
      } finally {
        setLoadingItems(false);
      }
    }

    // Display the thermal receipt preview modal before triggering print
    setIsReceiptOpen(true);
  };

  // Triggered when user confirms print inside the Thermal Receipt Preview modal
  const handleConfirmPrintReprint = async () => {
    if (!selectedBill) return;

    setReprinting(true);
    try {
      // 1. Record duplicate reprint audit entry in Firestore
      await ReprintEngine.recordReprint(selectedBill.id, currentUser?.name || 'Staff');
      
      // 2. Prepare updated bill with incremented reprint count
      const nextCount = (selectedBill.reprintCount || 0) + 1;
      const updatedBill: Bill = { ...selectedBill, reprintCount: nextCount };

      // 3. Trigger physical / browser print via centralized PrintService
      await PrintService.printReceipt({
        bill: updatedBill,
        items: selectedBillItems,
        settings,
        forcePrint: true
      });

      // 4. Update local state
      setSelectedBill(updatedBill);
      setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
      
      // 5. Close preview modal
      setIsReceiptOpen(false);

      setNotification({ 
        type: 'success', 
        message: `Reprint printed for Bill #${updatedBill.billNumber} (Duplicate #${nextCount})` 
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (e) {
      console.error('Reprint error:', e);
      setNotification({ type: 'error', message: 'Failed to record or trigger reprint' });
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setReprinting(false);
    }
  };

  const handleCancelBill = async () => {
    if (!selectedBill) return;
    if (!cancelReason.trim()) {
      alert('Please enter a reason for cancellation.');
      return;
    }

    setCancelling(true);
    try {
      await BillingEngine.cancelBill(selectedBill.id, cancelReason, currentUser?.name || 'Staff');
      setSelectedBill((prev) => prev ? { ...prev, status: 'CANCELLED', cancelReason } : null);
      setCancelModalOpen(false);
      setCancelReason('');
      setNotification({ type: 'success', message: `Bill #${selectedBill.billNumber} cancelled successfully.` });
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || 'Failed to cancel bill.' });
    } finally {
      setCancelling(false);
    }
  };

  // 1. Filter bills by date and search term
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const matchesDate = (!startDate || b.businessDate >= startDate) && (!endDate || b.businessDate <= endDate);
      if (!matchesDate) return false;
      if (!searchNumber) return true;
      const q = searchNumber.toLowerCase();
      return (
        b.billNumber.toLowerCase().includes(q) ||
        b.businessDate.includes(q) ||
        (b.userName && b.userName.toLowerCase().includes(q)) ||
        (b.tableNumber && b.tableNumber.toLowerCase().includes(q))
      );
    });
  }, [bills, startDate, endDate, searchNumber]);

  // Daily Net Sales calculation strictly following SRI SARAVANABHAVAN POS rules:
  // - Deduplicates bills and reprints (printing again never increases sales)
  // - Excludes cancelled bills (deducted immediately from net total)
  // - Handles re-bills (only counts valid replacement bill, excludes superseded)
  const salesBreakdown = useMemo(() => {
    return calculateDailyNetSales(filteredBills);
  }, [filteredBills]);

  const overallActiveTotal = salesBreakdown.netSales;

  // 2. Group filtered bills by businessDate (Day-by-Day)
  const groupedBillsByDate = useMemo(() => {
    const groups: { [date: string]: Bill[] } = {};
    for (const b of filteredBills) {
      const d = b.businessDate || todayBusinessDate;
      if (!groups[d]) {
        groups[d] = [];
      }
      groups[d].push(b);
    }

    // Sort dates in descending order (newest date first)
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => {
      const dateBills = groups[date].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const dayBreakdown = calculateDailyNetSales(dateBills);
      const isToday = date === todayBusinessDate;
      return {
        date,
        isToday,
        bills: dateBills,
        billCount: dateBills.length,
        activeBillCount: dayBreakdown.validBillCount,
        cancelledCount: dayBreakdown.cancelledCount,
        cancelledAmount: dayBreakdown.cancelledAmount,
        totalAmount: dayBreakdown.netSales
      };
    });
  }, [filteredBills, todayBusinessDate]);

  // Determine if viewing only the present day
  const isPresentDayOnly = (!startDate || startDate === todayBusinessDate) && (!endDate || endDate === todayBusinessDate);

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [date]: !prev[date]
    }));
  };

  const handleResetToPresentDay = () => {
    setStartDate(todayBusinessDate);
    setEndDate(todayBusinessDate);
    setSearchNumber('');
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-100 text-slate-800 p-2.5 sm:p-4 gap-3 overflow-y-auto font-sans pb-24 md:pb-6">
      
      {/* Top Search & Filter Bar */}
      <div className="bg-[#0F172A] text-white border border-slate-800 p-3.5 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                Bill History &amp; Thermal Reprint
              </h2>
              {isPresentDayOnly ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950 border border-emerald-700/60 px-2 py-0.5 rounded-md shadow-2xs">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  Present Day
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md shadow-2xs">
                  <Calendar className="w-3 h-3 text-emerald-400" />
                  Day-by-Day History
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {isPresentDayOnly
                ? `Showing present bills for today (${todayBusinessDate}). Use date filter for day-by-day past records.`
                : `Showing bills grouped day-by-day from ${startDate} to ${endDate}.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isPresentDayOnly && (
            <button
              type="button"
              onClick={handleResetToPresentDay}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer border border-slate-700 flex items-center gap-1 shadow-2xs"
              title="Return to showing only present day's bills"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Today's Bills</span>
            </button>
          )}

          <MonthlyCalendarPicker
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate: s, endDate: e }) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />

          {/* Quick Bill Search Form */}
          <form onSubmit={handleDirectSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Bill No (e.g. 01, 023)..."
                value={searchNumber || ''}
                onChange={(e) => setSearchNumber(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono w-44 sm:w-52"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              Find
            </button>
          </form>

          {/* Quick Erase All Bills Button */}
          <button
            type="button"
            onClick={() => setEraseModalOpen(true)}
            className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-200 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer border border-red-800/60 flex items-center gap-1 shadow-2xs"
            title="Erase all bills and reset bill counter"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Erase All Bills</span>
            <span className="sm:hidden">Erase</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`px-4 py-2 rounded-xl text-xs flex items-center gap-2 font-bold shadow-xs ${
          notification.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 2-Column Split: Bill Records Table on Left, Details & Receipt Actions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 lg:overflow-hidden">
        
        {/* Left Column: Bills Table with Day-by-Day Sections (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs min-h-[340px] lg:min-h-0">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center text-xs font-semibold text-slate-700 shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <span>
                {isPresentDayOnly ? "Present Day's Orders" : "Orders History"} ({filteredBills.length})
              </span>
              {!isPresentDayOnly && (
                <span className="text-[11px] text-slate-500 font-normal">
                  • {groupedBillsByDate.length} day{groupedBillsByDate.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-500 text-[11px]">Total Net Sales:</span>
              <span className="text-emerald-700 font-black text-xs sm:text-sm">
                ₹{overallActiveTotal.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto">
            {filteredBills.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                <Receipt className="w-10 h-10 text-slate-300 mb-2" />
                <p className="font-semibold text-sm text-slate-700">
                  {isPresentDayOnly ? "No bills recorded for today yet" : "No bills found for the selected period"}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  {isPresentDayOnly
                    ? "Bills created today in Direct Billing or POS will appear here for reprint. Use the date filter above to view past bills."
                    : "Try expanding your date range or clearing the search query to find previous bills."}
                </p>
                {!isPresentDayOnly && (
                  <button
                    type="button"
                    onClick={handleResetToPresentDay}
                    className="mt-3 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer hover:bg-amber-600 transition-colors"
                  >
                    View Today's Bills
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {groupedBillsByDate.map((group) => {
                  const isCollapsed = Boolean(collapsedDates[group.date]);
                  return (
                    <div key={group.date} className="border-b last:border-b-0 border-slate-200">
                      {/* Day Group Header (Day-by-Day Divider with Date & Daily Total) */}
                      <div 
                        onClick={() => toggleDateCollapse(group.date)}
                        className={`px-3 py-2 flex items-center justify-between cursor-pointer select-none transition-colors ${
                          group.isToday 
                            ? 'bg-amber-50/80 hover:bg-amber-100/70 border-l-4 border-amber-500' 
                            : 'bg-slate-100/80 hover:bg-slate-200/70 border-l-4 border-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-slate-600 p-0.5 rounded hover:bg-black/5"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                          <Calendar className={`w-3.5 h-3.5 ${group.isToday ? 'text-amber-600' : 'text-slate-500'}`} />
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {group.date}
                          </span>
                          {group.isToday && (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.2 rounded">
                              Present Day
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-sans">
                            ({group.billCount} {group.billCount === 1 ? 'bill' : 'bills'})
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-slate-800">
                            Total: <span className="text-emerald-700 font-black">₹{group.totalAmount.toFixed(2)}</span>
                          </span>
                          {group.cancelledCount > 0 && (
                            <span className="text-[10px] text-red-600 font-semibold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                              {group.cancelledCount} cancelled
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-sans">
                            {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                          </span>
                        </div>
                      </div>

                      {/* Day Bills Table */}
                      {!isCollapsed && (
                        <div className="w-full overflow-x-auto scrollbar-thin">
                          <table className="w-full min-w-[560px] text-xs text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px]">
                              <tr>
                                <th className="py-2 pl-3 pr-2 w-28 min-w-[100px] whitespace-nowrap">Bill #</th>
                                <th className="py-2 px-2 w-28 min-w-[105px] whitespace-nowrap">Time</th>
                                <th className="py-2 px-2 w-24 min-w-[90px] whitespace-nowrap">Type</th>
                                <th className="py-2 px-2 w-28 min-w-[100px] text-right whitespace-nowrap">Grand Total</th>
                                <th className="py-2 px-2 w-24 min-w-[90px] text-center whitespace-nowrap">Status</th>
                                <th className="py-2 pl-2 pr-3 w-20 min-w-[80px] text-center whitespace-nowrap">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono bg-white">
                              {group.bills.map((b) => {
                                const isCancelled = String(b.status || '').toUpperCase() === 'CANCELLED';
                                const isSuperseded = isBillSuperseded(b, group.bills);
                                const isRebill = Boolean(b.isRebill || b.originalBillId || b.replacesBillNumber);
                                const isExcludedFromNet = isCancelled || isSuperseded;
                                const replacement = isSuperseded ? getReplacementBill(b, group.bills) : undefined;

                                return (
                                  <tr
                                    key={b.id}
                                    onClick={() => handleSelectBill(b)}
                                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                                      selectedBill?.id === b.id ? 'bg-amber-50/70 border-l-2 border-amber-500' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 pl-3 pr-2 font-bold text-amber-700 whitespace-nowrap">
                                      <span>{b.billNumber}</span>
                                      {b.reprintCount > 0 && (
                                        <span className="ml-1 text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-md" title={`Reprinted ${b.reprintCount} times (no effect on Net Sales)`}>
                                          R:{b.reprintCount}
                                        </span>
                                      )}
                                      {isRebill && (
                                        <span className="ml-1 text-[9px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded-md" title={`Replacement bill for #${b.replacesBillNumber || 'original'}`}>
                                          Re-bill
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-slate-700 font-sans whitespace-nowrap">
                                      <div className="text-[11px] font-mono text-slate-700 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                      {b.userName && (
                                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                          {b.userName}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-slate-600 font-sans text-[11px] whitespace-nowrap">
                                      <div>{b.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'}</div>
                                      <div className="text-[10px] text-amber-700 font-mono">{b.priceType}</div>
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-bold text-sm whitespace-nowrap">
                                      {isExcludedFromNet ? (
                                        <span
                                          className="line-through text-slate-400 font-normal"
                                          title={isCancelled ? "Cancelled Bill (Excluded from Net Sales)" : `Superseded by Re-bill #${replacement?.billNumber || ''} (Excluded from Net Sales)`}
                                        >
                                          ₹{Number(b.grandTotal !== undefined && b.grandTotal !== null ? b.grandTotal : (b.subtotal || 0)).toFixed(2)}
                                        </span>
                                      ) : (
                                        <span className="text-slate-900 font-bold">
                                          ₹{Number(b.grandTotal !== undefined && b.grandTotal !== null ? b.grandTotal : (b.subtotal || 0)).toFixed(2)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                      {isCancelled ? (
                                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                          Cancelled
                                        </span>
                                      ) : isSuperseded ? (
                                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title={`Replaced by bill #${replacement?.billNumber || ''}`}>
                                          Replaced
                                        </span>
                                      ) : isRebill ? (
                                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                          Re-bill
                                        </span>
                                      ) : (
                                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          Completed
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 pl-2 pr-3 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectBill(b);
                                          }}
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                          title="View bill details"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDirectReprint(b);
                                          }}
                                          className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                                          title={`Direct Thermal Reprint Bill #${b.billNumber}`}
                                        >
                                          <Printer className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Bill Detailed View & Action Panel (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs min-h-[380px] lg:min-h-0">
          
          {selectedBill ? (
            <div className="flex flex-col h-full">
              
              {/* Header */}
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-amber-700">
                      Bill #{selectedBill.billNumber}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      selectedBill.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedBill.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {selectedBill.businessDate} • {selectedBill.userName}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-slate-500 font-mono">
                    Reprints: <b className="text-slate-800">{selectedBill.reprintCount || 0}</b>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {selectedBill.status === 'CANCELLED' && (
                  <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-xs text-red-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-red-900">
                      <Ban className="w-3.5 h-3.5 text-red-600" />
                      <span>Cancelled Bill (Excluded from Total Net Sales)</span>
                    </div>
                    {selectedBill.cancelReason && (
                      <div className="text-[11px] text-red-700">Reason: {selectedBill.cancelReason}</div>
                    )}
                    {selectedBill.cancelledBy && (
                      <div className="text-[10px] text-slate-500">Cancelled by: {selectedBill.cancelledBy}</div>
                    )}
                  </div>
                )}

                {isBillSuperseded(selectedBill, bills) && selectedBill.status !== 'CANCELLED' && (
                  <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Superseded by Re-bill #{getReplacementBill(selectedBill, bills)?.billNumber || 'replacement'}</span>
                    </div>
                    <div className="text-[11px] text-amber-700">
                      This bill has been replaced and its amount is excluded from Daily Net Sales.
                    </div>
                  </div>
                )}

                {(selectedBill.isRebill || selectedBill.originalBillId || selectedBill.replacesBillNumber) && (
                  <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-xl text-xs text-purple-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-purple-800">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Valid Replacement Re-bill</span>
                    </div>
                    <div className="text-[11px] text-purple-700">
                      Replaces original Bill #{selectedBill.replacesBillNumber || 'original'}. Counted as the active sale.
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  {loadingItems ? (
                    <div className="py-6 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading order items...</span>
                    </div>
                  ) : selectedBillItems.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-xs">
                      No item rows found for this order.
                    </div>
                  ) : (
                    <div className="w-full overflow-x-auto scrollbar-thin">
                      <table className="w-full min-w-[360px] text-xs text-left font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 text-[10px]">
                            <th className="pb-1.5 pr-2 min-w-[140px] whitespace-nowrap">Item</th>
                            <th className="pb-1.5 px-2 w-16 min-w-[55px] text-center whitespace-nowrap">Qty</th>
                            <th className="pb-1.5 px-2 w-20 min-w-[75px] text-right whitespace-nowrap">Price</th>
                            <th className="pb-1.5 pl-2 w-24 min-w-[85px] text-right whitespace-nowrap">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedBillItems.map((item, idx) => {
                            const qty = Number(item.quantity) || 0;
                            const price = Number(item.unitPrice) || 0;
                            const lineTotal = item.totalPrice !== undefined && !isNaN(Number(item.totalPrice))
                              ? Number(item.totalPrice)
                              : qty * price;
                            return (
                              <tr key={idx}>
                                <td className="py-2 pr-2 text-slate-800 font-sans font-medium whitespace-nowrap">{item.itemName}</td>
                                <td className="py-2 px-2 text-center text-slate-700 font-bold whitespace-nowrap">{qty}</td>
                                <td className="py-2 px-2 text-right text-slate-500 whitespace-nowrap">₹{price.toFixed(2)}</td>
                                <td className="py-2 pl-2 text-right font-bold text-slate-900 whitespace-nowrap">₹{lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Calculation Totals Box (Reconciled with items sum and bill calculation) */}
                {(() => {
                  const itemsSum = selectedBillItems.reduce((acc, itm) => {
                    const q = Number(itm.quantity) || 0;
                    const p = Number(itm.unitPrice) || 0;
                    const t = itm.totalPrice !== undefined && !isNaN(Number(itm.totalPrice)) ? Number(itm.totalPrice) : q * p;
                    return acc + t;
                  }, 0);

                  const rawSubtotal = Number(selectedBill.subtotal);
                  const effectiveSubtotal = (!isNaN(rawSubtotal) && rawSubtotal > 0)
                    ? rawSubtotal
                    : (itemsSum > 0 ? itemsSum : Number(selectedBill.grandTotal || 0));

                  const effectiveDiscount = Number(selectedBill.discount || 0);
                  const rawGrandTotal = Number(selectedBill.grandTotal);
                  const effectiveGrandTotal = (!isNaN(rawGrandTotal) && rawGrandTotal > 0)
                    ? rawGrandTotal
                    : Math.max(0, effectiveSubtotal - effectiveDiscount);

                  return (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span>₹{effectiveSubtotal.toFixed(2)}</span>
                      </div>
                      {effectiveDiscount > 0 && (
                        <div className="flex justify-between text-red-600 font-bold">
                          <span>Discount:</span>
                          <span>-₹{effectiveDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 pt-1.5 flex justify-between text-sm font-bold text-slate-900">
                        <span>Grand Total:</span>
                        <span className="text-emerald-700 font-extrabold text-base">₹{effectiveGrandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons: Reprint & Cancel */}
              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
                
                {/* Cancel Bill Button (Owner or authorized Manager) */}
                {selectedBill.status === 'COMPLETED' && (isOwner || isManager) && (
                  <button
                    onClick={() => setCancelModalOpen(true)}
                    className="py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Cancel Bill</span>
                  </button>
                )}

                {/* Direct Thermal Reprint via Chrome Kiosk Printing */}
                <button
                  type="button"
                  onClick={() => handleDirectReprint(selectedBill)}
                  disabled={loadingItems || reprinting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                  title="Directly send duplicate bill to default thermal printer"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {reprinting ? 'Printing...' : `Reprint Bill #${selectedBill.billNumber}`}
                  </span>
                </button>

                {/* Optional On-Screen Preview Button */}
                <button
                  type="button"
                  onClick={() => handleOpenReprintPreview(selectedBill)}
                  disabled={loadingItems}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  title="View on-screen receipt preview"
                >
                  <Eye className="w-4 h-4" />
                </button>

              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <FileText className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Select a bill from the list</p>
              <p className="text-xs text-slate-500">You can view details, cancel, or preview and trigger thermal reprint.</p>
            </div>
          )}

        </div>

      </div>

      {/* Cancellation Reason Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              <h3 className="font-bold text-sm">Cancel Bill #{selectedBill?.billNumber}</h3>
            </div>

            <p className="text-xs text-slate-600">
              Please enter the reason for cancelling this bill. The bill will remain saved in database as CANCELLED for audit trails.
            </p>

            <textarea
              rows={3}
              value={cancelReason || ''}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer changed mind, wrong items entered..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-red-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl"
              >
                Close
              </button>
              <button
                onClick={handleCancelBill}
                disabled={cancelling || !cancelReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Receipt Preview Modal (Triggered for Reprinting Receipt) */}
      {isReceiptOpen && selectedBill && (
        <ThermalReceiptModal
          bill={selectedBill}
          items={selectedBillItems}
          settings={settings}
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          onPrint={handleConfirmPrintReprint}
          isReprint={true}
          printButtonText="Confirm & Print Reprint"
          isPrinting={reprinting}
        />
      )}

      {/* Erase All Bills Confirmation Modal */}
      {eraseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Erase All Bills in Software?</h3>
                <p className="text-[11px] text-red-600 font-semibold">Destructive Action • Irreversible</p>
              </div>
            </div>

            <div className="bg-red-50/80 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 space-y-2">
              <p className="font-medium">
                This will permanently delete all completed bills and bill items from both cloud database and local storage.
              </p>
              <ul className="list-disc pl-4 text-[11px] space-y-1 text-red-800">
                <li>All past orders and bill histories will be wiped.</li>
                <li>The bill numbering sequence will reset back to <strong>#01</strong>.</li>
                <li>Menu items, prices, categories, and settings will remain untouched.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={erasing}
                onClick={() => setEraseModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEraseAllBills}
                disabled={erasing}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Trash2 className={`w-3.5 h-3.5 ${erasing ? 'animate-spin' : ''}`} />
                <span>{erasing ? 'Erasing All Bills...' : 'Yes, Erase All Bills'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
