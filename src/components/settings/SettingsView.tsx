import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  Save,
  CheckCircle2,
  AlertCircle,
  Upload,
  Trash2,
  RotateCcw,
  Type,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Move,
  Layers,
  Store,
  Minus,
  Plus,
  LayoutTemplate,
  Eye
} from 'lucide-react';
import { RestaurantSettings } from '../../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';
import { OFFICIAL_LOGO_STORAGE_PATH, OFFICIAL_LOGO_STORAGE_URL } from '../../services/brandLogoService';
import { PrintService } from '../../services/PrintService';
import { LiveReceiptPreview } from './LiveReceiptPreview';

interface SettingsViewProps {
  settings?: RestaurantSettings;
  onRefreshSettings?: () => void;
}

type AlignOption = 'left' | 'center' | 'right';

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 20;
const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18] as const;

const FONT_SIZE_LABELS: Record<number, string> = {
  8: 'Extra Small (8px)',
  9: 'Mini (9px)',
  10: 'Small (10px)',
  11: 'Compact (11px)',
  12: 'Normal (12px)',
  13: 'Medium (13px)',
  14: 'Large (14px)',
  15: 'Extra Large (15px)',
  16: 'XL Bold (16px)',
  17: 'XXL (17px)',
  18: 'Jumbo (18px)',
  19: 'Max (19px)',
  20: 'Ultra (20px)'
};

/**
 * Resizes an uploaded logo image to fit a 3-inch thermal receipt width cleanly.
 */
