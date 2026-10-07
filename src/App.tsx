import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { Sidebar, NavTab } from './components/common/Sidebar';
import { DirectBilling } from './components/billing/DirectBilling';
import { PosScreen } from './components/pos/PosScreen';
import { KotManagement } from './components/kot/KotManagement';
import { AuthModal } from './components/auth/AuthModal';
import { PrintingReceiptAnimation } from './components/common/PrintingReceiptAnimation';
import { DailyBackupNotificationToast } from './components/common/DailyBackupNotificationToast';
import { DailyLowStockAlertModal, useDailyLowStockAlert } from './components/inventory/DailyLowStockAlertModal';
import { useAutomatedDailyBackup } from './hooks/useAutomatedDailyBackup';
import { RestaurantSettings } from './types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './services/firebase';
import { DEFAULT_RESTAURANT_LOGO } from './data/defaultLogo';
import { OFFICIAL_LOGO_STORAGE_PATH, OFFICIAL_LOGO_STORAGE_URL } from './services/brandLogoService';
import { Zap, ShoppingBag, ChefHat, Receipt, MoreHorizontal, LayoutDashboard } from 'lucide-react';

// Lazy-loaded heavy modules for optimized bundle splitting & faster initial load
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const ReportsView = lazy(() => import('./components/reports/ReportsView').then((m) => ({ default: m.ReportsView })));
const InventoryManagement = lazy(() => import('./components/inventory/InventoryManagement').then((m) => ({ default: m.InventoryManagement })));
const UserManagement = lazy(() => import('./components/users/UserManagement').then((m) => ({ default: m.UserManagement })));
const MenuManagement = lazy(() => import('./components/menu/MenuManagement').then((m) => ({ default: m.MenuManagement })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })));
const BillHistoryReprint = lazy(() => import('./components/billing/BillHistoryReprint').then((m) => ({ default: m.BillHistoryReprint })));

const ModuleLoadingFallback: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center min-h-[360px] p-8 text-slate-500" role="status" aria-label="Loading module">
    <div className="w-9 h-9 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-sm font-medium text-slate-700">Loading module...</p>
    <p className="text-xs text-slate-400 mt-0.5">Please wait a moment</p>
  </div>
);

