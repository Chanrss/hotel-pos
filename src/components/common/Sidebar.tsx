import React, { useEffect } from 'react';
import { 
  LayoutDashboard, 
  Zap, 
  ShoppingBag, 
  ChefHat, 
  Receipt, 
  Utensils, 
  Boxes, 
  BarChart3, 
  Users, 
  Settings,
  Flame,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';

export type NavTab = 
  | 'dashboard' 
  | 'pos' 
  | 'direct-billing' 
  | 'kot' 
  | 'running-kot'
  | 'reprint' 
  | 'menu' 
  | 'inventory' 
  | 'reports' 
  | 'users' 
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpenMobile?: boolean;
  isOpen?: boolean;
  onCloseMobile?: () => void;
  onClose?: () => void;
  settings?: RestaurantSettings;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onSelectTab, 
  isOpenMobile, 
  isOpen,
  onCloseMobile,
  onClose,
  settings
}) => {
  const { hasPermission, isOwner, isManager, currentUser } = useAuth();
  const drawerOpen = isOpen ?? isOpenMobile ?? false;
  const handleClose = onClose ?? onCloseMobile ?? (() => {});

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen, handleClose]);

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
      badge: 'Full',
      icon: ShoppingBag,
      show: isOwner || hasPermission('pos.view') || hasPermission('billing.create')
    },
    {
      id: 'direct-billing' as NavTab,
      label: 'Direct Billing',
      badge: 'Fast',
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
      badge: 'Live',
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

  const visibleItems = navItems.filter((item) => item.show);

  const handleSelect = (id: NavTab) => {
    onSelectTab(id);
    handleClose();
  };

  return (
    <>
      {/* Backdrop overlay when Drawer is open (Never permanently consumes workspace width) */}
      {drawerOpen && (
        <div 
          onClick={handleClose}
          className="fixed inset-0 bg-slate-950/60 z-50 transition-opacity duration-150"
          aria-hidden="true"
        />
      )}

      {/* Overlay Navigation Drawer */}
      <aside 
        aria-label="Global Navigation Drawer"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shadow-2xl transition-transform duration-150 ease-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Compact Drawer Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded bg-white border border-amber-500 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
              <img 
                src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO} 
                alt={settings?.restaurantName || 'POS'} 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
                }}
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-xs uppercase tracking-wide text-white truncate">
                {settings?.restaurantName || 'SRI SARAVANA BHAVAN'}
              </h2>
              <p className="text-[10px] text-amber-400 font-mono truncate">
                POS Terminal Navigation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Close [Esc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Role Status */}
        {currentUser && (
          <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-2xs">
            <span className="text-slate-400">Operator:</span>
            <span className="font-bold text-slate-200 truncate max-w-[150px]">
              {currentUser.name || currentUser.email} ({currentUser.roleId.toUpperCase()})
            </span>
          </div>
        )}

        {/* Navigation List */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950 stroke-[2.5]' : 'text-amber-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-amber-300 border border-slate-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Drawer Footer */}
        <div className="px-3 py-2 border-t border-slate-800 bg-slate-950 text-[10px] text-slate-500 font-mono text-center">
          <span>RESTAURANT POS TERMINAL</span>
        </div>
      </aside>
    </>
  );
};
