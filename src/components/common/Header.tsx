import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  LogOut, 
  LogIn, 
  UtensilsCrossed, 
  Menu as MenuIcon,
  Receipt,
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
  Radio,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';
import { getBusinessDate, formatBillNumber } from '../../services/billNumberEngine';
import { getLocalBills } from '../../services/localBillStore';
import { RemotePrintQueueService } from '../../services/remotePrintQueueService';
import { getSavedPosTheme, applyPosTheme } from '../../services/posThemeService';
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
  const { currentUser, logout, hasPermission, isOwner, isManager } = useAuth();
  const [time, setTime] = useState(new Date());
  const [currentBillNo, setCurrentBillNo] = useState<string>('01');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPrintServer, setIsPrintServer] = useState(() => RemotePrintQueueService.isPrimaryPrintServer());

  useEffect(() => {
    applyPosTheme(getSavedPosTheme());
  }, []);

  // Track Remote Print Server role
  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      const custom = e as CustomEvent<{ isPrimary: boolean }>;
      if (custom.detail) {
        setIsPrintServer(custom.detail.isPrimary);
      }
    };
    window.addEventListener('pos_print_server_role_changed', handleRoleChanged);
    return () => window.removeEventListener('pos_print_server_role_changed', handleRoleChanged);
  }, []);

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

  // RBAC-filtered Navigation Options
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: isOwner || hasPermission('dashboard.view')
    },
    {
      id: 'direct-billing' as NavTab,
      label: 'Direct Billing',
      icon: Zap,
      show: isOwner || hasPermission('direct-billing.view') || hasPermission('billing.create')
    },
    {
      id: 'pos' as NavTab,
      label: 'Touch POS',
      icon: ShoppingBag,
      show: isOwner || hasPermission('pos.view') || hasPermission('billing.create')
    },
    {
      id: 'kot' as NavTab,
      label: 'New KOT',
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
      label: 'Bills & Reprint',
      icon: Receipt,
      show: isOwner || hasPermission('billing.reprint') || hasPermission('billing.print')
    },
    {
      id: 'menu' as NavTab,
      label: 'Menu Catalog',
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
      label: 'Reports & Backup',
      icon: BarChart3,
      show: isOwner || hasPermission('reports.view')
    },
    {
      id: 'users' as NavTab,
      label: 'Staff & Roles',
      icon: Users,
      show: isOwner
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: Settings,
      show: isOwner
    }
  ];

  return (
    <header className="sticky top-0 z-40 w-full flex flex-col shrink-0 select-none bg-[#0F172A] text-white border-b border-slate-800 shadow-xs">
      {/* Row 1: Enterprise Navy Status & Operator Bar */}
      <div className="h-11 px-3 flex items-center justify-between gap-2 w-full bg-[#0F172A] border-b border-slate-800/80">
        
        {/* Left: Sidebar Toggle + Preserved Restaurant Logo + Brand Name */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="h-8 px-2.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-100 hover:text-emerald-400 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Open Navigation Sidebar [☰]"
            >
              <MenuIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-2xs font-bold uppercase tracking-wider hidden sm:inline">Menu</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            {(settings?.logoUrl || DEFAULT_RESTAURANT_LOGO) ? (
              <div className="w-7 h-7 rounded-lg bg-white border border-emerald-500/80 flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-2xs">
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
              <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
            )}

            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white uppercase truncate block max-w-[150px] sm:max-w-[260px] md:max-w-none">
                {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Active Bill Counter, Clock, Print Server Mode, Operator Role & Lock/Logout */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
          
          {/* Current Bill Sequence */}
          <div
            id="header-current-bill-no"
            className="h-7 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 font-mono text-xs font-bold shrink-0"
            title={`Active Bill Counter: #${currentBillNo}`}
          >
            <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden xs:inline text-2xs text-emerald-300/90 uppercase">Bill</span>
            <span className="font-extrabold text-white">#{currentBillNo}</span>
          </div>

          {/* Date & Time */}
          <div className="hidden lg:flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono text-2xs shrink-0">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{dateString}</span>
            <span className="text-slate-600">•</span>
            <span className="text-white font-semibold">{timeString}</span>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/15 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            title={isFullscreen ? 'Exit Full Screen' : 'Full Screen POS'}
            aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen POS'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Print Server Mode Indicator & Quick Role Switcher */}
          <button
            type="button"
            onClick={() => {
              const next = !isPrintServer;
              setIsPrintServer(next);
              RemotePrintQueueService.setPrimaryPrintServer(next);
            }}
            className={`h-7 px-2.5 rounded-lg font-bold text-2xs flex items-center gap-1.5 cursor-pointer shrink-0 border transition-all ${
              isPrintServer
                ? 'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-500/60 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title={
              isPrintServer
                ? 'KOT Queue Server: ACTIVE (Listening for waiter orders via cloud). Click to toggle.'
                : 'Waiter Client Mode (Orders routed to Counter). Click to switch to Print Server.'
            }
          >
            <Radio className={`w-3.5 h-3.5 ${isPrintServer ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">{isPrintServer ? 'Print Server ON' : 'Waiter Mode'}</span>
            <span className="sm:hidden">{isPrintServer ? 'Server' : 'Waiter'}</span>
          </button>

          {/* Active Operator Role Badge */}
          {currentUser && (
            <div
              data-testid="header-active-user-badge"
              className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-2xs font-bold shrink-0"
              title={`Logged in as ${currentUser.name} (@${currentUser.username})`}
            >
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                  isOwner
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : isManager
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-700 text-slate-200 border border-slate-600'
                }`}
              >
                {isOwner ? 'OWNER' : isManager ? 'MANAGER' : 'STAFF'}
              </span>
              <span className="text-slate-100 truncate max-w-[90px]">{currentUser.name}</span>
            </div>
          )}

          {/* Switch User Action */}
          <button
            type="button"
            onClick={onOpenAuth}
            className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-2xs flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
            title="Switch Staff Operator (Username & PIN)"
          >
            <LogIn className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Switch</span>
          </button>

          {/* Lock / Logout Action */}
          {currentUser && (
            <button
              type="button"
              onClick={logout}
              data-testid="header-logout-btn"
              className="h-7 px-2.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-100 hover:text-white border border-red-800/80 flex items-center gap-1 font-bold text-2xs justify-center cursor-pointer shrink-0 transition-colors"
              title="Lock Terminal & Sign Out"
              aria-label="Sign Out"
            >
              <Lock className="w-3.5 h-3.5 hidden sm:inline" />
              <LogOut className="w-3.5 h-3.5 sm:hidden" />
              <span className="hidden md:inline">Logout</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Quick Horizontal Module Bar */}
      <div className="relative w-full h-9 bg-[#1E293B] flex items-center select-none shrink-0 border-t border-slate-800/60">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollNav('left')}
            className="absolute left-0 top-0 bottom-0 z-10 px-2 bg-[#0F172A]/95 text-emerald-400 hover:text-emerald-300 flex items-center justify-center cursor-pointer"
            title="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        <nav
          ref={navScrollRef}
          onScroll={checkNavScroll}
          aria-label="Main POS Navigation"
          className="w-full flex items-center gap-1 px-2.5 overflow-x-auto no-scrollbar scroll-smooth"
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
                className={`h-7 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-emerald-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollNav('right')}
            className="absolute right-0 top-0 bottom-0 z-10 px-2 bg-[#0F172A]/95 text-emerald-400 hover:text-emerald-300 flex items-center justify-center cursor-pointer"
            title="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
