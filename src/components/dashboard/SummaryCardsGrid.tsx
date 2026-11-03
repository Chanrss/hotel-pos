import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  ChefHat, 
  Receipt, 
  Boxes, 
  Lock, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Flame, 
  Utensils, 
  Wallet, 
  CreditCard,
  Banknote,
  Sparkles,
  ShoppingBag,
  Layers,
  Bell
} from 'lucide-react';
import { UserRole } from '../../types';
import { NavTab } from '../common/Sidebar';

export interface DashboardMetrics {
  businessDate: string;
  todayRevenue: number;
  todayCashSales: number;
  todayUpiSales: number;
  completedBillsCount: number;
  cancelledBillsCount: number;
  dineInBillsCount: number;
  takeAwayBillsCount: number;
  avgOrderValue: number;
  activeKotsCount: number;
  preparingKotsCount: number;
  readyKotsCount: number;
  sentKotsCount: number;
  activeTableNumbers: string[];
  totalMenuItems: number;
  lowStockCount: number;
  latestKotNumber?: string;
  latestKotTable?: string;
  latestKotTime?: number;
}

interface SummaryCardsGridProps {
  metrics: DashboardMetrics;
  userRole?: string;
  isOwner: boolean;
  isManager: boolean;
  isWaiter: boolean;
  hasPermission: (perm: string) => boolean;
  onNavigate: (tab: NavTab) => void;
  onSwitchRole?: (role: UserRole) => void;
}

