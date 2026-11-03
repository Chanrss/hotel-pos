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
  Sparkles,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  PieChart as PieChartIcon,
  Utensils,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { Bill, BillItem, Kot, MenuItem, RestaurantSettings } from '../../types';
import { getBusinessDate } from '../../services/billNumberEngine';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { NavTab } from '../common/Sidebar';
import { getLocalBills, getLocalBillItems, getLocalItemsMap, mergeBills, subscribeToLocalBills } from '../../services/localBillStore';
import { getLocalKots, subscribeToLocalKots } from '../../services/localKotStore';
import { SummaryCardsGrid, DashboardMetrics } from './SummaryCardsGrid';
import { WeeklySalesTrendCard } from './WeeklySalesTrendCard';
import { DailySnapshot } from './DailySnapshot';
import { calculateDailyNetSales } from '../../services/salesCalculationEngine';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';
import { DEFAULT_FALLBACK_MENU_ITEMS } from '../../data/fallbackMenu';

interface DashboardProps {
  settings?: RestaurantSettings;
  onNavigate: (tab: NavTab) => void;
}

export interface CategorySalesSlice {
  id: string;
  name: string;
  subtitle: string;
  revenue: number;
  quantity: number;
  lineCount: number;
  transactionCount: number;
  percentage: number;
  catalogCount: number;
  color: string;
  chartValue: number;
  isZeroSalesBaseline: boolean;
}

interface CourseCategoryMeta {
  id: string;
  name: string;
  subtitle: string;
  color: string;
}

const COURSE_CATEGORIES: CourseCategoryMeta[] = [
  {
    id: 'main_course',
    name: 'Main Course',
    subtitle: 'Meals, Variety Rice, Parotta, Fried Rice & Gravies',
    color: '#d97706' // Amber 600
  },
  {
    id: 'tiffin_dosai',
    name: 'Tiffin & Dosai',
    subtitle: 'Idly, Dosa, Roast, Uthappam, Pongal & Poori',
    color: '#059669' // Emerald 600
  },
  {
    id: 'starters',
    name: 'Starters',
    subtitle: 'Gobi 65, Manchurian, Soups, Bajji, Bonda & Samosa',
    color: '#2563eb' // Blue 600
  },
  {
    id: 'beverages',
    name: 'Beverages',
    subtitle: 'Filter Coffee, Tea, Milk, Soft Drinks & Water',
    color: '#7c3aed' // Violet 600
  },
  {
    id: 'desserts',
    name: 'Desserts & Sweets',
    subtitle: 'Amul Ice Creams, Traditional Sweets & Savouries',
    color: '#db2777' // Pink 600
  }
];

const MENU_CATEGORY_COLORS: Record<string, { subtitle: string; color: string }> = {
  'Tiffin & Breakfast': { subtitle: 'Morning & Evening Tiffin, Idly, Dosai & Vada', color: '#059669' },
  'Meals & Variety Rice': { subtitle: 'Full Meals, Mini Meals, Briyani & Variety Rice', color: '#d97706' },
  'Parotta, Rice & Chinese': { subtitle: 'Parotta, Fried Rice, Noodles, 65 & Manchurian', color: '#2563eb' },
  'Hot Drinks & Beverages': { subtitle: 'Filter Coffee, Tea, Sukku Tea & Badam Milk', color: '#7c3aed' },
  'Snacks, Sweets & Savouries': { subtitle: 'Bajji, Pakoda, Bonda, Samosa, Poli & Sweets', color: '#ea580c' },
  'Cold Beverages & Soft Drinks': { subtitle: 'Mineral Water, Soda, 7Up, Pepsi & Slice', color: '#0891b2' },
  'Amul Ice Creams': { subtitle: 'Assorted Amul Ice Cream Cups, Cones & Bars', color: '#db2777' }
};