async function optimizeLogoForThermalReceipt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read logo image file.'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Empty image file.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const MAX_W = 180;
        const MAX_H = 80;
        let targetW = img.width || MAX_W;
        let targetH = img.height || MAX_H;

        if (targetW > MAX_W || targetH > MAX_H) {
          const ratio = Math.min(MAX_W / targetW, MAX_H / targetH);
          targetW = Math.max(1, Math.round(targetW * ratio));
          targetH = Math.max(1, Math.round(targetH * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings: initialSettings, onRefreshSettings }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const firebaseSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobilePreviewPinned, setMobilePreviewPinned] = useState(false);

  const buildSanitizedSettingsPayload = (raw: RestaurantSettings): RestaurantSettings => {
    const isLogoRemoved = Boolean(raw.logoRemoved);
    const defaultAlign: AlignOption = raw.receiptAlignment || 'center';
    const effectiveLogoUrl = isLogoRemoved
      ? ''
      : (raw.logoUrl?.trim() ? raw.logoUrl.trim() : DEFAULT_RESTAURANT_LOGO);

    const payload: RestaurantSettings = {
      ...raw,
      restaurantName: raw.restaurantName || 'SRI SARAVANA BHAVAN',
      restaurantNameTamil: raw.restaurantNameTamil !== undefined ? raw.restaurantNameTamil : 'ஸ்ரீ சரவண பவன்',
      address: raw.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
      phone: raw.phone || '7708159933',
      logoStoragePath: raw.logoStoragePath || OFFICIAL_LOGO_STORAGE_PATH,
      logoStorageUrl: isLogoRemoved ? '' : (raw.logoUrl?.trim() || OFFICIAL_LOGO_STORAGE_URL),
      logoUrl: effectiveLogoUrl,
      logoRemoved: isLogoRemoved,
      logoOffsetX: typeof raw.logoOffsetX === 'number' && !Number.isNaN(raw.logoOffsetX) ? Math.round(raw.logoOffsetX) : 0,
      logoOffsetY: typeof raw.logoOffsetY === 'number' && !Number.isNaN(raw.logoOffsetY) ? Math.round(raw.logoOffsetY) : 0,
      receiptHeader: raw.receiptHeader || 'SRI SARAVANA BHAVAN',
      receiptFooter: raw.receiptFooter || 'THANK YOU',
      paperWidth: raw.paperWidth === '58mm' ? '58mm' : '80mm',
      receiptFontSize: raw.receiptFontSize ? Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Number(raw.receiptFontSize))) : 12,
      receiptAlignment: defaultAlign,
      logoAlignment: raw.logoAlignment || defaultAlign,
      shopNameAlignment: raw.shopNameAlignment || defaultAlign,
      addressAlignment: raw.addressAlignment || defaultAlign,
      phoneAlignment: raw.phoneAlignment || defaultAlign,
      billHeaderAlignment: raw.billHeaderAlignment || 'left',
      footerAlignment: raw.footerAlignment || defaultAlign,
      boldRestaurantName: raw.boldRestaurantName !== undefined ? Boolean(raw.boldRestaurantName) : true,
      boldBillNumber: raw.boldBillNumber !== undefined ? Boolean(raw.boldBillNumber) : true,
      boldItemHeader: raw.boldItemHeader !== undefined ? Boolean(raw.boldItemHeader) : true,
      boldGrandTotal: raw.boldGrandTotal !== undefined ? Boolean(raw.boldGrandTotal) : true,
      boldFooter: raw.boldFooter !== undefined ? Boolean(raw.boldFooter) : true,
      watermarkEnabled: raw.watermarkEnabled !== undefined ? Boolean(raw.watermarkEnabled) : true,
      watermarkUseLogo: raw.watermarkUseLogo !== undefined ? Boolean(raw.watermarkUseLogo) : true,
      watermarkOpacity: typeof raw.watermarkOpacity === 'number' ? raw.watermarkOpacity : 0.12,
      receiptLogoMaxWidth: raw.receiptLogoMaxWidth || 155,
      receiptLogoMaxHeight: raw.receiptLogoMaxHeight || 65,
      logoDisplay: isLogoRemoved ? 'none' : ((raw.watermarkEnabled !== false) ? 'watermark' : 'none'),
      compactMode: Boolean(raw.compactMode),
      receiptFormat: raw.compactMode ? 'compact' : (raw.receiptFormat || 'standard'),
      receiptShowAddress: raw.receiptShowAddress !== false,
      receiptShowPhone: raw.receiptShowPhone !== false,
      receiptShowItemSl: raw.receiptShowItemSl !== false,
      receiptShowTotalQty: raw.receiptShowTotalQty !== false,
      autoPrintOnSave: true,
      updatedAt: Date.now()
    };

    const cleanEntries = Object.entries(payload).filter(([_, value]) => value !== undefined);
    return Object.fromEntries(cleanEntries) as RestaurantSettings;
  };

  const persistSettingsToFirebase = async (settingsToPersist: RestaurantSettings) => {
    const cleanData = buildSanitizedSettingsPayload(settingsToPersist);
    try {
      localStorage.setItem('pos_restaurant_settings', JSON.stringify(cleanData));
      window.dispatchEvent(new CustomEvent('pos-settings-updated', { detail: cleanData }));
    } catch (_) {}

    await setDoc(doc(db, 'settings', 'restaurant'), cleanData, { merge: true });
    if (onRefreshSettings) onRefreshSettings();
  };

  const [formData, setFormData] = useState<RestaurantSettings>(() => {
    let cachedLocal: Partial<RestaurantSettings> = {};
    try {
      const raw = localStorage.getItem('pos_restaurant_settings');
      if (raw) cachedLocal = JSON.parse(raw);
    } catch (_) {}

    const merged = { ...cachedLocal, ...(initialSettings || {}) };
    const isLogoRemoved = Boolean(merged.logoRemoved);
    const defaultAlign: AlignOption = merged.receiptAlignment || 'center';

    return {
      restaurantName: merged.restaurantName || 'SRI SARAVANA BHAVAN',
      restaurantNameTamil: merged.restaurantNameTamil !== undefined ? merged.restaurantNameTamil : 'ஸ்ரீ சரவண பவன்',
      address: merged.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
      phone: merged.phone || '7708159933',
      logoUrl: isLogoRemoved ? '' : (merged.logoUrl?.trim() ? merged.logoUrl : DEFAULT_RESTAURANT_LOGO),
      logoRemoved: isLogoRemoved,
      logoOffsetX: typeof merged.logoOffsetX === 'number' ? merged.logoOffsetX : 0,
      logoOffsetY: typeof merged.logoOffsetY === 'number' ? merged.logoOffsetY : 0,
      receiptHeader: merged.receiptHeader || 'SRI SARAVANA BHAVAN',
      receiptFooter: merged.receiptFooter || 'THANK YOU',
      paperWidth: merged.paperWidth === '58mm' ? '58mm' : '80mm',
      receiptFontSize: merged.receiptFontSize ? Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Number(merged.receiptFontSize))) : 12,
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
      watermarkEnabled: merged.watermarkEnabled !== undefined ? merged.watermarkEnabled : true,
      watermarkUseLogo: merged.watermarkUseLogo !== undefined ? merged.watermarkUseLogo : true,
      watermarkOpacity: merged.watermarkOpacity !== undefined ? merged.watermarkOpacity : 0.12,
      receiptLogoMaxWidth: merged.receiptLogoMaxWidth || 155,
      receiptLogoMaxHeight: merged.receiptLogoMaxHeight || 65,
      logoDisplay: isLogoRemoved ? 'none' : ((merged.watermarkEnabled !== false) ? 'watermark' : 'none'),
      compactMode: Boolean(merged.compactMode),
      receiptFormat: merged.compactMode ? 'compact' : (merged.receiptFormat || 'standard'),
      receiptShowAddress: merged.receiptShowAddress !== false,
      receiptShowPhone: merged.receiptShowPhone !== false,
      receiptShowItemSl: merged.receiptShowItemSl !== false,
      receiptShowTotalQty: merged.receiptShowTotalQty !== false,
      autoPrintOnSave: true,
      updatedAt: Date.now()
    };
  });

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testPrintStatus, setTestPrintStatus] = useState<{
    state: 'idle' | 'printing' | 'success' | 'failed';
    message?: string;
  }>({ state: 'idle' });

  const [diagState, setDiagState] = useState(() => PrintService.getDiagnosticStatus());

  useEffect(() => {
    const unsub = PrintService.subscribeDiagnostics((nextState) => {
      setDiagState(nextState);
    });
    return unsub;
  }, []);

  const isPrintSystemAvailable = diagState.printerStatus === 'Ready';
  const lastPrintOutcome = diagState.lastPrint;
  const lastPrintErrorMsg = diagState.lastError;

  const formDataRef = useRef<RestaurantSettings>(formData);
  formDataRef.current = formData;

  useEffect(() => {
    if (initialSettings) {
      setFormData((prev) => {
        const isLogoRemoved = initialSettings.logoRemoved !== undefined ? Boolean(initialSettings.logoRemoved) : Boolean(prev.logoRemoved);
        const defaultAlign: AlignOption = initialSettings.receiptAlignment || prev.receiptAlignment || 'center';
        const nextState = {
          ...prev,
          ...initialSettings,
          logoRemoved: isLogoRemoved,
          logoUrl: isLogoRemoved
            ? ''
            : (initialSettings.logoUrl?.trim() ? initialSettings.logoUrl : (prev.logoUrl || DEFAULT_RESTAURANT_LOGO)),
          logoOffsetX: typeof initialSettings.logoOffsetX === 'number' ? initialSettings.logoOffsetX : (prev.logoOffsetX || 0),
          logoOffsetY: typeof initialSettings.logoOffsetY === 'number' ? initialSettings.logoOffsetY : (prev.logoOffsetY || 0),
          receiptFontSize: initialSettings.receiptFontSize
            ? Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Number(initialSettings.receiptFontSize)))
            : (prev.receiptFontSize || 12),
          logoAlignment: initialSettings.logoAlignment || prev.logoAlignment || defaultAlign,
          shopNameAlignment: initialSettings.shopNameAlignment || prev.shopNameAlignment || defaultAlign,
          addressAlignment: initialSettings.addressAlignment || prev.addressAlignment || defaultAlign,
          phoneAlignment: initialSettings.phoneAlignment || prev.phoneAlignment || defaultAlign,
          billHeaderAlignment: initialSettings.billHeaderAlignment || prev.billHeaderAlignment || 'left',
          footerAlignment: initialSettings.footerAlignment || prev.footerAlignment || defaultAlign,
          boldRestaurantName: initialSettings.boldRestaurantName !== undefined ? initialSettings.boldRestaurantName : (prev.boldRestaurantName ?? true),
          boldBillNumber: initialSettings.boldBillNumber !== undefined ? initialSettings.boldBillNumber : (prev.boldBillNumber ?? true),
          boldItemHeader: initialSettings.boldItemHeader !== undefined ? initialSettings.boldItemHeader : (prev.boldItemHeader ?? true),
          boldGrandTotal: initialSettings.boldGrandTotal !== undefined ? initialSettings.boldGrandTotal : (prev.boldGrandTotal ?? true),
          boldFooter: initialSettings.boldFooter !== undefined ? initialSettings.boldFooter : (prev.boldFooter ?? true),
          watermarkEnabled: initialSettings.watermarkEnabled !== undefined ? initialSettings.watermarkEnabled : (prev.watermarkEnabled ?? true),
          watermarkUseLogo: initialSettings.watermarkUseLogo !== undefined ? initialSettings.watermarkUseLogo : (prev.watermarkUseLogo ?? true)
        };
        formDataRef.current = nextState;
        return nextState;
      });
    }
  }, [initialSettings]);

  // Persist locally, notify App immediately, and sync to Firebase Firestore whenever formData changes
  const updateSettingsImmediate = (updater: (prev: RestaurantSettings) => RestaurantSettings) => {
    const next = updater(formDataRef.current);
    const synced = buildSanitizedSettingsPayload(next);
    formDataRef.current = synced;
    setFormData(synced);

    try {
      localStorage.setItem('pos_restaurant_settings', JSON.stringify(synced));
      window.dispatchEvent(new CustomEvent('pos-settings-updated', { detail: synced }));
      const printRoot = document.getElementById('pos-print-root');
      if (printRoot && synced.receiptFontSize) {
        printRoot.style.setProperty('--receipt-base-font-size', `${synced.receiptFontSize}px`);
      }
    } catch (_) {}

    if (firebaseSyncTimerRef.current) {
      clearTimeout(firebaseSyncTimerRef.current);
    }
    firebaseSyncTimerRef.current = setTimeout(() => {
      setDoc(doc(db, 'settings', 'restaurant'), synced, { merge: true }).catch(() => {
        // Offline / sandbox fallback already cached in localStorage
      });
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (firebaseSyncTimerRef.current) {
        clearTimeout(firebaseSyncTimerRef.current);
      }
    };
  }, []);

  // Handle Shop Logo Upload (PNG, JPG, JPEG, WEBP)
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const extValid = /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!validTypes.includes(file.type.toLowerCase()) && !extValid) {
      setNotification({
        type: 'error',
        message: 'Unsupported format. Please upload a PNG, JPG, JPEG, or WEBP image.'
      });
      setTimeout(() => setNotification(null), 3500);
      return;
    }

    try {
      const optimizedDataUrl = await optimizeLogoForThermalReceipt(file);
      updateSettingsImmediate((prev) => ({
        ...prev,
        logoUrl: optimizedDataUrl,
        logoStorageUrl: optimizedDataUrl,
        logoRemoved: false,
        logoDisplay: 'watermark'
      }));
      setNotification({
        type: 'success',
        message: 'Shop logo uploaded and optimized for 3-inch thermal receipt printing!'
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || 'Failed to process logo image.'
      });
      setTimeout(() => setNotification(null), 3500);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove Shop Logo
  const handleRemoveLogo = () => {
    updateSettingsImmediate((prev) => ({
      ...prev,
      logoUrl: '',
      logoStorageUrl: '',
      logoRemoved: true,
      logoOffsetX: 0,
      logoOffsetY: 0,
      logoDisplay: 'none'
    }));
    setNotification({
      type: 'success',
      message: 'Shop logo removed from receipt.'
    });
    setTimeout(() => setNotification(null), 3000);
  };

  // Reset Logo Position
  const handleResetLogoPosition = () => {
    updateSettingsImmediate((prev) => ({
      ...prev,
      logoOffsetX: 0,
      logoOffsetY: 0
    }));
  };

  // Save Settings to Firestore + LocalStorage
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (firebaseSyncTimerRef.current) {
      clearTimeout(firebaseSyncTimerRef.current);
      firebaseSyncTimerRef.current = null;
    }
    setSaving(true);
    try {
      await persistSettingsToFirebase(formData);
      setNotification({ type: 'success', message: 'Receipt & Printer Settings saved to Firebase!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (_) {
      setNotification({ type: 'success', message: 'Receipt settings saved locally!' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // TEST PRINT handler via centralized PrintService
  const handleTestPrint = async () => {
    setTestPrintStatus({ state: 'printing', message: 'Printing...' });

    try {
      const result = await PrintService.testPrint(formData);
      if (result.success) {
        setTestPrintStatus({
          state: 'success',
          message: 'TEST PRINT SUCCESSFUL — Print successful'
        });
      } else {
        const errMsg = result.restrictedInIframe
          ? 'Browser print window was blocked.'
          : (result.error || 'Receipt could not be sent to the print system.');
        setTestPrintStatus({
          state: 'failed',
          message: `TEST PRINT FAILED — ${errMsg}`
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Receipt could not be sent to the print system.';
      setTestPrintStatus({
        state: 'failed',
        message: `TEST PRINT FAILED — ${errMsg}`
      });
    }
  };

  const currentFontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Number(formData.receiptFontSize || 12)));
  const hasLogo = !formData.logoRemoved && Boolean(formData.logoUrl?.trim());

  const alignmentRows: {
    key: keyof Pick<
      RestaurantSettings,
      'logoAlignment' | 'shopNameAlignment' | 'addressAlignment' | 'phoneAlignment' | 'billHeaderAlignment' | 'footerAlignment'
    >;
    label: string;
  }[] = [
    { key: 'logoAlignment', label: 'Logo' },
    { key: 'shopNameAlignment', label: 'Shop Name' },
    { key: 'addressAlignment', label: 'Address' },
    { key: 'phoneAlignment', label: 'Phone' },
    { key: 'billHeaderAlignment', label: 'Bill Header' },
    { key: 'footerAlignment', label: 'Footer' }
  ];

  const boldRows: {
    key: keyof Pick<
      RestaurantSettings,
      'boldRestaurantName' | 'boldBillNumber' | 'boldItemHeader' | 'boldGrandTotal' | 'boldFooter'
    >;
    label: string;
  }[] = [
    { key: 'boldRestaurantName', label: 'Restaurant Name' },
    { key: 'boldBillNumber', label: 'Bill Number' },
    { key: 'boldItemHeader', label: 'Item Header' },
    { key: 'boldGrandTotal', label: 'Grand Total' },
    { key: 'boldFooter', label: 'Footer' }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-3 sm:p-4 gap-3.5 overflow-y-auto md:overflow-hidden">
      {/* Top Bar */}
      <div className="bg-slate-900 border border-slate-800 px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg text-white">
              Printer &amp; Receipt Settings
            </h2>
            <p className="text-xs text-slate-400">
              Real-time 3-inch thermal receipt layout, alignment, watermark positioning &amp; test printing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setMobilePreviewPinned((v) => !v)}
            className="md:hidden px-3 py-2 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-emerald-400" />
            <span>{mobilePreviewPinned ? 'Hide Preview' : 'Pin Preview'}</span>
          </button>

          <button
            type="button"
            id="btn-header-test-print"
            onClick={handleTestPrint}
            disabled={testPrintStatus.state === 'printing'}
            className="px-3.5 py-2 text-xs sm:text-sm font-bold text-amber-300 hover:text-amber-200 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>{testPrintStatus.state === 'printing' ? 'Printing...' : 'TEST PRINT'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-md shrink-0 ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/90 border border-red-500/40 text-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Optional Mobile Pinned Live Receipt Preview (< 768px) */}
      {mobilePreviewPinned && (
        <div className="md:hidden shrink-0">
          <LiveReceiptPreview
            settings={formData}
            onUpdateLogoPosition={(offsetX, offsetY) =>
              updateSettingsImmediate((prev) => ({
                ...prev,
                logoOffsetX: offsetX,
                logoOffsetY: offsetY
              }))
            }
            onResetLogoPosition={handleResetLogoPosition}
            onTestPrint={handleTestPrint}
            isPrintingSample={testPrintStatus.state === 'printing'}
            testPrintStatus={testPrintStatus}
          />
        </div>
      )}

      {/* Persistent Split-Pane Workspace: Left Scrollable Controls + Right Persistent Preview Panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:flex-1 md:min-h-0 md:overflow-hidden">
        {/* Left Column: Receipt & Printer Controls (7 cols, independently scrollable) */}
        <div className="md:col-span-7 flex flex-col gap-4 md:h-full md:overflow-y-auto md:pr-1.5 pb-6">
          {/* 1. RECEIPT LAYOUT & DENSITY */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Receipt Layout &amp; Sections</h3>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                {formData.compactMode ? 'Compact Paper-Saver' : 'Standard 3-Inch'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  updateSettingsImmediate((prev) => ({
                    ...prev,
                    compactMode: false,
                    receiptFormat: 'standard'
                  }))
                }
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  !formData.compactMode
                    ? 'bg-amber-500/15 border-amber-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-bold text-xs text-white">Standard Layout</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Balanced spacing &amp; full readability
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateSettingsImmediate((prev) => ({
                    ...prev,
                    compactMode: true,
                    receiptFormat: 'compact'
                  }))
                }
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  formData.compactMode
                    ? 'bg-emerald-500/15 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-bold text-xs text-white">Compact Paper-Saver</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tighter line spacing to save roll paper
                </div>
              </button>
            </div>

            {/* Section Visibility Checkboxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {(
                [
                  { key: 'receiptShowAddress', label: 'Address' },
                  { key: 'receiptShowPhone', label: 'Phone' },
                  { key: 'receiptShowItemSl', label: 'Item Sl (#)' },
                  { key: 'receiptShowTotalQty', label: 'Total Qty' }
                ] as const
              ).map((sec) => {
                const checked = formData[sec.key] !== false;
                return (
                  <label
                    key={sec.key}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-colors ${
                      checked
                        ? 'bg-slate-950 border-amber-500/50 text-white'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        updateSettingsImmediate((prev) => ({
                          ...prev,
                          [sec.key]: e.target.checked
                        }))
                      }
                      className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                    />
                    <span className="truncate">{sec.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 2. FONT SIZE (Dynamic Firestore Slider + Stepper + Quick Presets) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm text-white">Receipt Font Size</h3>
                  <p className="text-[11px] text-slate-400">
                    Slide to adjust thermal receipt text size visually in real-time
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-mono text-amber-300 font-bold">
                {FONT_SIZE_LABELS[currentFontSize] || `${currentFontSize}px`}
              </span>
            </div>

            {/* Interactive Range Slider for receiptFontSize */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="receipt-font-size-slider"
                  className="font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <span>Text Size Slider</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    ({FONT_SIZE_MIN}px – {FONT_SIZE_MAX}px)
                  </span>
                </label>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {currentFontSize}px
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 select-none">A</span>
                <input
                  id="receipt-font-size-slider"
                  data-testid="receipt-font-size-slider"
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={currentFontSize}
                  aria-label="Receipt Font Size"
                  onChange={(e) => {
                    const nextSize = Math.max(
                      FONT_SIZE_MIN,
                      Math.min(FONT_SIZE_MAX, Number(e.target.value))
                    );
                    updateSettingsImmediate((prev) => ({
                      ...prev,
                      receiptFontSize: nextSize
                    }));
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-base font-mono font-bold text-slate-200 select-none">A</span>
              </div>

              <div className="flex justify-between text-[10px] font-mono text-slate-400 px-1">
                <span>8px (Small)</span>
                <span>12px (Default)</span>
                <span>16px (Large)</span>
                <span>20px (Max)</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Stepper: [ − ] Normal [ + ] */}
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateSettingsImmediate((prev) => ({
                      ...prev,
                      receiptFontSize: Math.max(FONT_SIZE_MIN, Number(prev.receiptFontSize || 12) - 1)
                    }))
                  }
                  disabled={currentFontSize <= FONT_SIZE_MIN}
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold flex items-center justify-center cursor-pointer transition-colors"
                  title="Decrease Font Size"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-3 text-xs font-bold text-white min-w-[96px] text-center">
                  {FONT_SIZE_LABELS[currentFontSize] || `${currentFontSize}px`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateSettingsImmediate((prev) => ({
                      ...prev,
                      receiptFontSize: Math.min(FONT_SIZE_MAX, Number(prev.receiptFontSize || 12) + 1)
                    }))
                  }
                  disabled={currentFontSize >= FONT_SIZE_MAX}
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold flex items-center justify-center cursor-pointer transition-colors"
                  title="Increase Font Size"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Direct Number Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {FONT_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() =>
                      updateSettingsImmediate((prev) => ({
                        ...prev,
                        receiptFontSize: size
                      }))
                    }
                    className={`w-9 h-9 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                      currentFontSize === size
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. SHOP LOGO & WATERMARK POSITION */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Shop Logo &amp; Position</h3>
              </div>
              <span className="text-[11px] text-slate-400">PNG, JPG, JPEG, WEBP</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleLogoFileChange}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-3">
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-xl bg-white border border-slate-700 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                {hasLogo ? (
                  <img
                    src={formData.logoUrl}
                    alt="Shop Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400 font-semibold text-center leading-tight">
                    No Logo
                  </span>
                )}
              </div>

              {/* Upload / Replace / Remove Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{hasLogo ? 'Replace Logo' : 'Upload Logo'}</span>
                </button>

                {hasLogo && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-500/40 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Logo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Logo / Watermark Position Controls */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Move className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">
                      Drag watermark inside the Receipt Preview or use sliders
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Horizontal: {formData.logoOffsetX || 0}px · Vertical: {formData.logoOffsetY || 0}px
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetLogoPosition}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Logo Position</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Horizontal Offset (X)</span>
                    <span className="font-mono text-amber-400">{formData.logoOffsetX || 0}px</span>
                  </div>
                  <input
                    type="range"
                    min="-85"
                    max="85"
                    step="1"
                    value={formData.logoOffsetX || 0}
                    onChange={(e) =>
                      updateSettingsImmediate((prev) => ({
                        ...prev,
                        logoOffsetX: Number(e.target.value)
                      }))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Vertical Offset (Y)</span>
                    <span className="font-mono text-amber-400">{formData.logoOffsetY || 0}px</span>
                  </div>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    step="1"
                    value={formData.logoOffsetY || 0}
                    onChange={(e) =>
                      updateSettingsImmediate((prev) => ({
                        ...prev,
                        logoOffsetY: Number(e.target.value)
                      }))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. WATERMARK */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm text-white">Watermark</h3>
                  <p className="text-xs text-slate-400">
                    Centered behind the receipt content with low transparency so text stays readable
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    updateSettingsImmediate((prev) => ({
                      ...prev,
                      watermarkEnabled: true
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    formData.watermarkEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Enable
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSettingsImmediate((prev) => ({
                      ...prev,
                      watermarkEnabled: false
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    !formData.watermarkEnabled
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Disable
                </button>
              </div>
            </div>

            {formData.watermarkEnabled && (
              <div className="pt-2 border-t border-slate-800/80 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Use Shop Logo as Watermark</span>
                  <input
                    type="checkbox"
                    checked={formData.watermarkUseLogo !== false}
                    onChange={(e) =>
                      updateSettingsImmediate((prev) => ({
                        ...prev,
                        watermarkUseLogo: e.target.checked
                      }))
                    }
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Watermark Opacity</span>
                      <span className="font-mono text-amber-400">
                        {Math.round((formData.watermarkOpacity ?? 0.12) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.30"
                      step="0.01"
                      value={formData.watermarkOpacity ?? 0.12}
                      onChange={(e) =>
                        updateSettingsImmediate((prev) => ({
                          ...prev,
                          watermarkOpacity: Number(e.target.value)
                        }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Watermark Size</span>
                      <span className="font-mono text-amber-400">
                        {formData.receiptLogoMaxWidth || 155}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="90"
                      max="200"
                      step="5"
                      value={formData.receiptLogoMaxWidth || 155}
                      onChange={(e) =>
                        updateSettingsImmediate((prev) => ({
                          ...prev,
                          receiptLogoMaxWidth: Number(e.target.value)
                        }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. ALIGNMENT SETTINGS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <AlignCenter className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Alignment Settings</h3>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-400 mr-1">All:</span>
                {(['left', 'center', 'right'] as const).map((al) => (
                  <button
                    key={al}
                    type="button"
                    onClick={() =>
                      updateSettingsImmediate((prev) => ({
                        ...prev,
                        receiptAlignment: al,
                        logoAlignment: al,
                        shopNameAlignment: al,
                        addressAlignment: al,
                        phoneAlignment: al,
                        footerAlignment: al
                      }))
                    }
                    className={`px-2 py-0.5 rounded uppercase font-bold cursor-pointer ${
                      formData.receiptAlignment === al
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {al}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-800/70">
              {alignmentRows.map((row) => {
                const currentAlign: AlignOption = (formData[row.key] as AlignOption) || 'center';
                return (
                  <div key={row.key} className="py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">{row.label}</span>
                    <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      {(
                        [
                          { id: 'left', label: 'LEFT', icon: AlignLeft },
                          { id: 'center', label: 'CENTER', icon: AlignCenter },
                          { id: 'right', label: 'RIGHT', icon: AlignRight }
                        ] as const
                      ).map((opt) => {
                        const Icon = opt.icon;
                        const active = currentAlign === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              updateSettingsImmediate((prev) => ({
                                ...prev,
                                [row.key]: opt.id
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                              active
                                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 6. BOLD LETTERS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Bold className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-white">Bold Letters</h3>
            </div>

            <div className="divide-y divide-slate-800/70">
              {boldRows.map((row) => {
                const isBold = formData[row.key] !== false;
                return (
                  <div key={row.key} className="py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">{row.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSettingsImmediate((prev) => ({
                          ...prev,
                          [row.key]: !isBold
                        }))
                      }
                      className={`px-3.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                        isBold
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-2xs'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5" />
                      <span>Bold</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7. SHOP RECEIPT HEADER & FOOTER DETAILS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Store className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-white">Shop Details on Receipt</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Restaurant Name</label>
                <input
                  type="text"
                  value={formData.restaurantName}
                  onChange={(e) =>
                    updateSettingsImmediate((prev) => ({ ...prev, restaurantName: e.target.value }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) =>
                    updateSettingsImmediate((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) =>
                    updateSettingsImmediate((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">Footer Text</label>
                <input
                  type="text"
                  value={formData.receiptFooter || ''}
                  onChange={(e) =>
                    updateSettingsImmediate((prev) => ({ ...prev, receiptFooter: e.target.value }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Persistent Live 3-Inch Receipt Preview + Print Diagnostic Status (5 cols) */}
        <div className="md:col-span-5 flex flex-col gap-4 md:h-full md:overflow-y-auto md:pl-1 pb-6">
          <LiveReceiptPreview
            settings={formData}
            onUpdateLogoPosition={(offsetX, offsetY) =>
              updateSettingsImmediate((prev) => ({
                ...prev,
                logoOffsetX: offsetX,
                logoOffsetY: offsetY
              }))
            }
            onResetLogoPosition={handleResetLogoPosition}
            onTestPrint={handleTestPrint}
            isPrintingSample={testPrintStatus.state === 'printing'}
            testPrintStatus={testPrintStatus}
          />

          {/* SIMPLE PRINT DIAGNOSTIC STATUS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2.5 text-xs">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2">
              Print Diagnostic Status
            </h4>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Printer Status:</span>
              <span
                className={`font-bold ${
                  isPrintSystemAvailable ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isPrintSystemAvailable ? 'Ready' : 'Unavailable'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-800/60">
              <span className="text-slate-400">Print System:</span>
              <span
                className={`font-bold ${
                  isPrintSystemAvailable && lastPrintOutcome !== 'Failed'
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {isPrintSystemAvailable && lastPrintOutcome !== 'Failed' ? 'Ready' : 'Error'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-800/60">
              <span className="text-slate-400">Last Print:</span>
              <span
                className={`font-bold ${
                  lastPrintOutcome === 'Successful'
                    ? 'text-emerald-400'
                    : lastPrintOutcome === 'Failed'
                    ? 'text-red-400'
                    : 'text-slate-400'
                }`}
              >
                {lastPrintOutcome === 'none' ? 'Ready' : lastPrintOutcome}
              </span>
            </div>

            {lastPrintErrorMsg && (
              <div className="mt-2 p-2.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-[11px] space-y-2">
                <div>{lastPrintErrorMsg}</div>
                <button
                  type="button"
                  onClick={handleTestPrint}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                >
                  Retry Print
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
