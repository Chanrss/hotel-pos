import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Clock, 
  LogOut, 
  LogIn, 
  UtensilsCrossed, 
  Menu as MenuIcon,
  Receipt,
  Printer,
  Maximize2,
  Minimize2,
  LayoutDashboard,
  ShoppingBag,
  Zap,
  ChefHat,
  Flame,
  Utensils,
  Boxes,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Cloud,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';
import { getBusinessDate, formatBillNumber } from '../../services/billNumberEngine';
import { getLocalBills } from '../../services/localBillStore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { PrinterStatusService, PrinterHealthCheck } from '../../services/printerStatusService';
import { PrinterTroubleshootModal } from './PrinterTroubleshootModal';
import { NavTab } from './Sidebar';

export interface HeaderProps {
  settings?: RestaurantSettings;
  activeTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  onOpenAuth: () => void;
  onToggleSidebar?: () => void;
  onNavigateSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  settings, 
  activeTab, 
  onSelectTab, 
  onOpenAuth, 
  onToggleSidebar, 
  onNavigateSettings 
}) => {
  const { currentUser, isOnline: authOnline, logout, firebaseUser, hasPermission, isOwner, isManager, isWaiter } = useAuth();
  const [networkOnline, setNetworkOnline] = useState<boolean>(navigator.onLine);
  const [firestoreServerSynced, setFirestoreServerSynced] = useState<boolean>(false);
  const [time, setTime] = useState(new Date());
  const [currentBillNo, setCurrentBillNo] = useState<string>('01');
  const [printerCheck, setPrinterCheck] = useState<PrinterHealthCheck | null>(null);
  const [showPrinterModal, setShowPrinterModal] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Track Fullscreen State
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch (err) {
      console.warn('Fullscreen request notice:', err);
    }
  };

  // Subscribe to live printer status
  useEffect(() => {
    const unsub = PrinterStatusService.subscribe((check) => {
      setPrinterCheck(check);
    });
    return unsub;
  }, [settings]);

  // Real-time connectivity listener + Firestore sync status
  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => {
      setNetworkOnline(false);
      setFirestoreServerSynced(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let unsubscribe: (() => void) | null = null;
    try {
      const docRef = doc(db, 'settings', 'restaurant');
      unsubscribe = onSnapshot(
        docRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          const isFromCache = snapshot.metadata.fromCache;
          setFirestoreServerSynced(!isFromCache);
          if (navigator.onLine) {
            setNetworkOnline(true);
          }
        },
        () => {
          setFirestoreServerSynced(false);
          if (!navigator.onLine) {
            setNetworkOnline(false);
          }
        }
      );
    } catch (err) {
      console.debug('Firestore connectivity listener note:', err);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const isCurrentlyOnline = networkOnline && authOnline !== false;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCurrentBillNo = (): string => {
    try {
      const businessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');
      const localBillKey = `pos_last_bill_${businessDate}`;
      const storedCounter = localStorage.getItem(localBillKey);
      if (storedCounter && parseInt(storedCounter, 10) > 0) {
        return formatBillNumber(parseInt(storedCounter, 10));
      }

      const lastPrintedRaw = localStorage.getItem('pos_last_printed_bill');
      if (lastPrintedRaw) {
        const parsed = JSON.parse(lastPrintedRaw);
        if (parsed?.bill?.billNumber) {
          return parsed.bill.billNumber;
        }
      }

      const localBills = getLocalBills();
      if (localBills.length > 0 && localBills[0].billNumber) {
        return localBills[0].billNumber;
      }
    } catch (err) {
      console.debug('Error getting current bill number:', err);
    }
    return '01';
  };

  useEffect(() => {
    const updateBill = () => {
      setCurrentBillNo(fetchCurrentBillNo());
    };
    updateBill();

    window.addEventListener('pos_bills_updated', updateBill);
    window.addEventListener('pos-bill-printing', updateBill);
    window.addEventListener('storage', updateBill);
    const interval = setInterval(updateBill, 3000);

    return () => {
      window.removeEventListener('pos_bills_updated', updateBill);
      window.removeEventListener('pos-bill-printing', updateBill);
      window.removeEventListener('storage', updateBill);
      clearInterval(interval);
    };
  }, [settings?.businessDayStartHour]);

  const dateString = time.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  });

  const timeString = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const navScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkNavScroll = () => {
    if (navScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = navScrollRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
    }
  };

  useEffect(() => {
    checkNavScroll();
    window.addEventListener('resize', checkNavScroll);
    return () => window.removeEventListener('resize', checkNavScroll);
  }, []);

  useEffect(() => {
    if (navScrollRef.current && activeTab) {
      const activeEl = navScrollRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeTab}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      }
      setTimeout(checkNavScroll, 250);
    }
  }, [activeTab]);

  const scrollNav = (direction: 'left' | 'right') => {
    if (navScrollRef.current) {
      const offset = direction === 'left' ? -200 : 200;
      navScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkNavScroll, 200);
    }
  };

  // RBAC-filtered Navigation Options (Full access controlled by Admin account)
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: isOwner || hasPermission('dashboard.view')
    },
    {
      id: 'pos' as NavTab,
      label: 'POS Billing',
      icon: ShoppingBag,
      show: isOwner || hasPermission('pos.view') || hasPermission('billing.create')
    },
    {
      id: 'direct-billing' as NavTab,
      label: 'Direct Billing',
      icon: Zap,
      show: isOwner || hasPermission('direct-billing.view') || hasPermission('billing.create')
    },
    {
      id: 'kot' as NavTab,
      label: 'KOT',
      icon: ChefHat,
      show: isOwner || hasPermission('kot.view') || hasPermission('kot.create')
    },
    {
      id: 'running-kot' as NavTab,
      label: 'Running KOTs',
      icon: Flame,
      show: isOwner || hasPermission('kot.view') || hasPermission('kot.edit')
    },
    {
      id: 'reprint' as NavTab,
      label: 'Orders',
      icon: Receipt,
      show: isOwner || hasPermission('billing.reprint') || hasPermission('billing.print')
    },
    {
      id: 'menu' as NavTab,
      label: 'Menu',
      icon: Utensils,
      show: isOwner || hasPermission('menu.view')
    },
    {
      id: 'inventory' as NavTab,
      label: 'Inventory',
      icon: Boxes,
      show: isOwner || hasPermission('inventory.view')
    },
    {
      id: 'reports' as NavTab,
      label: 'Reports',
      icon: BarChart3,
      show: isOwner || hasPermission('reports.view')
    },
    {
      id: 'users' as NavTab,
      label: 'Admin',
      icon: Users,
      show: isOwner
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: Settings,
      show: isOwner || hasPermission('settings.manage')
    }
  ];

  const roleLabel = (currentUser?.roleId || 'STAFF').toUpperCase();
  const printerReady = printerCheck?.status === 'READY' || printerCheck?.status === 'MOCK';

  return (
    <header className="sticky top-0 z-40 w-full flex flex-col shrink-0 select-none bg-slate-950 text-slate-100 border-b border-slate-800">
      {/* Compact Top Terminal Status Bar (h-10 / 40px) */}
      <div className="h-10 px-2.5 sm:px-3 flex items-center justify-between gap-2 w-full bg-slate-950 border-b border-slate-800/90">
        
        {/* Left: Hamburger Toggle + Compact Logo + Restaurant Name */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-400 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Open Navigation Drawer [☰]"
            >
              <MenuIcon className="w-4 h-4 text-amber-400" />
              <span className="text-2xs font-bold uppercase tracking-wider hidden sm:inline">Menu</span>
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            {(settings?.logoUrl || DEFAULT_RESTAURANT_LOGO) ? (
              <div className="w-6 h-6 rounded bg-white border border-amber-500/80 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                <img
                  src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO}
                  alt={settings?.restaurantName || 'POS'}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
                  }}
                />
              </div>
            ) : (
              <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center text-slate-950 shrink-0">
                <UtensilsCrossed className="w-3.5 h-3.5" />
              </div>
            )}

            <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white uppercase truncate max-w-[140px] sm:max-w-[240px] md:max-w-none">
              {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
            </span>
          </div>
        </div>

        {/* Center/Right: Terminal Telemetry Badges (Bill #, Date/Time, Online, Sync, Printer, User/Role) */}
        <div className="flex items-center justify-end gap-1.5 shrink-0">
          
          {/* Current Bill Sequence */}
          <div
            id="header-current-bill-no"
            className="h-6 px-2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center gap-1 font-mono text-xs font-bold shrink-0"
            title={`Active Bill Counter: #${currentBillNo}`}
          >
            <Receipt className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="hidden xs:inline text-2xs text-amber-400/90">BILL</span>
            <span className="font-black text-amber-200">#{currentBillNo}</span>
          </div>

          {/* Date & Time */}
          <div className="hidden lg:flex items-center gap-1 h-6 px-2 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-2xs shrink-0">
            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{dateString}</span>
            <span className="text-slate-600">•</span>
            <span className="text-white font-semibold">{timeString}</span>
          </div>

          {/* Online / Offline & Sync Status */}
          <div
            id="header-connectivity-status"
            className={`h-6 px-2 rounded border flex items-center gap-1 text-2xs font-mono font-bold shrink-0 ${
              isCurrentlyOnline
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                : 'bg-red-950/80 text-red-300 border-red-700/60'
            }`}
            title={
              isCurrentlyOnline
                ? `Online • ${firestoreServerSynced ? 'Cloud Synced' : 'Local Cache Ready'}`
                : 'Offline Mode • Saving Locally'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isCurrentlyOnline ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'
              }`}
            />
            {isCurrentlyOnline ? (
              <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-400 shrink-0" />
            )}
            <span className="hidden sm:inline">{isCurrentlyOnline ? 'ONLINE' : 'OFFLINE'}</span>
            <span className="hidden xl:inline text-slate-500">|</span>
            <Cloud className="w-3 h-3 hidden xl:inline text-slate-400" />
            <span className="hidden xl:inline text-2xs">
              {firestoreServerSynced ? 'SYNCED' : 'LOCAL'}
            </span>
          </div>

          {/* Printer Status Button */}
          <button
            id="header-printer-status-btn"
            type="button"
            onClick={() => setShowPrinterModal(true)}
            className={`h-6 px-2 rounded border flex items-center gap-1 text-2xs font-mono font-bold cursor-pointer transition-colors shrink-0 ${
              printerReady
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                : 'bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 border-amber-700/60'
            }`}
            title="Thermal Printer Status & Diagnostics"
          >
            <Printer className={`w-3 h-3 shrink-0 ${printerReady ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="hidden md:inline">
              {printerCheck?.status === 'MOCK' ? 'PRINTER: SIM' : printerReady ? 'PRINTER: OK' : 'PRINTER'}
            </span>
          </button>

          {/* Current User & Role Badge (Click to Switch User with Username & PIN) */}
          {currentUser && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="hidden sm:flex items-center gap-1.5 h-6 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-2xs shrink-0 cursor-pointer transition-colors"
              title={`Logged in as ${currentUser.name || currentUser.username} (${roleLabel}) — Click to switch user`}
            >
              <UserCheck className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="font-semibold text-slate-200 truncate max-w-[90px]">
                {currentUser.name?.split(' ')[0] || 'Staff'}
              </span>
              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px]">
                {roleLabel}
              </span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="h-6 w-6 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center cursor-pointer shrink-0"
            title={isFullscreen ? 'Exit Full Screen' : 'Full Screen POS'}
            aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen POS'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Auth Action */}
          <button
            type="button"
            onClick={onOpenAuth}
            className="h-6 px-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-2xs flex items-center gap-1 cursor-pointer shrink-0"
            title="Staff Login (Username & PIN)"
          >
            <LogIn className="w-3 h-3" />
            <span className="hidden xs:inline">Login</span>
          </button>

          {currentUser && (
            <button
              type="button"
              onClick={logout}
              className="h-6 px-1.5 rounded bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-300 border border-slate-800 flex items-center justify-center cursor-pointer shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Compact Row 2: Main Navigation Bar (h-8 / 32px) */}
      <div className="relative w-full h-8 bg-slate-900 flex items-center select-none shrink-0">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollNav('left')}
            className="absolute left-0 top-0 bottom-0 z-10 px-1.5 bg-slate-950/90 text-amber-400 hover:text-amber-300 flex items-center justify-center cursor-pointer"
            title="Scroll left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <nav
          ref={navScrollRef}
          onScroll={checkNavScroll}
          aria-label="Main POS Navigation"
          className="w-full flex items-center gap-1 px-2 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {navItems.map((item) => {
            if (!item.show) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                data-tab-id={item.id}
                type="button"
                onClick={() => onSelectTab && onSelectTab(item.id)}
                className={`h-6 px-2.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollNav('right')}
            className="absolute right-0 top-0 bottom-0 z-10 px-1.5 bg-slate-950/90 text-amber-400 hover:text-amber-300 flex items-center justify-center cursor-pointer"
            title="Scroll right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <PrinterTroubleshootModal
        isOpen={showPrinterModal}
        onClose={() => setShowPrinterModal(false)}
        settings={settings}
        onNavigateSettings={onNavigateSettings}
      />
    </header>
  );
};