function classifyCourseCategoryId(itemNameRaw: string, categoryNameRaw: string, itemCodeRaw: string): string {
  const name = itemNameRaw.toLowerCase();
  const cat = categoryNameRaw.toLowerCase();
  const codeNum = parseInt(itemCodeRaw, 10);

  // Explicit category matches first if someone named a category directly
  if (cat.includes('starter') || cat.includes('appetizer')) return 'starters';
  if (cat.includes('beverage') || cat.includes('drink')) {
    return 'beverages';
  }
  if (cat.includes('ice cream') || cat.includes('dessert')) return 'desserts';

  // Keyword checks on item name
  if (
    name.includes('amul') ||
    name.includes('ice cream') ||
    name.includes('sweet') ||
    name.includes('athurasam') ||
    name.includes('chikki') ||
    name.includes('poli') ||
    name.includes('jaggery') ||
    name.includes('beeda') ||
    name.includes('biscuit') ||
    name.includes('bisckat')
  ) {
    return 'desserts';
  }

  if (
    name.includes('tea') ||
    name.includes('coffee') ||
    name.includes('milk') ||
    name.includes('boost') ||
    name.includes('horlic') ||
    name.includes('soda') ||
    name.includes('bottle') ||
    name.includes('aquafina') ||
    name.includes('water') ||
    name.includes('slice') ||
    name.includes('7up') ||
    name.includes('pepsi') ||
    name.includes('string') ||
    name.includes('juice') ||
    cat.includes('hot drinks') ||
    cat.includes('cold beverages')
  ) {
    return 'beverages';
  }

  if (
    name.includes('65') ||
    name.includes('manchurian') ||
    name.includes('soup') ||
    name.includes('bajji') ||
    name.includes('pakoda') ||
    name.includes('cutlet') ||
    name.includes('bonda') ||
    name.includes('samosa') ||
    name.includes('sundal') ||
    name.includes('chilly idly') ||
    name.includes('vada') ||
    cat.includes('snacks')
  ) {
    return 'starters';
  }

  if (
    name.includes('dosa') ||
    name.includes('dosai') ||
    name.includes('roast') ||
    name.includes('uthappam') ||
    name.includes('idly') ||
    name.includes('idli') ||
    name.includes('tiffen') ||
    name.includes('tiffin') ||
    name.includes('pongal') ||
    name.includes('khichdi') ||
    (name.includes('poori') && !name.includes('chola'))
  ) {
    return 'tiffin_dosai';
  }

  if (
    name.includes('meal') ||
    name.includes('rice') ||
    name.includes('briyany') ||
    name.includes('biryani') ||
    name.includes('parotta') ||
    name.includes('chappathi') ||
    name.includes('noodel') ||
    name.includes('noodle') ||
    name.includes('gravy') ||
    name.includes('masala') ||
    name.includes('lafa') ||
    name.includes('chola poori') ||
    name.includes('sambar') ||
    name.includes('curd') ||
    cat.includes('meals') ||
    cat.includes('parotta') ||
    cat.includes('main')
  ) {
    return 'main_course';
  }

  // Fallback by numeric item code ranges from Sri Saravana Bhavan menu
  if (!Number.isNaN(codeNum)) {
    if (codeNum >= 1 && codeNum <= 13) return 'beverages';
    if (codeNum === 14) return 'desserts';
    if (codeNum >= 15 && codeNum <= 53) return 'tiffin_dosai';
    if ((codeNum >= 54 && codeNum <= 90) || (codeNum >= 97 && codeNum <= 102) || codeNum === 112) return 'main_course';
    if ((codeNum >= 91 && codeNum <= 96) || codeNum === 104 || (codeNum >= 106 && codeNum <= 111) || codeNum >= 149) return 'starters';
    if (codeNum >= 115 && codeNum <= 129) return 'beverages';
    if (codeNum >= 130 && codeNum <= 147) return 'desserts';
  }

  if (cat.includes('tiffin')) return 'tiffin_dosai';
  return 'main_course';
}

export interface CategoryTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CategorySalesSlice }>;
  canViewRevenue: boolean;
}