const AppContent: React.FC = () => {
  const { currentUser, isOwner, isManager, isWaiter } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('direct-billing');
  const [settings, setSettings] = useState<RestaurantSettings | undefined>(undefined);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Automated Daily Backup background manager and notifications
  const { backupToast, dismissToast } = useAutomatedDailyBackup(settings);

  // Daily 8:00 AM Low Stock Alert
  const {
    modalOpen: lowStockModalOpen,
    lowStockItems,
    handleDismiss: handleDismissLowStock,
    handleViewInventory: handleViewInventoryLowStock
  } = useDailyLowStockAlert(() => {
    setActiveTab('inventory');
    setMobileSidebarOpen(false);
  });

  // Subscribe to Restaurant Settings in Firestore and local settings updates
  useEffect(() => {
    const buildSettings = (data?: Partial<RestaurantSettings>): RestaurantSettings => {
      let cachedLocal: Partial<RestaurantSettings> = {};
      try {
        const rawLocal = localStorage.getItem('pos_restaurant_settings');
        if (rawLocal) cachedLocal = JSON.parse(rawLocal);
      } catch (_) {}

      const merged = { ...cachedLocal, ...(data || {}) };
      const isLogoRemoved = Boolean(merged.logoRemoved);
      const rawStorageUrl = merged.logoStorageUrl?.trim();
      const rawLogoUrl = merged.logoUrl?.trim();
      const isDataUrl = (rawStorageUrl?.startsWith('data:image/') || rawLogoUrl?.startsWith('data:image/'));
      const updatedLogo = isLogoRemoved
        ? ''
        : isDataUrl
        ? (rawLogoUrl?.startsWith('data:image/') ? rawLogoUrl : rawStorageUrl!)
        : DEFAULT_RESTAURANT_LOGO;

      const defaultAlign = merged.receiptAlignment || 'center';

      return {
        ...merged,
        restaurantName: merged.restaurantName || 'SRI SARAVANA BHAVAN',
        restaurantNameTamil: merged.restaurantNameTamil || 'ஸ்ரீ சரவண பவன்',
        address: merged.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
        phone: merged.phone || '7708159933',
        email: merged.email || 'srisaravanabhavan57.com',
        gstNumber: merged.gstNumber || '',
        logoUrl: updatedLogo,
        logoRemoved: isLogoRemoved,
        logoOffsetX: typeof merged.logoOffsetX === 'number' ? merged.logoOffsetX : 0,
        logoOffsetY: typeof merged.logoOffsetY === 'number' ? merged.logoOffsetY : 0,
        logoStoragePath: merged.logoStoragePath || OFFICIAL_LOGO_STORAGE_PATH,
        logoStorageUrl: updatedLogo,
        logoProtectedBrandAsset: !isLogoRemoved,
        monochromeLogoUrl: merged.monochromeLogoUrl || merged.bwLogoUrl || '',
        receiptHeader: merged.receiptHeader || 'SRI SARAVANA BHAVAN',
        receiptFooter: merged.receiptFooter || 'THANK YOU',
        businessDayStartHour: merged.businessDayStartHour || '04:00',
        billNumberDigits: merged.billNumberDigits || 2,
        paperWidth: '80mm',
        receiptFontSize: merged.receiptFontSize || 12,
        receiptAlignment: defaultAlign,
        logoAlignment: merged.logoAlignment || defaultAlign,
        shopNameAlignment: merged.shopNameAlignment || defaultAlign,
        addressAlignment: merged.addressAlignment || defaultAlign,
        phoneAlignment: merged.phoneAlignment || defaultAlign,
        billHeaderAlignment: merged.billHeaderAlignment || 'left',
        footerAlignment: merged.footerAlignment || defaultAlign,
        boldRestaurantName: merged.boldRestaurantName !== undefined ? merged.boldRestaurantName : true,
        boldBillNumber: merged.boldBillNumber !== undefined ? merged.boldBillNumber : true,
        boldItemHeader: merged.boldItemHeader !== undefined ? merged.boldItemHeader : true,
        boldGrandTotal: merged.boldGrandTotal !== undefined ? merged.boldGrandTotal : true,
        boldFooter: merged.boldFooter !== undefined ? merged.boldFooter : true,
        watermarkEnabled: merged.watermarkEnabled !== undefined ? merged.watermarkEnabled : (merged.logoDisplay === 'both' || merged.logoDisplay === 'watermark'),
        watermarkUseLogo: merged.watermarkUseLogo !== undefined ? merged.watermarkUseLogo : true,
        receiptLogoMaxWidth: (merged.receiptLogoMaxWidth && merged.receiptLogoMaxWidth >= 40) ? merged.receiptLogoMaxWidth : 100,
        receiptLogoMaxHeight: (merged.receiptLogoMaxHeight && merged.receiptLogoMaxHeight >= 40) ? merged.receiptLogoMaxHeight : 65,
        logoDisplay: isLogoRemoved ? 'none' : ((merged.watermarkEnabled !== false) ? 'watermark' : 'none'),
        watermarkOpacity: merged.watermarkOpacity !== undefined ? merged.watermarkOpacity : 0.12,
        compactMode: merged.compactMode !== undefined ? Boolean(merged.compactMode) : false,
        autoPrintOnSave: merged.autoPrintOnSave !== undefined ? merged.autoPrintOnSave : true,
        skipPrintPreview: merged.skipPrintPreview !== undefined ? Boolean(merged.skipPrintPreview) : false,
      };
    };

    const handleLocalSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<RestaurantSettings>;
      if (customEvent.detail) {
        setSettings(buildSettings(customEvent.detail));
      } else {
        setSettings(buildSettings());
      }
    };

    window.addEventListener('pos-settings-updated', handleLocalSettingsUpdate);

    const unsub = onSnapshot(doc(db, 'settings', 'restaurant'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as RestaurantSettings;
        setSettings(buildSettings(data));
      } else {
        setSettings(buildSettings());
      }
    }, (error) => {
      console.warn('Restaurant settings firestore notice (using defaults):', error?.message || error);
      setSettings(buildSettings());
    });

    return () => {
      window.removeEventListener('pos-settings-updated', handleLocalSettingsUpdate);
      unsub();
    };
  }, []);

  // Set default starting tab based on role
  useEffect(() => {
    if (isWaiter) {
      setActiveTab('kot');
    } else {
      setActiveTab('direct-billing');
    }
  }, [currentUser?.roleId]);

  if (!currentUser) {
    return (
      <AuthModal
        isOpen={true}
        onClose={() => {}}
        fullScreen={true}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] min-h-[100dvh] w-full bg-slate-100 text-slate-900 overflow-hidden font-sans">
      
      {/* Top Main Navigation App Bar */}
      <Header 
        settings={settings} 
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setMobileSidebarOpen(false);
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        onNavigateSettings={() => setActiveTab('settings')}
      />

      {/* Main Workspace (Full viewport width, zero reserved columns) */}
      <div className="flex-1 flex overflow-hidden relative min-h-0 w-full">
        
        {/* Overlay Navigation Drawer (Slides over interface on demand) */}
        <Sidebar 
          activeTab={activeTab} 
          settings={settings}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileSidebarOpen(false);
          }}
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />

        {/* Dynamic Screen View Area (Occupies 100% width and full vertical height) */}
        <main className="flex-1 flex flex-col min-w-0 w-full bg-slate-50 overflow-hidden relative">
          <Suspense fallback={<ModuleLoadingFallback />}>
            {activeTab === 'dashboard' && (
              <Dashboard 
                settings={settings} 
                onNavigate={(tab) => setActiveTab(tab)} 
              />
            )}

            {activeTab === 'pos' && (
              <PosScreen settings={settings} />
            )}

            {activeTab === 'direct-billing' && (
              <DirectBilling settings={settings} />
            )}

            {activeTab === 'kot' && (
              <KotManagement 
                settings={settings} 
                initialSubTab="create"
                onTabChange={(subTab) => {
                  if (subTab === 'running') setActiveTab('running-kot');
                  else if (subTab === 'create') setActiveTab('kot');
                }}
              />
            )}

            {activeTab === 'running-kot' && (
              <KotManagement 
                settings={settings} 
                initialSubTab="running"
                onTabChange={(subTab) => {
                  if (subTab === 'running') setActiveTab('running-kot');
                  else if (subTab === 'create') setActiveTab('kot');
                }}
              />
            )}

            {activeTab === 'reprint' && (
              <BillHistoryReprint settings={settings} />
            )}

            {activeTab === 'menu' && (
              <MenuManagement />
            )}

            {activeTab === 'inventory' && (
              <InventoryManagement />
            )}

            {activeTab === 'reports' && (
              <ReportsView settings={settings} />
            )}

            {activeTab === 'users' && (
              <UserManagement />
            )}

            {activeTab === 'settings' && (
              <SettingsView settings={settings} />
            )}
          </Suspense>
        </main>

      </div>

      {/* Global Thermal Receipt Printing Animation */}
      <PrintingReceiptAnimation mode="toast-widget" settings={settings} />


      {/* Daily 8:00 AM Low Stock Alert Modal */}
      <DailyLowStockAlertModal 
        isOpen={lowStockModalOpen}
        lowStockItems={lowStockItems}
        onClose={handleDismissLowStock}
        onViewInventory={handleViewInventoryLowStock}
      />

      {/* Automated Daily Backup Complete Notification Toast */}
      <DailyBackupNotificationToast 
        toast={backupToast}
        onDismiss={dismissToast}
        onNavigateSettings={() => setActiveTab('settings')}
      />

      {/* Firebase Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
      />

    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
