import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  ShoppingBag, 
  ChefHat, 
  Receipt, 
  Boxes, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Bill, BillItem, Kot, RestaurantSettings } from '../../types';
import { getBusinessDate } from '../../services/billNumberEngine';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { NavTab } from '../common/Sidebar';
import { getLocalBills, getLocalBillItems, getLocalItemsMap, mergeBills, subscribeToLocalBills } from '../../services/localBillStore';
import { getLocalKots, subscribeToLocalKots } from '../../services/localKotStore';
import { SummaryCardsGrid, DashboardMetrics } from './SummaryCardsGrid';
import { WeeklySalesTrendCard } from './WeeklySalesTrendCard';
import { DailySnapshot } from './DailySnapshot';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';

interface DashboardProps {
  settings?: RestaurantSettings;
  onNavigate: (tab: NavTab) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ settings, onNavigate }) => {
  const { currentUser, isOwner, isManager, isWaiter, hasPermission, switchDemoRole } = useAuth();

  const [todayBills, setTodayBills] = useState<Bill[]>([]);
  const [todayBillItems, setTodayBillItems] = useState<BillItem[]>([]);
  const [weeklyBills, setWeeklyBills] = useState<Bill[]>([]);
  const [runningKots, setRunningKots] = useState<Kot[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalMenuItems, setTotalMenuItems] = useState(0);
  const [isFirestoreLive, setIsFirestoreLive] = useState(true);
  const [loading, setLoading] = useState(true);

  const businessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');

  // Compute the start date for the 7-day rolling window (Day -6 to Today)
  const sevenDaysStartDate = useMemo(() => {
    const parts = businessDate.split('-').map((p) => parseInt(p, 10));
    const year = parts[0] || new Date().getFullYear();
    const month = parts[1] || (new Date().getMonth() + 1);
    const day = parts[2] || new Date().getDate();

    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() - 6);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, [businessDate]);

  useEffect(() => {
    // 1. Prime today and weekly bills with local bills immediately
    const updateFromLocal = () => {
      const allLocal = getLocalBills();
      const localToday = allLocal.filter((b) => b.businessDate === businessDate);
      const localWeekly = allLocal.filter((b) => b.businessDate >= sevenDaysStartDate && b.businessDate <= businessDate);
      setTodayBills((prev) => mergeBills(prev, localToday));
      setWeeklyBills((prev) => mergeBills(prev, localWeekly));

      // Extract items for today's snapshot
      const localMap = getLocalItemsMap();
      const localItems: BillItem[] = [];
      localToday.forEach((b) => {
        if (b.items && b.items.length > 0) {
          localItems.push(...b.items);
        } else {
          const list = localMap[b.id] || getLocalBillItems(b.id);
          if (list && list.length > 0) localItems.push(...list);
        }
      });
      setTodayBillItems((prev) => {
        const itemMap = new Map<string, BillItem>();
        prev.forEach((i) => itemMap.set(i.id, i));
        localItems.forEach((i) => itemMap.set(i.id, i));
        return Array.from(itemMap.values());
      });

      setLoading(false);
    };

    updateFromLocal();

    // 2. Listen to local bill changes
    const unsubLocal = subscribeToLocalBills(() => {
      updateFromLocal();
    });

    // 3. Today's bills from Firestore
    let unsubBills: (() => void) | undefined;
    try {
      const qBills = query(
        collection(db, 'bills'),
        where('businessDate', '==', businessDate)
      );
      unsubBills = onSnapshot(
        qBills, 
        (snap) => {
          const list: Bill[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Bill));
          const localToday = getLocalBills().filter((b) => b.businessDate === businessDate);
          setTodayBills(mergeBills(list, localToday));
          setLoading(false);
        },
        (err) => {
          console.warn('Today bills Firestore notice (using local bills):', err?.message || err);
          updateFromLocal();
        }
      );
    } catch (e) {
      console.warn('Bills query setup notice:', e);
    }

    // 3b. Today's bill items from Firestore for real-time item analytics & top-selling dish
    let unsubBillItems: (() => void) | undefined;
    try {
      const qBillItems = query(
        collection(db, 'bill_items'),
        where('businessDate', '==', businessDate)
      );
      unsubBillItems = onSnapshot(
        qBillItems,
        (snap) => {
          const list: BillItem[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as BillItem));
          const localMap = getLocalItemsMap();
          const mergedMap = new Map<string, BillItem>();
          list.forEach((i) => mergedMap.set(i.id, i));
          Object.values(localMap).flat().forEach((i) => {
            if (i.businessDate === businessDate && !mergedMap.has(i.id)) {
              mergedMap.set(i.id, i);
            }
          });
          setTodayBillItems(Array.from(mergedMap.values()));
        },
        (err) => {
          console.warn('Bill items Firestore subscription notice:', err?.message || err);
        }
      );
    } catch (e) {
      console.warn('Bill items query setup notice:', e);
    }

    // Last 7 days bills for the Weekly Sales Trend visualization card (fetching from Firestore)
    let unsubWeeklyBills: (() => void) | undefined;
    try {
      const qWeeklyBills = query(
        collection(db, 'bills'),
        where('businessDate', '>=', sevenDaysStartDate),
        where('businessDate', '<=', businessDate)
      );
      unsubWeeklyBills = onSnapshot(
        qWeeklyBills, 
        (snap) => {
          const list: Bill[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Bill));
          const localWeekly = getLocalBills().filter((b) => b.businessDate >= sevenDaysStartDate && b.businessDate <= businessDate);
          setWeeklyBills(mergeBills(list, localWeekly));
          setIsFirestoreLive(true);
        }, 
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'bills');
          setIsFirestoreLive(false);
          // Fall back seamlessly to local storage cache so graph remains interactive
          const localWeekly = getLocalBills().filter((b) => b.businessDate >= sevenDaysStartDate && b.businessDate <= businessDate);
          setWeeklyBills((prev) => mergeBills(prev, localWeekly));
        }
      );
    } catch (e) {
      console.warn('Weekly bills query setup notice:', e);
      setIsFirestoreLive(false);
    }

    // Running KOTs: load from local cache first for 0ms reactivity & instant pulse notifications
    const loadLocalRunningKots = () => {
      const stored = getLocalKots();
      if (stored.length > 0) {
        const activeKots = stored
          .map((s) => s.kot)
          .filter((k) => ['OPEN', 'SENT', 'PREPARING', 'READY', 'COMPLETED'].includes(k.status));
        setRunningKots((prev) => {
          const map = new Map<string, Kot>();
          prev.forEach((k) => map.set(k.id, k));
          activeKots.forEach((k) => map.set(k.id, k));
          return Array.from(map.values());
        });
      }
    };
    loadLocalRunningKots();

    const unsubLocalKots = subscribeToLocalKots(() => {
      loadLocalRunningKots();
    });

    let unsubKots: (() => void) | undefined;
    try {
      const qKots = query(
        collection(db, 'kots'),
        where('status', 'in', ['OPEN', 'SENT', 'PREPARING', 'READY', 'COMPLETED'])
      );
      unsubKots = onSnapshot(
        qKots, 
        (snap) => {
          const remoteList: Kot[] = [];
          snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() } as Kot));

          const stored = getLocalKots();
          const localActive = stored
            .map((s) => s.kot)
            .filter((k) => ['OPEN', 'SENT', 'PREPARING', 'READY', 'COMPLETED'].includes(k.status));

          const map = new Map<string, Kot>();
          remoteList.forEach((k) => map.set(k.id, k));
          localActive.forEach((k) => {
            if (!map.has(k.id)) {
              map.set(k.id, k);
            }
          });

          setRunningKots(Array.from(map.values()));
        },
        (err) => {
          console.warn('KOTs subscription notice:', err?.message || err);
          loadLocalRunningKots();
        }
      );
    } catch (e) {
      console.warn('KOTs query setup notice:', e);
    }

    // Menu count
    let unsubMenu: (() => void) | undefined;
    try {
      unsubMenu = onSnapshot(
        collection(db, 'menu_items'), 
        (snap) => {
          setTotalMenuItems(snap.size);
        },
        (err) => {
          console.warn('Menu items count notice:', err?.message || err);
        }
      );
    } catch (e) {
      console.warn('Menu items query setup notice:', e);
    }

    // Low stock
    let unsubInv: (() => void) | undefined;
    try {
      unsubInv = onSnapshot(
        collection(db, 'inventory_items'), 
        (snap) => {
          let low = 0;
          snap.forEach((d) => {
            const item = d.data();
            if (item.currentStock <= (item.minimumStock || item.lowStockThreshold || 5)) low++;
          });
          setLowStockCount(low);
        },
        (err) => {
          console.warn('Inventory items count notice:', err?.message || err);
        }
      );
    } catch (e) {
      console.warn('Inventory query setup notice:', e);
    }

    return () => {
      unsubLocal();
      unsubLocalKots();
      if (unsubBills) unsubBills();
      if (unsubBillItems) unsubBillItems();
      if (unsubWeeklyBills) unsubWeeklyBills();
      if (unsubKots) unsubKots();
      if (unsubMenu) unsubMenu();
      if (unsubInv) unsubInv();
    };
  }, [businessDate, sevenDaysStartDate]);

  const completedBills = todayBills.filter((b) => b.status === 'COMPLETED');
  const todayRevenue = completedBills.reduce((s, b) => s + b.grandTotal, 0);

  // Compute comprehensive dynamic metrics for high-level summary cards
  const dashboardMetrics: DashboardMetrics = useMemo(() => {
    const completed = todayBills.filter((b) => b.status === 'COMPLETED');
    const cancelled = todayBills.filter((b) => b.status === 'CANCELLED');
    const rev = completed.reduce((s, b) => s + b.grandTotal, 0);
    const cash = completed.filter((b) => (b.paymentMethod || 'CASH').toUpperCase() === 'CASH').reduce((s, b) => s + b.grandTotal, 0);
    const upi = completed.filter((b) => {
      const m = (b.paymentMethod || '').toUpperCase();
      return m === 'UPI' || m === 'CARD' || m === 'DIGITAL';
    }).reduce((s, b) => s + b.grandTotal, 0);
    const dineIn = completed.filter((b) => b.orderType === 'DINE_IN').length;
    const takeAway = completed.filter((b) => b.orderType === 'TAKE_AWAY').length;
    const aov = completed.length > 0 ? Math.round(rev / completed.length) : 0;

    const activeList = runningKots.filter((k) => k.status !== 'COMPLETED' && k.status !== 'CANCELLED' && k.status !== 'BILLED');
    const prep = activeList.filter((k) => k.status === 'PREPARING').length;
    const ready = activeList.filter((k) => k.status === 'READY').length;
    const sent = activeList.filter((k) => k.status === 'OPEN' || k.status === 'SENT').length;
    const tables = Array.from(new Set(activeList.map((k) => k.tableNumber).filter(Boolean))) as string[];
    const newestKot = activeList.length > 0 ? [...activeList].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] : undefined;

    return {
      businessDate,
      todayRevenue: rev,
      todayCashSales: cash,
      todayUpiSales: upi,
      completedBillsCount: completed.length,
      cancelledBillsCount: cancelled.length,
      dineInBillsCount: dineIn,
      takeAwayBillsCount: takeAway,
      avgOrderValue: aov,
      activeKotsCount: activeList.length,
      preparingKotsCount: prep,
      readyKotsCount: ready,
      sentKotsCount: sent,
      activeTableNumbers: tables,
      totalMenuItems,
      lowStockCount,
      latestKotNumber: newestKot ? String(newestKot.kotNumber) : undefined,
      latestKotTable: newestKot?.tableNumber,
      latestKotTime: newestKot?.createdAt
    };
  }, [todayBills, runningKots, businessDate, totalMenuItems, lowStockCount]);

  // RBAC Permission checks for revenue display
  const canViewRevenue = hasPermission('reports.view') || isOwner;

  return (
    <div className="flex flex-col h-full bg-slate-100 text-slate-800 p-3 sm:p-6 gap-4 sm:gap-5 overflow-y-auto font-sans">
      
      {/* Welcome Banner with Official Shop Logo */}
      <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xs">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border-2 border-amber-400 shadow-xs flex items-center justify-center p-1 shrink-0 overflow-hidden transition-transform hover:scale-105">
            <img 
              src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO}
              alt={settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
                BUSINESS DATE: {businessDate}
              </span>
              <span className="text-xs text-slate-500">
                Role: <b className="text-slate-800 uppercase">{currentUser?.roleId}</b>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">
              {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
            </h2>
          </div>
        </div>

        {/* Quick Direct Launch Action */}
        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => onNavigate('direct-billing')}
            className="px-3 sm:px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all min-h-[44px]"
          >
            <Zap className="w-4 h-4 fill-white shrink-0" />
            <span className="truncate">Fast Billing (F2)</span>
          </button>
          <button
            onClick={() => onNavigate('pos')}
            className="px-3 sm:px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all min-h-[44px]"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="truncate">Touch POS</span>
          </button>
        </div>
      </div>

      {/* Daily Snapshot Section (Total Sales, Bill Count, Top-Selling Item) */}
      <DailySnapshot
        businessDate={businessDate}
        bills={todayBills}
        billItems={todayBillItems}
        canViewRevenue={canViewRevenue}
        onNavigate={onNavigate}
      />

      {/* Dynamic Role-Gated High-Level Summary Cards */}
      <SummaryCardsGrid
        metrics={dashboardMetrics}
        userRole={currentUser?.roleId}
        isOwner={isOwner}
        isManager={isManager}
        isWaiter={isWaiter}
        hasPermission={hasPermission}
        onNavigate={onNavigate}
        onSwitchRole={switchDemoRole}
      />

      {/* Weekly Sales Trend Visualization Card (Recharts Line Chart with 7-day Firestore data) */}
      <WeeklySalesTrendCard
        bills={weeklyBills}
        businessDate={businessDate}
        canViewRevenue={canViewRevenue}
        isFirestoreLive={isFirestoreLive}
      />

      {/* 2-Column Split: Active Operations on Left, Fast Actions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
        
        {/* Left Column: Recent Activity (8 cols) */}
        <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <span className="font-bold text-base sm:text-lg text-slate-800">Today's Recent Bills</span>
            <button
              onClick={() => onNavigate('reprint')}
              className="text-sm text-amber-600 hover:text-amber-700 font-bold cursor-pointer"
            >
              View All Bills →
            </button>
          </div>

          <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
            {todayBills.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                <Clock className="w-9 h-9 text-slate-300 mb-2" />
                <p className="text-base sm:text-lg font-semibold text-slate-700">No bills created yet today</p>
                <p className="text-sm text-slate-500">Start with Direct Billing or POS to process orders.</p>
              </div>
            ) : (
              <table className="w-full text-base sm:text-lg text-left font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs sm:text-sm uppercase tracking-wider">
                    <th className="pb-2.5 pl-2">Bill #</th>
                    <th className="pb-2.5">Time</th>
                    <th className="pb-2.5">Type</th>
                    <th className="pb-2.5 text-right">Amount</th>
                    <th className="pb-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todayBills.slice(0, 8).map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-3 pl-2 font-bold text-amber-700 text-base sm:text-lg">{b.billNumber}</td>
                      <td className="py-3 text-slate-600 font-sans text-sm sm:text-base">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 text-slate-700 font-sans text-sm sm:text-base font-medium">
                        {b.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'} ({b.priceType})
                      </td>
                      <td className="py-3 text-right font-extrabold text-slate-900 text-base sm:text-lg">₹{b.grandTotal}</td>
                      <td className="py-3 text-center">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Quick Navigation (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Quick Launch Navigation Cards */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
            <h3 className="font-bold text-sm text-slate-500 uppercase tracking-wider">Fast Navigation</h3>
            
            <button
              onClick={() => onNavigate('kot')}
              className="w-full p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg text-slate-800">Kitchen Orders (KOT)</div>
                  <div className="text-xs sm:text-sm text-slate-500">Live order status & kitchen tickets</div>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className="w-full p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg text-slate-800">Sales Reports & Excel</div>
                  <div className="text-xs sm:text-sm text-slate-500">Item-wise breakdown & .xlsx export</div>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className="w-full p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-base sm:text-lg text-slate-800">Restaurant Settings</div>
                  <div className="text-xs sm:text-sm text-slate-500">Receipt headers, timing & data seeder</div>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-slate-400" />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