export const CategoryDoughnutTooltip: React.FC<CategoryTooltipProps> = ({ active, payload, canViewRevenue }) => {
  if (active && payload && payload.length > 0) {
    const slice = payload[0].payload;
    const avgPerTxn = slice.transactionCount > 0 ? Math.round(slice.revenue / slice.transactionCount) : 0;
    return (
      <div
        data-testid="category-doughnut-tooltip"
        className="bg-slate-900/95 backdrop-blur-xs text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[225px]"
      >
        <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/20"
              style={{ backgroundColor: slice.color }}
            />
            <span className="font-extrabold text-slate-100 truncate">{slice.name}</span>
          </div>
          <span className="font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.5 rounded tabular-nums shrink-0">
            {slice.percentage.toFixed(1)}%
          </span>
        </div>
        {slice.subtitle && (
          <p className="text-[10.5px] text-slate-400 mt-1 pb-1.5 border-b border-slate-800/80 truncate max-w-[230px]">
            {slice.subtitle}
          </p>
        )}
        <div className="pt-2 space-y-1.5">
          {canViewRevenue && (
            <div className="flex justify-between items-center gap-4" data-testid="tooltip-category-revenue">
              <span className="text-slate-400">Exact Revenue:</span>
              <span className="font-mono font-black text-emerald-400 text-sm tabular-nums">
                ₹{slice.revenue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center gap-4" data-testid="tooltip-category-transactions">
            <span className="text-slate-400">Transactions:</span>
            <span className="font-mono font-bold text-amber-300 tabular-nums">
              {slice.transactionCount.toLocaleString('en-IN')} {slice.transactionCount === 1 ? 'bill' : 'bills'}
            </span>
          </div>
          <div className="flex justify-between items-center gap-4" data-testid="tooltip-category-quantity">
            <span className="text-slate-400">Items Sold:</span>
            <span className="font-mono font-bold text-slate-200 tabular-nums">
              {slice.quantity.toLocaleString('en-IN')} qty
            </span>
          </div>
          <div className="flex justify-between items-center gap-4 text-[11px] pt-1.5 border-t border-slate-800">
            <span className="text-slate-400">
              {canViewRevenue && slice.transactionCount > 0 ? 'Avg / Transaction:' : 'Catalog Items:'}
            </span>
            <span className="font-mono text-slate-300 tabular-nums">
              {canViewRevenue && slice.transactionCount > 0
                ? `₹${avgPerTxn.toLocaleString('en-IN')}`
                : `${slice.catalogCount} dishes`}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

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

export const Dashboard: React.FC<DashboardProps> = ({ settings, onNavigate }) => {
  const { currentUser, isOwner, isManager, isWaiter, hasPermission, switchDemoRole } = useAuth();

  const [todayBills, setTodayBills] = useState<Bill[]>([]);
  const [todayBillItems, setTodayBillItems] = useState<BillItem[]>([]);
  const [weeklyBills, setWeeklyBills] = useState<Bill[]>([]);
  const [runningKots, setRunningKots] = useState<Kot[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalMenuItems, setTotalMenuItems] = useState(DEFAULT_FALLBACK_MENU_ITEMS.length);
  const [menuCatalog, setMenuCatalog] = useState<MenuItem[]>(DEFAULT_FALLBACK_MENU_ITEMS);
  const [isFirestoreLive, setIsFirestoreLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [categoryGrouping, setCategoryGrouping] = useState<'course' | 'menu'>('course');
  const [categoryMetric, setCategoryMetric] = useState<'revenue' | 'quantity'>('revenue');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const currentBusinessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');
  const [selectedBusinessDate, setSelectedBusinessDate] = useState<string>(() => currentBusinessDate);

  const businessDate = selectedBusinessDate || currentBusinessDate;
  const isViewingToday = businessDate === currentBusinessDate;
  const yesterdayBusinessDate = useMemo(() => shiftDateYMD(currentBusinessDate, -1), [currentBusinessDate]);

  // Compute the start date for the 7-day rolling window (Day -6 to selected businessDate)
  const sevenDaysStartDate = useMemo(() => shiftDateYMD(businessDate, -6), [businessDate]);

  useEffect(() => {
    // Reset current date's state before loading selected business day
    setTodayBills([]);
    setTodayBillItems([]);
    setWeeklyBills([]);
    setLoading(true);

    // 1. Prime today and weekly bills with local bills immediately
    const updateFromLocal = () => {
      const allLocal = getLocalBills();
      if (allLocal.length === 0) {
        setTodayBills([]);
        setWeeklyBills([]);
        setTodayBillItems([]);
        setLoading(false);
        return;
      }

      const localToday = allLocal.filter((b) => b.businessDate === businessDate);
      const localWeekly = allLocal.filter((b) => b.businessDate >= sevenDaysStartDate && b.businessDate <= businessDate);
      setTodayBills((prev) => mergeBills(prev.filter((b) => b.businessDate === businessDate), localToday));
      setWeeklyBills((prev) => mergeBills(prev.filter((b) => b.businessDate >= sevenDaysStartDate && b.businessDate <= businessDate), localWeekly));

      // Extract items for selected business day's snapshot
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
        prev.filter((i) => !i.businessDate || i.businessDate === businessDate).forEach((i) => itemMap.set(i.id, i));
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

    // 2b. Listen to global bills erased event
    const handleErased = () => {
      setTodayBills([]);
      setWeeklyBills([]);
      setTodayBillItems([]);
    };
    window.addEventListener('pos_bills_erased', handleErased);

    // 3. Selected business date's bills from Firestore
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
          if (list.length === 0 && localToday.length === 0) {
            setTodayBills([]);
            setTodayBillItems([]);
          } else {
            setTodayBills(mergeBills(list, localToday));
          }
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

    // 3b. Selected business date's bill items from Firestore for real-time item analytics & top-selling dish
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
          setWeeklyBills((prev) => mergeBills(prev.filter((b) => b.businessDate >= sevenDaysStartDate && b.businessDate <= businessDate), localWeekly));
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

    // Menu count & catalog for category lookup
    let unsubMenu: (() => void) | undefined;
    try {
      unsubMenu = onSnapshot(
        collection(db, 'menu_items'), 
        (snap) => {
          if (snap.size > 0) {
            setTotalMenuItems(snap.size);
            const items: MenuItem[] = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MenuItem));
            setMenuCatalog(items);
          }
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
      window.removeEventListener('pos_bills_erased', handleErased);
      if (unsubBills) unsubBills();
      if (unsubBillItems) unsubBillItems();
      if (unsubWeeklyBills) unsubWeeklyBills();
      if (unsubKots) unsubKots();
      if (unsubMenu) unsubMenu();
      if (unsubInv) unsubInv();
    };
  }, [businessDate, sevenDaysStartDate]);

  // Calculate exact Daily Net Sales using canonical salesCalculationEngine
  // (Prevents duplicate counting of reprints, excludes cancelled bills, and handles re-bills correctly)
  const salesBreakdown = useMemo(() => calculateDailyNetSales(todayBills), [todayBills]);
  const completedBills = salesBreakdown.validBills;
  const todayRevenue = salesBreakdown.netSales;

  // Compute comprehensive dynamic metrics for high-level summary cards
  const dashboardMetrics: DashboardMetrics = useMemo(() => {
    const rev = salesBreakdown.netSales;
    const cash = salesBreakdown.cashSales;
    const upi = salesBreakdown.upiSales;
    const dineIn = salesBreakdown.dineInCount;
    const takeAway = salesBreakdown.takeAwayCount;
    const completedCount = salesBreakdown.validBillCount;
    const cancelledCount = salesBreakdown.cancelledCount;
    const aov = completedCount > 0 ? Math.round(rev / completedCount) : 0;

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
      completedBillsCount: completedCount,
      cancelledBillsCount: cancelledCount,
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
  }, [salesBreakdown, runningKots, businessDate, totalMenuItems, lowStockCount]);

  // RBAC Permission checks for revenue display
  const canViewRevenue = hasPermission('reports.view') || isOwner;

  // Compute Category-Wise Sales Distribution for Recharts Doughnut Chart
  const categorySalesSummary = useMemo(() => {
    const catalogList = menuCatalog.length > 0 ? menuCatalog : DEFAULT_FALLBACK_MENU_ITEMS;
    const byCode = new Map<string, MenuItem>();
    const byId = new Map<string, MenuItem>();
    const byName = new Map<string, MenuItem>();

    catalogList.forEach((m) => {
      if (m.itemCode) byCode.set(String(m.itemCode).trim().toLowerCase(), m);
      if (m.id) byId.set(String(m.id).trim().toLowerCase(), m);
      if (m.itemName) byName.set(String(m.itemName).trim().toLowerCase(), m);
    });

    // Collect deduplicated valid line items for the selected business day
    const localItemsMap = getLocalItemsMap();
    const validBillIds = new Set(completedBills.map((b) => b.id));
    const cancelledBillIds = new Set(
      todayBills.filter((b) => b.status === 'CANCELLED').map((b) => b.id)
    );

    const collectedItems: BillItem[] = [];
    const seenKeys = new Set<string>();

    const addBillItem = (item: BillItem, fallbackBillId?: string) => {
      const bId = item.billId || fallbackBillId || 'unknown';
      if (cancelledBillIds.has(bId)) return;
      const dedupKey = item.id || `${bId}_${item.itemCode || item.itemName}_${item.quantity}_${item.totalPrice}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);
      collectedItems.push({ ...item, billId: bId });
    };

    completedBills.forEach((b) => {
      if (b.items && b.items.length > 0) {
        b.items.forEach((i) => addBillItem(i, b.id));
      } else {
        const localList = localItemsMap[b.id] || getLocalBillItems(b.id);
        if (localList && localList.length > 0) {
          localList.forEach((i) => addBillItem(i, b.id));
        }
      }
    });

    todayBillItems.forEach((i) => {
      if (!i.businessDate || i.businessDate === businessDate) {
        if (!i.billId || validBillIds.has(i.billId) || completedBills.length === 0) {
          addBillItem(i, i.billId);
        }
      }
    });

    if (categoryGrouping === 'course') {
      const buckets = new Map<
        string,
        {
          meta: CourseCategoryMeta;
          revenue: number;
          quantity: number;
          lineCount: number;
          billIds: Set<string>;
          catalogCount: number;
        }
      >();

      COURSE_CATEGORIES.forEach((meta) => {
        buckets.set(meta.id, {
          meta,
          revenue: 0,
          quantity: 0,
          lineCount: 0,
          billIds: new Set<string>(),
          catalogCount: 0
        });
      });

      catalogList.forEach((m) => {
        const cid = classifyCourseCategoryId(m.itemName || '', m.categoryName || '', m.itemCode || '');
        const b = buckets.get(cid);
        if (b) b.catalogCount += 1;
      });

      collectedItems.forEach((item) => {
        const matched =
          (item.itemCode && byCode.get(String(item.itemCode).trim().toLowerCase())) ||
          (item.itemId && byId.get(String(item.itemId).trim().toLowerCase())) ||
          (item.itemName && byName.get(String(item.itemName).trim().toLowerCase()));

        const rawCat = (item as any).categoryName || (item as any).category || matched?.categoryName || '';
        const cid = classifyCourseCategoryId(item.itemName || matched?.itemName || '', rawCat, item.itemCode || matched?.itemCode || '');
        const bucket = buckets.get(cid) || buckets.get('main_course')!;
        const qty = Math.max(0, Number(item.quantity) || 0);
        const rev = Math.max(0, Number(item.totalPrice) || (Number(item.unitPrice) || 0) * qty);

        bucket.quantity += qty;
        bucket.revenue += rev;
        bucket.lineCount += 1;
        if (item.billId && item.billId !== 'unknown') {
          bucket.billIds.add(item.billId);
        }
      });

      const totalRevenue = Array.from(buckets.values()).reduce((sum, b) => sum + b.revenue, 0);
      const totalQuantity = Array.from(buckets.values()).reduce((sum, b) => sum + b.quantity, 0);
      const totalMetric = categoryMetric === 'revenue' ? totalRevenue : totalQuantity;
      const isZeroSales = totalMetric === 0;

      const slices: CategorySalesSlice[] = Array.from(buckets.values()).map((b) => {
        const metricVal = categoryMetric === 'revenue' ? b.revenue : b.quantity;
        const pct = totalMetric > 0 ? (metricVal / totalMetric) * 100 : 0;
        const transactionCount = b.billIds.size > 0 ? b.billIds.size : b.lineCount;
        return {
          id: b.meta.id,
          name: b.meta.name,
          subtitle: b.meta.subtitle,
          revenue: b.revenue,
          quantity: b.quantity,
          lineCount: b.lineCount,
          transactionCount,
          percentage: pct,
          catalogCount: b.catalogCount,
          color: b.meta.color,
          chartValue: isZeroSales ? Math.max(b.catalogCount, 1) : metricVal,
          isZeroSalesBaseline: isZeroSales
        };
      });

      slices.sort((a, b) => {
        if (!isZeroSales) {
          const diff =
            categoryMetric === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity;
          if (diff !== 0) return diff;
        }
        return b.catalogCount - a.catalogCount;
      });

      return {
        slices,
        chartSlices: isZeroSales ? slices : slices.filter((s) => s.chartValue > 0),
        totalRevenue,
        totalQuantity,
        totalTransactions: completedBills.length,
        isZeroSales,
        topCategory: !isZeroSales && slices.length > 0 ? slices[0] : null
      };
    } else {
      // Menu Catalog Category Grouping
      const fallbackColors = ['#059669', '#d97706', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#db2777'];
      const buckets = new Map<
        string,
        {
          id: string;
          name: string;
          subtitle: string;
          color: string;
          revenue: number;
          quantity: number;
          lineCount: number;
          billIds: Set<string>;
          catalogCount: number;
        }
      >();

      Object.entries(MENU_CATEGORY_COLORS).forEach(([catName, info]) => {
        buckets.set(catName, {
          id: catName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          name: catName,
          subtitle: info.subtitle,
          color: info.color,
          revenue: 0,
          quantity: 0,
          lineCount: 0,
          billIds: new Set<string>(),
          catalogCount: 0
        });
      });

      catalogList.forEach((m) => {
        const catName = m.categoryName || 'Tiffin & Breakfast';
        let b = buckets.get(catName);
        if (!b) {
          const color = fallbackColors[buckets.size % fallbackColors.length];
          b = {
            id: catName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            name: catName,
            subtitle: 'Menu Category',
            color,
            revenue: 0,
            quantity: 0,
            lineCount: 0,
            billIds: new Set<string>(),
            catalogCount: 0
          };
          buckets.set(catName, b);
        }
        b.catalogCount += 1;
      });

      collectedItems.forEach((item) => {
        const matched =
          (item.itemCode && byCode.get(String(item.itemCode).trim().toLowerCase())) ||
          (item.itemId && byId.get(String(item.itemId).trim().toLowerCase())) ||
          (item.itemName && byName.get(String(item.itemName).trim().toLowerCase()));

        const catName = (item as any).categoryName || matched?.categoryName || 'Tiffin & Breakfast';
        let bucket = buckets.get(catName);
        if (!bucket) {
          const color = fallbackColors[buckets.size % fallbackColors.length];
          bucket = {
            id: catName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            name: catName,
            subtitle: 'Menu Category',
            color,
            revenue: 0,
            quantity: 0,
            lineCount: 0,
            billIds: new Set<string>(),
            catalogCount: 1
          };
          buckets.set(catName, bucket);
        }

        const qty = Math.max(0, Number(item.quantity) || 0);
        const rev = Math.max(0, Number(item.totalPrice) || (Number(item.unitPrice) || 0) * qty);
        bucket.quantity += qty;
        bucket.revenue += rev;
        bucket.lineCount += 1;
        if (item.billId && item.billId !== 'unknown') {
          bucket.billIds.add(item.billId);
        }
      });

      const totalRevenue = Array.from(buckets.values()).reduce((sum, b) => sum + b.revenue, 0);
      const totalQuantity = Array.from(buckets.values()).reduce((sum, b) => sum + b.quantity, 0);
      const totalMetric = categoryMetric === 'revenue' ? totalRevenue : totalQuantity;
      const isZeroSales = totalMetric === 0;

      const slices: CategorySalesSlice[] = Array.from(buckets.values()).map((b) => {
        const metricVal = categoryMetric === 'revenue' ? b.revenue : b.quantity;
        const pct = totalMetric > 0 ? (metricVal / totalMetric) * 100 : 0;
        const transactionCount = b.billIds.size > 0 ? b.billIds.size : b.lineCount;
        return {
          id: b.id,
          name: b.name,
          subtitle: b.subtitle,
          revenue: b.revenue,
          quantity: b.quantity,
          lineCount: b.lineCount,
          transactionCount,
          percentage: pct,
          catalogCount: b.catalogCount,
          color: b.color,
          chartValue: isZeroSales ? Math.max(b.catalogCount, 1) : metricVal,
          isZeroSalesBaseline: isZeroSales
        };
      });

      slices.sort((a, b) => {
        if (!isZeroSales) {
          const diff =
            categoryMetric === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity;
          if (diff !== 0) return diff;
        }
        return b.catalogCount - a.catalogCount;
      });

      return {
        slices,
        chartSlices: isZeroSales ? slices : slices.filter((s) => s.chartValue > 0),
        totalRevenue,
        totalQuantity,
        totalTransactions: completedBills.length,
        isZeroSales,
        topCategory: !isZeroSales && slices.length > 0 ? slices[0] : null
      };
    }
  }, [menuCatalog, completedBills, todayBills, todayBillItems, businessDate, categoryGrouping, categoryMetric]);

  // Compute Most Sold Items leaderboard (Top 8 dishes for the selected business day)
  const mostSoldItems = useMemo(() => {
    const localItemsMap = getLocalItemsMap();
    const validBillIds = new Set(completedBills.map((b) => b.id));
    const cancelledBillIds = new Set(
      todayBills.filter((b) => b.status === 'CANCELLED').map((b) => b.id)
    );

    const seenKeys = new Set<string>();
    const map = new Map<
      string,
      { itemName: string; itemNameTamil?: string; quantity: number; revenue: number; bills: Set<string> }
    >();

    const recordItem = (item: BillItem, fallbackBillId?: string) => {
      const bId = item.billId || fallbackBillId || 'unknown';
      if (cancelledBillIds.has(bId)) return;
      const dedupKey = item.id || `${bId}_${item.itemCode || item.itemName}_${item.quantity}_${item.totalPrice}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const nameKey = (item.itemName || '').trim().toLowerCase();
      if (!nameKey) return;

      const qty = Math.max(0, Number(item.quantity) || 1);
      const rev = Math.max(0, Number(item.totalPrice) || (Number(item.unitPrice) || 0) * qty);

      const existing = map.get(nameKey);
      if (!existing) {
        const billsSet = new Set<string>();
        if (bId !== 'unknown') billsSet.add(bId);
        map.set(nameKey, {
          itemName: item.itemName,
          itemNameTamil: item.itemNameTamil,
          quantity: qty,
          revenue: rev,
          bills: billsSet
        });
      } else {
        existing.quantity += qty;
        existing.revenue += rev;
        if (bId !== 'unknown') existing.bills.add(bId);
        if (!existing.itemNameTamil && item.itemNameTamil) {
          existing.itemNameTamil = item.itemNameTamil;
        }
      }
    };

    completedBills.forEach((b) => {
      if (b.items && b.items.length > 0) {
        b.items.forEach((i) => recordItem(i, b.id));
      } else {
        const localList = localItemsMap[b.id] || getLocalBillItems(b.id);
        if (localList && localList.length > 0) {
          localList.forEach((i) => recordItem(i, b.id));
        }
      }
    });

    todayBillItems.forEach((i) => {
      if (!i.businessDate || i.businessDate === businessDate) {
        if (!i.billId || validBillIds.has(i.billId) || completedBills.length === 0) {
          recordItem(i, i.billId);
        }
      }
    });

    return Array.from(map.values())
      .sort((a, b) => (b.quantity !== a.quantity ? b.quantity - a.quantity : b.revenue - a.revenue))
      .slice(0, 8);
  }, [completedBills, todayBills, todayBillItems, businessDate]);

  const activeRunningKotsList = useMemo(() => {
    return runningKots
      .filter((k) => k.status !== 'COMPLETED' && k.status !== 'CANCELLED' && k.status !== 'BILLED')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 6);
  }, [runningKots]);

  const highlightedCategory = useMemo(() => {
    if (!activeCategoryId) return categorySalesSummary.topCategory;
    return categorySalesSummary.slices.find((s) => s.id === activeCategoryId) || categorySalesSummary.topCategory;
  }, [activeCategoryId, categorySalesSummary]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 p-3 sm:p-6 gap-4 sm:gap-5 overflow-y-auto font-sans">
      
      {/* Enterprise Header Banner with Preserved Shop Logo & Business Day Date Picker */}
      <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl flex flex-col gap-3.5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border-2 border-[#0F172A] shadow-xs flex items-center justify-center p-1 shrink-0 overflow-hidden">
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
                <span className="text-xs font-mono font-bold bg-[#0F172A] text-white px-2.5 py-0.5 rounded-md">
                  BUSINESS DATE: {businessDate}
                </span>
                {!isViewingToday && (
                  <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
                    Historical Business Day View
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  Operator Role: <b className="text-slate-900 uppercase">{currentUser?.roleId}</b>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">
                {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
              </h2>
            </div>
          </div>

          {/* Quick Counter Launch Actions */}
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              onClick={() => onNavigate('direct-billing')}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all min-h-[42px]"
            >
              <Zap className="w-4 h-4 fill-white shrink-0" />
              <span className="truncate">Direct Billing (F2)</span>
            </button>
            <button
              onClick={() => onNavigate('pos')}
              className="px-4 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all min-h-[42px]"
            >
              <ShoppingBag className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Touch POS</span>
            </button>
          </div>
        </div>

        {/* Business Day Date Picker & Net Sales Analysis Selector Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Select Business Day:</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedBusinessDate((prev) => shiftDateYMD(prev || currentBusinessDate, -1))}
                className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                title="Previous Business Day"
                aria-label="Previous Business Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <input
                type="date"
                data-testid="dashboard-business-date-picker"
                value={businessDate}
                max={currentBusinessDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedBusinessDate(e.target.value);
                  }
                }}
                aria-label="Select Business Day"
                className="bg-white border border-slate-200 text-slate-900 font-mono font-bold text-xs px-2.5 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F172A] cursor-pointer"
              />

              <button
                type="button"
                onClick={() => {
                  const next = shiftDateYMD(businessDate, 1);
                  if (next <= currentBusinessDate) {
                    setSelectedBusinessDate(next);
                  }
                }}
                disabled={businessDate >= currentBusinessDate}
                className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Next Business Day"
                aria-label="Next Business Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Day Presets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedBusinessDate(currentBusinessDate)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  isViewingToday
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Today ({currentBusinessDate})
              </button>
              <button
                type="button"
                onClick={() => setSelectedBusinessDate(yesterdayBusinessDate)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  businessDate === yesterdayBusinessDate
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Yesterday
              </button>
              {!isViewingToday && (
                <button
                  type="button"
                  onClick={() => setSelectedBusinessDate(currentBusinessDate)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Live Today</span>
                </button>
              )}
            </div>
          </div>

          {canViewRevenue && (
            <div className="flex flex-wrap items-center gap-2 text-xs bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <span className="font-semibold text-emerald-900">Net Sales ({businessDate}):</span>
              <span className="font-mono font-extrabold text-emerald-700 text-sm tabular-nums">
                ₹{todayRevenue.toLocaleString('en-IN')}
              </span>
              <span className="text-slate-400">•</span>
              <span className="font-mono text-slate-700 font-semibold tabular-nums">
                {completedBills.length} valid bills
              </span>
              {salesBreakdown.cancelledCount > 0 && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="font-mono text-red-600 font-semibold tabular-nums">
                    {salesBreakdown.cancelledCount} cancelled
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Daily Sales Overview Section (Total Sales, Bills Generated, Items Sold, Dine-In Sales, AC Sales, Takeaway Sales) */}
      <DailySnapshot
        businessDate={businessDate}
        bills={todayBills}
        billItems={todayBillItems}
        canViewRevenue={canViewRevenue}
        onNavigate={onNavigate}
        settings={settings}
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

      {/* Category Sales Distribution Doughnut Chart Card (Recharts PieChart) */}
      <section
        id="category-sales-distribution-section"
        data-testid="category-sales-doughnut-card"
        aria-labelledby="category-sales-heading"
        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
      >
        {/* Header & Interactive Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#0F172A] text-emerald-400 shrink-0">
              <PieChartIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="category-sales-heading" className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Sales Distribution by Category
                </h3>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  ({businessDate})
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                Revenue and transaction breakdown across Starters, Main Course, Tiffin &amp; Dosai, Beverages, and Desserts
              </p>
            </div>
          </div>

          {/* Grouping & Metric Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setCategoryGrouping('course');
                  setActiveCategoryId(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  categoryGrouping === 'course'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Utensils className="w-3.5 h-3.5 text-emerald-400" />
                <span>Course View</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoryGrouping('menu');
                  setActiveCategoryId(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  categoryGrouping === 'menu'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Menu Categories</span>
              </button>
            </div>

            {canViewRevenue && (
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setCategoryMetric('revenue')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    categoryMetric === 'revenue'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By Revenue (₹)
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryMetric('quantity')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    categoryMetric === 'quantity'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By Quantity
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content: Left Doughnut Chart + Right Category Breakdown Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Doughnut Chart Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-50/70 border border-slate-100 rounded-2xl p-4 relative min-h-[300px]">
            <div className="w-full h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorySalesSummary.chartSlices}
                    dataKey="chartValue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="86%"
                    paddingAngle={3}
                    stroke="#ffffff"
                    strokeWidth={2}
                    onMouseEnter={(_, index) => {
                      const slice = categorySalesSummary.chartSlices[index];
                      if (slice) setActiveCategoryId(slice.id);
                    }}
                    onMouseLeave={() => setActiveCategoryId(null)}
                  >
                    {categorySalesSummary.chartSlices.map((entry) => {
                      const isHovered = activeCategoryId === entry.id;
                      const isDimmed = activeCategoryId !== null && !isHovered;
                      return (
                        <Cell
                          key={`cell-${entry.id}`}
                          fill={entry.color}
                          fillOpacity={isDimmed ? 0.35 : entry.isZeroSalesBaseline ? 0.45 : 1}
                          stroke={isHovered ? '#0f172a' : '#ffffff'}
                          strokeWidth={isHovered ? 2.5 : 2}
                          className="transition-opacity duration-200 cursor-pointer outline-none"
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    content={<CategoryDoughnutTooltip canViewRevenue={canViewRevenue} />}
                    wrapperStyle={{ zIndex: 30, pointerEvents: 'none' }}
                    isAnimationActive={false}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Doughnut KPI Overlay */}
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none text-center px-6">
                {highlightedCategory ? (
                  <>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[140px]">
                      {highlightedCategory.name}
                    </span>
                    <span className="text-lg sm:text-xl font-black font-mono text-slate-900 tabular-nums mt-0.5">
                      {canViewRevenue && categoryMetric === 'revenue'
                        ? `₹${highlightedCategory.revenue.toLocaleString('en-IN')}`
                        : `${highlightedCategory.quantity.toLocaleString('en-IN')} qty`}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-emerald-600 tabular-nums">
                      {highlightedCategory.transactionCount.toLocaleString('en-IN')}{' '}
                      {highlightedCategory.transactionCount === 1 ? 'bill' : 'bills'} • {highlightedCategory.percentage.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {canViewRevenue && categoryMetric === 'revenue' ? 'Total Net Sales' : 'Total Items Sold'}
                    </span>
                    <span className="text-lg sm:text-xl font-black font-mono text-slate-900 tabular-nums mt-0.5">
                      {canViewRevenue && categoryMetric === 'revenue'
                        ? `₹${categorySalesSummary.totalRevenue.toLocaleString('en-IN')}`
                        : `${categorySalesSummary.totalQuantity.toLocaleString('en-IN')} qty`}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                      {categorySalesSummary.totalTransactions.toLocaleString('en-IN')} transactions • {categorySalesSummary.slices.length} categories
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Interactive Hover Status Pill */}
            {activeCategoryId && highlightedCategory && (
              <div
                data-testid="hovered-category-summary"
                className="mt-2 w-full bg-[#0F172A] text-white px-3 py-2 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: highlightedCategory.color }}
                  />
                  <span className="font-bold truncate">{highlightedCategory.name}</span>
                </div>
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  {canViewRevenue && (
                    <span className="font-black text-emerald-400">
                      ₹{highlightedCategory.revenue.toLocaleString('en-IN')}
                    </span>
                  )}
                  <span className="text-emerald-300 font-bold">
                    {highlightedCategory.transactionCount.toLocaleString('en-IN')}{' '}
                    {highlightedCategory.transactionCount === 1 ? 'transaction' : 'transactions'}
                  </span>
                  <span className="text-slate-300">
                    ({highlightedCategory.quantity.toLocaleString('en-IN')} qty)
                  </span>
                </div>
              </div>
            )}

            {categorySalesSummary.isZeroSales && (
              <p className="text-xs text-slate-500 text-center mt-1">
                No completed bill items for <span className="font-mono font-semibold text-slate-700">{businessDate}</span> yet — ring shows menu catalog baseline across categories.
              </p>
            )}
          </div>

          {/* Category Breakdown List Column (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-2.5">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="pb-2 pr-2">Category</th>
                    <th className="pb-2 px-2 text-right">Transactions</th>
                    <th className="pb-2 px-2 text-right">Qty Sold</th>
                    {canViewRevenue && <th className="pb-2 px-2 text-right">Revenue</th>}
                    <th className="pb-2 pl-2 text-right w-28">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {categorySalesSummary.slices.map((slice) => {
                    const isHovered = activeCategoryId === slice.id;
                    return (
                      <tr
                        key={slice.id}
                        data-testid={`category-row-${slice.id}`}
                        onMouseEnter={() => setActiveCategoryId(slice.id)}
                        onMouseLeave={() => setActiveCategoryId(null)}
                        className={`transition-colors cursor-pointer ${
                          isHovered ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3 h-3 rounded-sm shrink-0"
                              style={{ backgroundColor: slice.color }}
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 truncate">{slice.name}</div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[220px] sm:max-w-[280px]">
                                {slice.subtitle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          {slice.transactionCount.toLocaleString('en-IN')}{' '}
                          <span className="text-[11px] font-normal text-slate-400">
                            {slice.transactionCount === 1 ? 'bill' : 'bills'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                          {slice.quantity.toLocaleString('en-IN')}
                        </td>
                        {canViewRevenue && (
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            ₹{slice.revenue.toLocaleString('en-IN')}
                          </td>
                        )}
                        <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono font-bold text-slate-700 text-xs tabular-nums">
                              {slice.percentage.toFixed(1)}%
                            </span>
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(slice.percentage, slice.isZeroSalesBaseline ? 15 : 0))}%`,
                                  backgroundColor: slice.color,
                                  opacity: slice.isZeroSalesBaseline ? 0.35 : 1
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-mono text-xs sm:text-sm font-extrabold text-slate-900">
                    <td className="py-2.5 pl-2 pr-2 font-sans">Total ({categorySalesSummary.slices.length} Categories)</td>
                    <td className="py-2.5 px-2 text-right text-slate-900 tabular-nums whitespace-nowrap">
                      {categorySalesSummary.totalTransactions.toLocaleString('en-IN')} bills
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {categorySalesSummary.totalQuantity.toLocaleString('en-IN')}
                    </td>
                    {canViewRevenue && (
                      <td className="py-2.5 px-2 text-right text-emerald-700 tabular-nums">
                        ₹{categorySalesSummary.totalRevenue.toLocaleString('en-IN')}
                      </td>
                    )}
                    <td className="py-2.5 pl-2 pr-2 text-right tabular-nums">
                      {categorySalesSummary.isZeroSales ? '0.0%' : '100.0%'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Operational Grid: Recent Billing Transactions, Most Sold Items & Running KOT Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
        
        {/* Left Column: Recent Billing Transactions (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-4 py-3.5 bg-[#0F172A] text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span className="font-extrabold text-sm sm:text-base tracking-tight">
                {isViewingToday ? 'Recent Billing Transactions' : `Billing Transactions (${businessDate})`}
              </span>
            </div>
            <button
              onClick={() => onNavigate('reprint')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer flex items-center gap-1"
            >
              <span>View All Bills</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
            {todayBills.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                <Clock className="w-9 h-9 text-slate-300 mb-2" />
                <p className="text-base font-bold text-slate-700">
                  {isViewingToday ? 'No bills generated yet today' : `No bills recorded on ${businessDate}`}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Start with Direct Billing or Touch POS to process orders.</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm text-left font-mono border-collapse">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-sans">
                      <th className="pb-2.5 pl-2 pr-2 whitespace-nowrap">Bill #</th>
                      <th className="pb-2.5 px-2 whitespace-nowrap">Time</th>
                      <th className="pb-2.5 px-2 whitespace-nowrap">Service / Hall</th>
                      <th className="pb-2.5 px-2 text-right whitespace-nowrap">Amount</th>
                      <th className="pb-2.5 pl-2 text-center whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todayBills.slice(0, 8).map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 pl-2 pr-2 font-extrabold text-[#0F172A] whitespace-nowrap">
                          #{b.billNumber}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600 font-sans text-xs whitespace-nowrap">
                          {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-2 text-slate-700 font-sans text-xs font-semibold whitespace-nowrap">
                          <span>{b.orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'}</span>
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            b.priceType === 'AC'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {b.priceType}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                          ₹{b.grandTotal.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 pl-2 text-center whitespace-nowrap font-sans">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                            b.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Most Sold Items & Running KOT Orders (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Most Sold Items Leaderboard */}
          <div
            data-testid="dashboard-most-sold-items-card"
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col"
          >
            <div className="px-4 py-3 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-sm tracking-tight">Most Sold Items ({businessDate})</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Item Report →
              </button>
            </div>

            <div className="p-3 sm:p-4">
              {mostSoldItems.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No dish sales recorded for {businessDate} yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                        <th className="pb-2 pr-2">#</th>
                        <th className="pb-2 px-2">Item Name</th>
                        <th className="pb-2 px-2 text-right">Qty Sold</th>
                        {canViewRevenue && <th className="pb-2 pl-2 text-right">Total</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {mostSoldItems.map((item, idx) => (
                        <tr key={item.itemName} className="hover:bg-slate-50">
                          <td className="py-2 pr-2 font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-2 font-sans font-bold text-slate-800 truncate max-w-[180px]">
                            {item.itemName}
                          </td>
                          <td className="py-2 px-2 text-right font-extrabold text-emerald-700 tabular-nums">
                            {item.quantity}
                          </td>
                          {canViewRevenue && (
                            <td className="py-2 pl-2 text-right font-bold text-slate-900 tabular-nums">
                              ₹{item.revenue.toLocaleString('en-IN')}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Running KOT Orders Live Feed */}
          <div
            data-testid="dashboard-running-kots-panel"
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col"
          >
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-[#0F172A]" />
                <h3 className="font-extrabold text-sm text-slate-900">Running KOT Orders</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] font-bold">
                  {activeRunningKotsList.length} Active
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('running-kot')}
                className="text-xs font-bold text-[#0F172A] hover:text-emerald-700 cursor-pointer"
              >
                Manage KOTs →
              </button>
            </div>

            <div className="p-3 sm:p-4 space-y-2">
              {activeRunningKotsList.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  All kitchen tickets completed. Click <b>Manage KOTs</b> to create a new order.
                </div>
              ) : (
                activeRunningKotsList.map((kot) => (
                  <div
                    key={kot.id}
                    onClick={() => onNavigate('running-kot')}
                    className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-xs text-[#0F172A]">
                          KOT #{kot.kotNumber}
                        </span>
                        {kot.tableNumber && (
                          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                            Table {kot.tableNumber}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono">
                          {kot.priceType}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                      kot.status === 'READY'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      {kot.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
