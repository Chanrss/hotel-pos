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
  Flame,
  Settings,
  Lock,
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
  | 'receipt-settings'
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
  const { hasPermission, isOwner, currentUser, logout } = useAuth();
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

  const navGroups = [
    {
      group: 'Billing & Counter',
      items: [
        {
          id: 'dashboard' as NavTab,
          label: 'Dashboard Overview',
          icon: LayoutDashboard,
          show: isOwner || hasPermission('dashboard.view')
        },
        {
          id: 'direct-billing' as NavTab,
          label: 'Direct Counter Billing',
          badge: 'Fast',
          icon: Zap,
          show: isOwner || hasPermission('direct-billing.view') || hasPermission('billing.create')
        },
        {
          id: 'pos' as NavTab,
          label: 'Touch POS Billing',
          badge: 'Grid',
          icon: ShoppingBag,
          show: isOwner || hasPermission('pos.view') || hasPermission('billing.create')
        },
        {
          id: 'reprint' as NavTab,
          label: 'Bill History & Reprint',
          icon: Receipt,
          show: isOwner || hasPermission('billing.reprint') || hasPermission('billing.print')
        }
      ]
    },
    {
      group: 'Kitchen Operations',
      items: [
        {
          id: 'kot' as NavTab,
          label: 'Create New KOT',
          icon: ChefHat,
          show: isOwner || hasPermission('kot.view') || hasPermission('kot.create')
        },
        {
          id: 'running-kot' as NavTab,
          label: 'Running KOT Orders',
          badge: 'Live',
          icon: Flame,
          show: isOwner || hasPermission('kot.view') || hasPermission('kot.edit')
        }
      ]
    },
    {
      group: 'Catalog & Stock',
      items: [
        {
          id: 'menu' as NavTab,
          label: 'Menu Management',
          icon: Utensils,
          show: isOwner || hasPermission('menu.view')
        },
        {
          id: 'inventory' as NavTab,
          label: 'Inventory & Stock',
          icon: Boxes,
          show: isOwner || hasPermission('inventory.view')
        }
      ]
    },
    {
      group: 'Analytics & Administration',
      items: [
        {
          id: 'reports' as NavTab,
          label: 'Sales Reports & Backup',
          icon: BarChart3,
          show: isOwner || hasPermission('reports.view')
        },
        {
          id: 'users' as NavTab,
          label: 'User & Role Security',
          icon: Users,
          show: isOwner
        },
        {
          id: 'settings' as NavTab,
          label: 'System Settings',
          icon: Settings,
          show: isOwner
        }
      ]
    }
  ];

  const handleSelect = (id: NavTab) => {
    onSelectTab(id);
    handleClose();
  };

  return (
    <>
      {/* Backdrop overlay when Drawer is open */}
      {drawerOpen && (
        <div 
          onClick={handleClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-2xs z-50 transition-opacity duration-150"
          aria-hidden="true"
        />
      )}

      {/* Enterprise Navy Navigation Drawer */}
      <aside 
        aria-label="Global Navigation Drawer"
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0F172A] text-slate-100 flex flex-col border-r border-slate-800 shadow-2xl transition-transform duration-200 ease-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-[#0B1120]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white border border-emerald-500 flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-xs">
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
              <p className="text-[10px] text-emerald-400 font-mono font-semibold truncate">
                Enterprise POS Terminal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
            title="Close [Esc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Operator Role Status */}
        {currentUser && (
          <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Operator</span>
            <span className="font-bold text-emerald-300 truncate max-w-[170px]">
              {currentUser.name || currentUser.email} ({currentUser.roleId.toUpperCase()})
            </span>
          </div>
        )}

        {/* Categorized Navigation List */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => {
            const visible = group.items.filter((i) => i.show);
            if (visible.length === 0) return null;
            return (
              <div key={group.group} className="space-y-1">
                <p className="px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {group.group}
                </p>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white font-extrabold shadow-sm'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white stroke-[2.5]' : 'text-emerald-400'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className={`text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-emerald-300 border border-slate-700'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Drawer Footer with Lock Terminal */}
        <div className="p-3 border-t border-slate-800 bg-[#0B1120] flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
            POS v2.5 • Online
          </span>
          {currentUser && (
            <button
              type="button"
              onClick={() => {
                handleClose();
                logout();
              }}
              className="px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/70 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock POS</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