export const SummaryCardsGrid: React.FC<SummaryCardsGridProps> = ({
  metrics,
  userRole = 'owner',
  isOwner,
  isManager,
  isWaiter,
  hasPermission,
  onNavigate,
  onSwitchRole
}) => {
  // Permission Gating Checks
  const canViewSales = hasPermission('reports.view') || hasPermission('reports.financial') || isOwner;
  const canViewKots = hasPermission('kot.view') || hasPermission('kot.create') || isOwner || isManager || isWaiter;
  const canViewOrders = hasPermission('billing.create') || hasPermission('dashboard.view') || isOwner || isManager || isWaiter;
  const canViewInventory = hasPermission('inventory.view') || hasPermission('inventory.edit') || isOwner;

  const currentRoleName = (userRole || 'OWNER').toUpperCase();

  // Simple local state indicator for new kitchen order arrival & subtle pulse animation
  const [hasNewOrderAlert, setHasNewOrderAlert] = useState<boolean>(false);
  const [newOrderNotice, setNewOrderNotice] = useState<string | null>(null);
  const prevActiveKotsCountRef = useRef<number>(metrics.activeKotsCount);
  const isInitialMount = useRef<boolean>(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevActiveKotsCountRef.current = metrics.activeKotsCount;
      return;
    }

    // Trigger subtle pulse and visual notification when active KOTs count increases
    if (metrics.activeKotsCount > prevActiveKotsCountRef.current) {
      setHasNewOrderAlert(true);
      const detail = metrics.latestKotTable ? `Table ${metrics.latestKotTable}` : 'Kitchen';
      const orderLabel = metrics.latestKotNumber ? `KOT #${metrics.latestKotNumber}` : 'New Order';
      setNewOrderNotice(`${orderLabel} received for ${detail}!`);

      // Subtle pulse and notification badge auto-clears after 6 seconds
      const timer = setTimeout(() => {
        setHasNewOrderAlert(false);
        setNewOrderNotice(null);
      }, 6000);

      prevActiveKotsCountRef.current = metrics.activeKotsCount;
      return () => clearTimeout(timer);
    }

    prevActiveKotsCountRef.current = metrics.activeKotsCount;
  }, [metrics.activeKotsCount, metrics.latestKotNumber, metrics.latestKotTable, metrics.latestKotTime]);

  const handleKotCardClick = () => {
    if (hasNewOrderAlert) {
      setHasNewOrderAlert(false);
      setNewOrderNotice(null);
    }
    onNavigate('kot');
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {onSwitchRole && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-1">Active View:</span>
          <button
            type="button"
            onClick={() => onSwitchRole('owner')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
              userRole?.toLowerCase() === 'owner'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            Owner
          </button>
          <button
            type="button"
            onClick={() => onSwitchRole('manager')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
              userRole?.toLowerCase() === 'manager'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            Store Manager
          </button>
          <button
            type="button"
            onClick={() => onSwitchRole('waiter')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
              userRole?.toLowerCase() === 'waiter'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            Waiter
          </button>
        </div>
      )}

      {/* Primary High-Level Summary Cards Grid: Stacks vertically (cols-1) on mobile, 2 cols on tablet, 4 cols on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* ========================================================================= */}
        {/* CARD 1: TODAY'S TOTAL SALES (ROLE-GATED) */}
        {/* ========================================================================= */}
        {canViewSales ? (
          <div 
            onClick={() => onNavigate('reports')}
            className="bg-white hover:bg-slate-50/80 border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all cursor-pointer group hover:border-emerald-300 w-full"
          >
            <div>
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider truncate">
                    Today's Total Sales
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Live sync" />
                </div>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 group-hover:scale-105 transition-transform shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-mono font-black text-slate-900 tracking-tight">
                  ₹{metrics.todayRevenue.toLocaleString()}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">{metrics.completedBillsCount} completed bills</span>
                  <span>•</span>
                  <span>Avg ₹{metrics.avgOrderValue.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Micro Breakdown: Cash vs UPI */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
              <div className="flex items-center gap-1 text-emerald-700 font-mono font-medium">
                <Banknote className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Cash: ₹{metrics.todayCashSales.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1 text-blue-700 font-mono font-medium">
                <CreditCard className="w-3 h-3 text-blue-600 shrink-0" />
                <span>UPI: ₹{metrics.todayUpiSales.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Role-Gated Restricted State for Total Sales */
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between w-full">
            <div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Today's Total Sales
                </span>
                <div className="p-2 rounded-xl bg-slate-200/80 text-slate-600 border border-slate-300 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-slate-400 select-none">
                    ₹••••••
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                    RESTRICTED
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Financial revenue metrics are restricted for <b>{currentRoleName}</b> role.
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-1 text-[10.5px] text-slate-400">
              <span>Requires <code className="font-mono text-slate-600">reports.view</code></span>
              {onSwitchRole && (
                <button
                  type="button"
                  onClick={() => onSwitchRole('manager')}
                  className="text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  Switch to Manager →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 2: ACTIVE KOTS (KITCHEN ORDERS) - WITH SUBTLE PULSE ANIMATION */}
        {/* ========================================================================= */}
        {canViewKots ? (
          <div 
            onClick={handleKotCardClick}
            data-testid="active-kots-card"
            className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all cursor-pointer group w-full relative overflow-hidden ${
              hasNewOrderAlert
                ? 'bg-linear-to-b from-amber-50/90 via-white to-white border-2 border-amber-500 ring-4 ring-amber-400/25 shadow-lg shadow-amber-200/50'
                : 'bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-amber-300'
            }`}
          >
            {/* Subtle animated glowing top bar during pulse */}
            {hasNewOrderAlert && (
              <div 
                data-testid="new-order-pulse-bar"
                className="absolute top-0 left-0 right-0 h-1 bg-amber-500 animate-pulse" 
              />
            )}

            {/* Test simulation trigger */}
            <button
              type="button"
              data-testid="simulate-order-btn"
              onClick={(e) => {
                e.stopPropagation();
                setHasNewOrderAlert(true);
                setNewOrderNotice('Simulated KOT received!');
              }}
              className="sr-only"
              aria-hidden="true"
            >
              Simulate New KOT
            </button>

            <div>
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider group-hover:text-amber-700 truncate">
                    Active KOTs
                  </span>
                  {hasNewOrderAlert ? (
                    <span 
                      data-testid="new-order-badge"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] tracking-wide animate-bounce shadow-xs shrink-0"
                    >
                      <Bell className="w-2.5 h-2.5" />
                      <span>NEW ORDER</span>
                    </span>
                  ) : (
                    metrics.activeKotsCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                    )
                  )}
                </div>

                {/* Status Icon with animated ping indicator */}
                <div className="relative shrink-0">
                  {hasNewOrderAlert && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                  )}
                  <div className={`p-2 rounded-xl transition-all ${
                    hasNewOrderAlert
                      ? 'bg-amber-500 text-slate-950 scale-105 shadow-xs'
                      : 'bg-amber-50 text-amber-600 border border-amber-200 group-hover:scale-105'
                  }`}>
                    <ChefHat className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Visual Notification Banner for New Kitchen Order */}
              {hasNewOrderAlert && (
                <div 
                  data-testid="new-order-banner"
                  className="mt-2.5 mb-1 px-2.5 py-1.5 rounded-lg bg-amber-100/90 border border-amber-300 flex items-center justify-between text-[11px] font-bold text-amber-900 animate-pulse"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Bell className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="truncate">{newOrderNotice || 'New Kitchen Ticket Arrived!'}</span>
                  </div>
                  <span className="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded shrink-0 ml-1">
                    Just now
                  </span>
                </div>
              )}

              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${
                    hasNewOrderAlert ? 'text-amber-700 animate-pulse' : 'text-amber-600'
                  }`}>
                    {metrics.activeKotsCount}
                  </span>
                  <span className="text-xs font-bold text-slate-500">tickets in kitchen</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <span className="truncate">
                    {metrics.activeTableNumbers.length > 0 
                      ? `${metrics.activeTableNumbers.length} active tables (${metrics.activeTableNumbers.slice(0, 3).join(', ')}${metrics.activeTableNumbers.length > 3 ? '...' : ''})`
                      : 'No active table queues'}
                  </span>
                  <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform text-slate-400 shrink-0 ml-auto" />
                </div>
              </div>
            </div>

            {/* Live Kitchen Stage Badges */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded-md bg-amber-100/80 text-amber-800 font-mono font-bold flex items-center gap-1">
                <Flame className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                {metrics.preparingKotsCount} Cooking
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100/80 text-emerald-800 font-mono font-bold flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                {metrics.readyKotsCount} Ready
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-blue-100/80 text-blue-800 font-mono font-bold flex items-center gap-1 sm:ml-auto">
                <Clock className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                {metrics.sentKotsCount} New
              </span>
            </div>
          </div>
        ) : (
          /* Role-Gated Restricted State for KOTs */
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between w-full">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active KOTs</span>
              <div className="p-2 rounded-xl bg-slate-200 text-slate-600 border border-slate-300 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-lg font-bold text-slate-400">Access Restricted</div>
              <p className="text-[11px] text-slate-500 mt-1">
                Requires <code className="font-mono text-slate-600">kot.view</code> permission.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 3: COMPLETED BILLS & SERVICE BREAKDOWN */}
        {/* ========================================================================= */}
        {canViewOrders ? (
          <div 
            onClick={() => onNavigate('reprint')}
            className="bg-white hover:bg-slate-50/80 border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all cursor-pointer group hover:border-blue-300 w-full"
          >
            <div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider group-hover:text-blue-700 truncate">
                  Today's Orders
                </span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 group-hover:scale-105 transition-transform shrink-0">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-mono font-black text-blue-600 tracking-tight">
                    {metrics.completedBillsCount}
                  </span>
                  <span className="text-xs font-bold text-slate-500">completed bills</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <span className="truncate">
                    {metrics.cancelledBillsCount > 0 ? `${metrics.cancelledBillsCount} cancelled` : '100% order completion'}
                  </span>
                  <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform text-slate-400 shrink-0 ml-auto" />
                </div>
              </div>
            </div>

            {/* Split: Dine In vs Take Away */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
              <div className="flex items-center gap-1 text-slate-700 font-mono font-medium">
                <Utensils className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Dine-In: {metrics.dineInBillsCount}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-700 font-mono font-medium">
                <ShoppingBag className="w-3 h-3 text-blue-600 shrink-0" />
                <span>Take-Away: {metrics.takeAwayBillsCount}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between w-full">
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Orders</span>
              <div className="p-2 rounded-xl bg-slate-200 text-slate-600 border border-slate-300 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-lg font-bold text-slate-400">Access Restricted</div>
              <p className="text-[11px] text-slate-500 mt-1">Requires billing view permission.</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 4: INVENTORY & STOCK ALERTS (ROLE-GATED) */}
        {/* ========================================================================= */}
        {canViewInventory ? (
          <div 
            onClick={() => onNavigate('inventory')}
            className="bg-white hover:bg-slate-50/80 border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all cursor-pointer group hover:border-red-300 w-full"
          >
            <div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider group-hover:text-red-700 truncate">
                  Stock Alerts
                </span>
                <div className={`p-2 rounded-xl border transition-all shrink-0 ${
                  metrics.lowStockCount > 0 
                    ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' 
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                }`}>
                  <Boxes className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${
                    metrics.lowStockCount > 0 ? 'text-red-600' : 'text-slate-800'
                  }`}>
                    {metrics.lowStockCount}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {metrics.lowStockCount === 1 ? 'item low in stock' : 'items low in stock'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <span className="truncate">{metrics.lowStockCount > 0 ? 'Urgent re-order needed' : 'All pantry inventory optimal'}</span>
                  <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform text-slate-400 shrink-0 ml-auto" />
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[10.5px]">
              <span className="text-slate-500">{metrics.totalMenuItems} Menu Dishes</span>
              <span className={`font-bold font-mono ${metrics.lowStockCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {metrics.lowStockCount > 0 ? '⚠️ Check Raw Items' : '✓ Stock Healthy'}
              </span>
            </div>
          </div>
        ) : (
          /* Role-Gated Restricted State for Inventory (e.g. Waiter role) */
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between w-full">
            <div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Inventory Alerts
                </span>
                <div className="p-2 rounded-xl bg-slate-200/80 text-slate-600 border border-slate-300 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-slate-400 select-none">
                    ---
                  </span>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-md shrink-0">
                    STAFF RESTRICTED
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Raw material & stock levels reserved for <b>Manager & Storekeeper</b>.
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-1 text-[10.5px] text-slate-400">
              <span>Requires <code className="font-mono text-slate-600">inventory.view</code></span>
              <span className="text-slate-500 italic">Waiter mode</span>
            </div>
          </div>
        )}

      </div>

      {/* Secondary Dynamic Summary Tier: Stacks vertically on mobile, 3 columns on tablet/desktop */}
      {canViewSales ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Average Ticket Size */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex items-center gap-3 shadow-xs">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">Average Order Value (AOV)</span>
              <div className="text-base sm:text-lg font-mono font-black text-slate-900">
                ₹{metrics.avgOrderValue.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 truncate block">Across all completed tables today</span>
            </div>
          </div>

          {/* Dine-In vs Take-Away Split */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex items-center gap-3 shadow-xs">
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl border border-purple-200 shrink-0">
              <Utensils className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">Dine-In vs Take-Away</span>
              <div className="text-base sm:text-lg font-mono font-black text-slate-900">
                {metrics.completedBillsCount > 0 
                  ? `${Math.round((metrics.dineInBillsCount / metrics.completedBillsCount) * 100)}% / ${Math.round((metrics.takeAwayBillsCount / metrics.completedBillsCount) * 100)}%`
                  : '0% / 0%'}
              </div>
              <span className="text-[10px] text-slate-400 truncate block">
                {metrics.dineInBillsCount} Dine-In • {metrics.takeAwayBillsCount} Parcel
              </span>
            </div>
          </div>

          {/* Digital Payment Adoption */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex items-center gap-3 shadow-xs sm:col-span-2 lg:col-span-1">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">UPI / Digital Adoption</span>
              <div className="text-base sm:text-lg font-mono font-black text-slate-900">
                {metrics.todayRevenue > 0 
                  ? `${Math.round((metrics.todayUpiSales / metrics.todayRevenue) * 100)}% Digital`
                  : '100% Cash'}
              </div>
              <span className="text-[10px] text-slate-400 truncate block">
                ₹{metrics.todayUpiSales.toLocaleString()} received via UPI QR
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Secondary Role-Tailored Tier for Waiter: Active Tables & Service Overview */
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 shrink-0">
              <Utensils className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-800 block">
                Waiter Operational View • Active Dining Tables
              </span>
              <p className="text-[11px] text-slate-500 leading-snug">
                {metrics.activeTableNumbers.length > 0 
                  ? `Tables currently dining: ${metrics.activeTableNumbers.join(', ')}`
                  : 'All tables currently clear and ready for new guests.'}
              </p>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => onNavigate('kot')}
            className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-1.5 shrink-0 min-h-[40px]"
          >
            <span>Create / View KOTs</span>
            <span>→</span>
          </button>
        </div>
      )}
    </div>
  );
};
