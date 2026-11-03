import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  Save,
  RotateCcw,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Store,
  FileText,
  LayoutTemplate,
  Receipt,
  QrCode,
  DollarSign,
  Type,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Sparkles,
  Copy,
  Maximize2,
  ShieldCheck,
  Check
} from 'lucide-react';
import { RestaurantSettings, Bill, BillItem } from '../../types';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';
import { PrinterService } from '../../services/printerService';
import { PrintService } from '../../services/PrintService';
import { ReceiptTemplate } from '../common/ReceiptTemplate';

interface ReceiptSettingsViewProps {
  settings?: RestaurantSettings;
  onRefreshSettings?: () => void;
}

type SettingsTab =
  | 'store'
  | 'invoice'
  | 'items'
  | 'totals'
  | 'styling'
  | 'payment-qr'
  | 'printing';

// Realistic sample products and billing data in preview mode (does not save to sales)
const SAMPLE_BILL: Partial<Bill> = {
  id: 'sample-preview-bill',
  billNumber: '01',
  orderType: 'DINE_IN',
  tableNumber: '01',
  captainNumber: '01',
  subtotal: 750,
  discount: 0,
  grandTotal: 750,
  paymentMethod: 'CASH',
  createdAt: Date.now(),
  reprintCount: 0
};

const SAMPLE_ITEMS: BillItem[] = [
  {
    id: 's-1',
    billId: 'sample-preview-bill',
    itemId: 'item-paneer-tikka',
    itemCode: 'PT01',
    itemName: 'Paneer Tikka',
    itemNameTamil: 'பனீர் டிக்கா',
    quantity: 1,
    unitPrice: 240,
    totalPrice: 240,
    priceType: 'NON_AC',
    createdAt: Date.now()
  },
  {
    id: 's-2',
    billId: 'sample-preview-bill',
    itemId: 'item-veg-biryani',
    itemCode: 'VB01',
    itemName: 'Veg Biryani',
    itemNameTamil: 'வெஜ் பிரியாணி',
    quantity: 2,
    unitPrice: 180,
    totalPrice: 360,
    priceType: 'NON_AC',
    createdAt: Date.now()
  },
  {
    id: 's-3',
    billId: 'sample-preview-bill',
    itemId: 'item-coke-500',
    itemCode: 'CK01',
    itemName: 'Coke (500ml)',
    itemNameTamil: 'கோக் (500ml)',
    quantity: 2,
    unitPrice: 60,
    totalPrice: 120,
    priceType: 'NON_AC',
    createdAt: Date.now()
  },
  {
    id: 's-4',
    billId: 'sample-preview-bill',
    itemId: 'item-water-bottle',
    itemCode: 'WB01',
    itemName: 'Water Bottle',
    itemNameTamil: 'குடிநீர் பாட்டில்',
    quantity: 1,
    unitPrice: 30,
    totalPrice: 30,
    priceType: 'NON_AC',
    createdAt: Date.now()
  }
];

export const ReceiptSettingsView: React.FC<ReceiptSettingsViewProps> = ({
  settings: initialSettings,
  onRefreshSettings
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('store');
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testPrintStatus, setTestPrintStatus] = useState<{
    state: 'idle' | 'printing' | 'success' | 'failed';
    message?: string;
  }>({ state: 'idle' });
  const [mobilePreviewPinned, setMobilePreviewPinned] = useState(false);

  // Form state initialized from initialSettings or LocalStorage
  const [formData, setFormData] = useState<RestaurantSettings>(() => {
    let cachedLocal: Partial<RestaurantSettings> = {};
    try {
      const raw = localStorage.getItem('pos_restaurant_settings');
      if (raw) cachedLocal = JSON.parse(raw);
    } catch (_) {}

    // Clean legacy unwanted defaults from cachedLocal
    const isCleanedV6 = localStorage.getItem('pos_receipt_clean_v6') === 'true';
    if (!isCleanedV6) {
      cachedLocal.receiptShowEnglishName = false;
      cachedLocal.receiptShowAddress = false;
      cachedLocal.receiptShowBranchName = false;
      cachedLocal.receiptShowGstFssai = false;
      cachedLocal.receiptShowEmail = false;
      cachedLocal.receiptShowPhone = false;
      cachedLocal.receiptShowInvoiceTitle = false;
      cachedLocal.invoiceTitle = '';
      cachedLocal.receiptHeader = '';
      cachedLocal.receiptShowHeader = false;
      cachedLocal.showOrderType = false;
      cachedLocal.showCaptainCode = false;
      cachedLocal.receiptShowPaymentMethod = false;
      cachedLocal.receiptShowQrCode = false;
      cachedLocal.receiptShowUpiDetails = false;
      cachedLocal.receiptShowReturnPolicy = false;
      cachedLocal.receiptShowDiscount = false;
      cachedLocal.returnPolicy = '';
      try {
        localStorage.setItem('pos_receipt_clean_v6', 'true');
        localStorage.setItem('pos_restaurant_settings', JSON.stringify({
          ...cachedLocal,
          invoiceTitle: '',
          receiptShowEnglishName: false,
          receiptShowAddress: false,
          receiptShowBranchName: false,
          receiptShowGstFssai: false,
          receiptShowEmail: false,
          receiptShowPhone: false,
          receiptShowInvoiceTitle: false,
          receiptHeader: '',
          receiptShowHeader: false,
          showOrderType: false,
          showCaptainCode: false,
          receiptShowPaymentMethod: false,
          receiptShowQrCode: false,
          receiptShowUpiDetails: false,
          receiptShowReturnPolicy: false,
          receiptShowDiscount: false,
          returnPolicy: ''
        }));
      } catch (_) {}
    }

    const merged = { ...cachedLocal, ...(initialSettings || {}) };
    const isLogoRemoved = Boolean(merged.logoRemoved);
    const defaultAlign = merged.receiptAlignment || 'center';

    return {
      ...merged,
      restaurantName: merged.restaurantName || 'SRI SARAVANA BHAVAN',
      restaurantNameTamil: merged.restaurantNameTamil !== undefined ? merged.restaurantNameTamil : 'ஸ்ரீ சரவண பவன்',
      address: merged.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213',
      phone: merged.phone || '7708159933',
      email: merged.email || 'contact@srisaravanabhavan.com',
      gstNumber: merged.gstNumber || '33AAAAA0000A1Z5',
      fssaiNumber: merged.fssaiNumber || '12418008000001',
      storeBranchName: merged.storeBranchName || 'Main Branch',
      logoUrl: isLogoRemoved ? '' : (merged.logoUrl?.trim() || DEFAULT_RESTAURANT_LOGO),
      logoRemoved: isLogoRemoved,
      logoOffsetX: typeof merged.logoOffsetX === 'number' ? merged.logoOffsetX : 0,
      logoOffsetY: typeof merged.logoOffsetY === 'number' ? merged.logoOffsetY : 0,
      logoDisplay: isLogoRemoved ? 'none' : (merged.logoDisplay || 'watermark'),
      watermarkEnabled: merged.watermarkEnabled !== undefined ? merged.watermarkEnabled : true,
      watermarkOpacity: merged.watermarkOpacity !== undefined ? merged.watermarkOpacity : 0.12,
      receiptLogoMaxWidth: merged.receiptLogoMaxWidth || 140,
      receiptLogoMaxHeight: merged.receiptLogoMaxHeight || 65,
      // Invoice Details
      invoiceTitle: merged.invoiceTitle && merged.receiptShowInvoiceTitle ? merged.invoiceTitle : '',
      receiptShowInvoiceTitle: Boolean(merged.receiptShowInvoiceTitle),
      invoiceNumberPrefix: merged.invoiceNumberPrefix !== undefined ? merged.invoiceNumberPrefix : 'BN-',
      invoiceDateFormat: merged.invoiceDateFormat || 'DD-MM-YYYY',
      showInvoiceDate: merged.showInvoiceDate !== false,
      showInvoiceTime: merged.showInvoiceTime !== false,
      showOrderType: Boolean(merged.showOrderType),
      showTableNumber: Boolean(merged.showTableNumber),
      showCaptainCode: Boolean(merged.showCaptainCode),
      receiptHeader: merged.receiptHeader || '',
      receiptFooter: merged.receiptFooter || '*** THANK YOU VISIT AGAIN ***',
      thankYouMessage: merged.thankYouMessage || '*** THANK YOU VISIT AGAIN ***',
      receiptShowReturnPolicy: Boolean(merged.receiptShowReturnPolicy),
      returnPolicy: merged.receiptShowReturnPolicy ? (merged.returnPolicy || '') : '',
      // Column & Table
      receiptShowItemSl: merged.receiptShowItemSl !== false,
      receiptShowItemCode: Boolean(merged.receiptShowItemCode),
      receiptShowTamilName: merged.receiptShowTamilName !== false,
      receiptShowEnglishName: Boolean(merged.receiptShowEnglishName),
      receiptShowAddress: Boolean(merged.receiptShowAddress),
      receiptShowPhone: Boolean(merged.receiptShowPhone),
      receiptShowEmail: Boolean(merged.receiptShowEmail),
      receiptShowGstFssai: Boolean(merged.receiptShowGstFssai),
      receiptShowBranchName: Boolean(merged.receiptShowBranchName),
      receiptShowRate: merged.receiptShowRate !== false,
      receiptShowItemDiscount: Boolean(merged.receiptShowItemDiscount),
      receiptShowItemTax: Boolean(merged.receiptShowItemTax),
      receiptShowTotalQty: merged.receiptShowTotalQty !== false,
      // Totals
      receiptShowSubtotal: merged.receiptShowSubtotal !== false,
      receiptShowDiscount: merged.receiptShowDiscount !== false,
      receiptShowCgst: Boolean(merged.receiptShowCgst),
      receiptShowSgst: Boolean(merged.receiptShowSgst),
      receiptShowRoundOff: Boolean(merged.receiptShowRoundOff),
      receiptShowGrandTotal: merged.receiptShowGrandTotal !== false,
      // Payments & QR
      receiptShowPaymentMethod: Boolean(merged.receiptShowPaymentMethod),
      receiptShowAmountPaid: Boolean(merged.receiptShowAmountPaid),
      receiptShowBalanceDue: Boolean(merged.receiptShowBalanceDue),
      receiptShowChangeReturned: Boolean(merged.receiptShowChangeReturned),
      receiptShowQrCode: Boolean(merged.receiptShowQrCode),
      receiptShowBarcode: Boolean(merged.receiptShowBarcode),
      upiId: merged.upiId || '7708159933@upi',
      receiptPayeeName: merged.receiptPayeeName || 'Sri Saravana Bhavan',
      // Typography & Styling
      paperWidth: merged.paperWidth === '58mm' ? '58mm' : '80mm',
      customPaperWidthMm: merged.customPaperWidthMm,
      receiptFontSize: merged.receiptFontSize || 12,
      receiptFontFamily: merged.receiptFontFamily || 'tamil-noto',
      receiptSeparatorStyle: merged.receiptSeparatorStyle || 'dashed',
      receiptLineSpacing: merged.receiptLineSpacing || 'normal',
      receiptSectionSpacing: merged.receiptSectionSpacing || 'normal',
      receiptItemPadding: merged.receiptItemPadding || 'normal',
      receiptAlignment: defaultAlign,
      logoAlignment: merged.logoAlignment || defaultAlign,
      shopNameAlignment: merged.shopNameAlignment || defaultAlign,
      addressAlignment: merged.addressAlignment || defaultAlign,
      phoneAlignment: merged.phoneAlignment || defaultAlign,
      billHeaderAlignment: merged.billHeaderAlignment || 'left',
      footerAlignment: merged.footerAlignment || defaultAlign,
      boldRestaurantName: merged.boldRestaurantName !== false,
      boldBillNumber: merged.boldBillNumber !== false,
      boldItemHeader: merged.boldItemHeader !== false,
      boldGrandTotal: merged.boldGrandTotal !== false,
      boldFooter: merged.boldFooter !== false,
      // Margins
      receiptMarginTop: typeof merged.receiptMarginTop === 'number' ? merged.receiptMarginTop : 2,
      receiptMarginBottom: typeof merged.receiptMarginBottom === 'number' ? merged.receiptMarginBottom : 4,
      receiptMarginLeft: typeof merged.receiptMarginLeft === 'number' ? merged.receiptMarginLeft : 2,
      receiptMarginRight: typeof merged.receiptMarginRight === 'number' ? merged.receiptMarginRight : 2,
      // Printing & Copies
      receiptPrintCopies: merged.receiptPrintCopies || 1,
      receiptFeedLines: merged.receiptFeedLines || 2,
      compactMode: Boolean(merged.compactMode),
      autoPrintOnSave: merged.autoPrintOnSave !== false,
      skipPrintPreview: Boolean(merged.skipPrintPreview)
    };
  });

  // Sync with initialSettings if updated externally
  useEffect(() => {
    if (initialSettings) {
      setFormData((prev) => ({
        ...prev,
        ...initialSettings,
        receiptShowEnglishName: Boolean(initialSettings.receiptShowEnglishName),
        receiptShowAddress: Boolean(initialSettings.receiptShowAddress),
        receiptShowBranchName: Boolean(initialSettings.receiptShowBranchName),
        receiptShowEmail: Boolean(initialSettings.receiptShowEmail),
        receiptShowGstFssai: Boolean(initialSettings.receiptShowGstFssai),
        receiptShowInvoiceTitle: Boolean(initialSettings.receiptShowInvoiceTitle),
        receiptShowPaymentMethod: Boolean(initialSettings.receiptShowPaymentMethod),
        receiptShowQrCode: Boolean(initialSettings.receiptShowQrCode),
        receiptShowReturnPolicy: Boolean(initialSettings.receiptShowReturnPolicy),
        receiptShowDiscount: Boolean(initialSettings.receiptShowDiscount),
        receiptHeader: initialSettings.receiptHeader || ''
      }));
    }
  }, [initialSettings]);

  // Clean settings payload helper
  const buildSanitizedPayload = (data: RestaurantSettings): Record<string, any> => {
    const isLogoRemoved = Boolean(data.logoRemoved);
    const raw: Record<string, any> = {
      ...data,
      logoUrl: isLogoRemoved ? '' : (data.logoUrl?.trim() || DEFAULT_RESTAURANT_LOGO),
      logoRemoved: isLogoRemoved,
      updatedAt: Date.now()
    };
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === undefined) {
        clean[key] = deleteField();
      } else {
        clean[key] = value;
      }
    }
    return clean;
  };

  // Immediate setting update & local preview broadcast
  const updateSettings = (updater: (prev: RestaurantSettings) => RestaurantSettings) => {
    setFormData((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('pos_restaurant_settings', JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('pos-settings-updated', { detail: next }));
      } catch (_) {}
      return next;
    });
  };

  // Save Settings to Firestore & Local Storage
  const handleSave = async (overrideData?: RestaurantSettings) => {
    setSaving(true);
    setNotification(null);
    const dataToSave = buildSanitizedPayload(overrideData || formData);

    try {
      localStorage.setItem('pos_restaurant_settings', JSON.stringify(dataToSave));
      window.dispatchEvent(new CustomEvent('pos-settings-updated', { detail: dataToSave }));

      // Save to Firestore settings collection
      await setDoc(doc(db, 'settings', 'restaurant'), dataToSave, { merge: true });

      setNotification({
        type: 'success',
        message: 'Receipt settings saved successfully! All receipts will use this layout.'
      });
      if (onRefreshSettings) onRefreshSettings();
    } catch (err: any) {
      console.error('Failed to save receipt settings to Firestore:', err);
      setNotification({
        type: 'error',
        message: err?.message || 'Could not save receipt settings. Stored locally on this terminal.'
      });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Presets
  const applyPreset = (preset: 'standard_80' | 'compact_80' | 'mobile_58' | 'gst_tax_invoice') => {
    let next: RestaurantSettings;
    switch (preset) {
      case 'standard_80':
        next = {
          ...formData,
          paperWidth: '80mm',
          customPaperWidthMm: undefined,
          compactMode: false,
          receiptFontSize: 12,
          invoiceTitle: '',
          receiptShowInvoiceTitle: false,
          receiptHeader: '',
          receiptShowEnglishName: false,
          receiptShowAddress: false,
          receiptShowPhone: false,
          receiptShowEmail: false,
          receiptShowGstFssai: false,
          receiptShowBranchName: false,
          showOrderType: false,
          showCaptainCode: false,
          receiptFontFamily: 'tamil-noto',
          receiptSeparatorStyle: 'dashed',
          receiptLineSpacing: 'normal',
          receiptSectionSpacing: 'normal',
          receiptItemPadding: 'normal',
          receiptShowItemSl: true,
          receiptShowItemCode: false,
          receiptShowRate: true,
          receiptShowTotalQty: true,
          receiptShowSubtotal: true,
          receiptShowGrandTotal: true,
          receiptShowQrCode: false,
          receiptShowPaymentMethod: false,
          receiptShowReturnPolicy: false,
          receiptPrintCopies: 1,
          receiptFeedLines: 2
        };
        break;
      case 'compact_80':
        next = {
          ...formData,
          paperWidth: '80mm',
          customPaperWidthMm: undefined,
          compactMode: true,
          receiptFontSize: 10.5,
          invoiceTitle: '',
          receiptShowInvoiceTitle: false,
          receiptHeader: '',
          receiptShowEnglishName: false,
          receiptShowAddress: false,
          receiptShowPhone: false,
          receiptShowEmail: false,
          receiptShowGstFssai: false,
          receiptShowBranchName: false,
          showOrderType: false,
          showCaptainCode: false,
          receiptSeparatorStyle: 'dotted',
          receiptLineSpacing: 'tight',
          receiptSectionSpacing: 'compact',
          receiptItemPadding: 'compact',
          receiptShowItemSl: false,
          receiptShowItemCode: false,
          receiptShowTotalQty: true,
          receiptShowQrCode: false,
          receiptShowPaymentMethod: false,
          receiptShowReturnPolicy: false,
          receiptFeedLines: 1
        };
        break;
      case 'mobile_58':
        next = {
          ...formData,
          paperWidth: '58mm',
          customPaperWidthMm: undefined,
          compactMode: true,
          receiptFontSize: 10,
          invoiceTitle: '',
          receiptShowInvoiceTitle: false,
          receiptHeader: '',
          receiptShowEnglishName: false,
          receiptShowAddress: false,
          receiptShowPhone: false,
          receiptShowEmail: false,
          receiptShowGstFssai: false,
          receiptShowBranchName: false,
          showOrderType: false,
          showCaptainCode: false,
          receiptSeparatorStyle: 'dashed',
          receiptLineSpacing: 'tight',
          receiptShowItemSl: false,
          receiptShowItemCode: false,
          receiptShowQrCode: false,
          receiptShowPaymentMethod: false,
          receiptShowReturnPolicy: false,
          receiptFeedLines: 1
        };
        break;
      case 'gst_tax_invoice':
        next = {
          ...formData,
          paperWidth: '80mm',
          compactMode: false,
          receiptFontSize: 12,
          invoiceTitle: 'TAX INVOICE',
          receiptSeparatorStyle: 'solid',
          receiptShowItemSl: true,
          receiptShowItemCode: true,
          receiptShowRate: true,
          receiptShowItemTax: true,
          receiptShowSubtotal: true,
          receiptShowCgst: true,
          receiptShowSgst: true,
          receiptShowRoundOff: true,
          receiptShowGrandTotal: true,
          receiptShowPaymentMethod: true,
          receiptShowQrCode: true,
          receiptShowBarcode: true,
          receiptFeedLines: 2
        };
        break;
    }
    updateSettings(() => next);
    setNotification({
      type: 'success',
      message: `Preset "${preset.replace(/_/g, ' ').toUpperCase()}" applied to receipt designer.`
    });
  };

  // Watermark nudge
  const handleNudge = (dx: number, dy: number) => {
    updateSettings((prev) => ({
      ...prev,
      logoOffsetX: Math.max(-85, Math.min(85, Number(prev.logoOffsetX || 0) + dx)),
      logoOffsetY: Math.max(-45, Math.min(45, Number(prev.logoOffsetY || 0) + dy))
    }));
  };

  // Test Print
  const handleTestPrint = async () => {
    setTestPrintStatus({ state: 'printing', message: 'Sending test receipt to printer...' });
    try {
      const sampleBillObj = SAMPLE_BILL as Bill;
      const html = PrinterService.generateReceiptHtml(sampleBillObj, SAMPLE_ITEMS, formData);
      const res = PrinterService.printHtmlDocument(html, formData);

      if (res.success) {
        setTestPrintStatus({ state: 'success', message: 'Test receipt printed successfully!' });
      } else {
        setTestPrintStatus({
          state: 'failed',
          message: res.error || 'Print dialog closed or restricted in this environment.'
        });
      }
    } catch (e: any) {
      setTestPrintStatus({ state: 'failed', message: e?.message || 'Print error' });
    } finally {
      setTimeout(() => setTestPrintStatus({ state: 'idle' }), 4000);
    }
  };

  // Download printable HTML / PDF file
  const handleDownloadFile = () => {
    try {
      const sampleBillObj = SAMPLE_BILL as Bill;
      const html = PrinterService.generateReceiptHtml(sampleBillObj, SAMPLE_ITEMS, formData);
      const ok = PrinterService.downloadPrintableReceipt(html, `receipt-sample-${formData.paperWidth || '80mm'}.html`);
      if (ok) {
        setNotification({ type: 'success', message: 'Printable receipt downloaded successfully!' });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Could not export receipt file.' });
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'store', label: 'Store & Branding', icon: Store },
    { id: 'invoice', label: 'Invoice & Headers', icon: FileText },
    { id: 'items', label: 'Item Columns', icon: LayoutTemplate },
    { id: 'totals', label: 'Taxes & Totals', icon: DollarSign },
    { id: 'styling', label: 'Styling & Layout', icon: Type },
    { id: 'payment-qr', label: 'Payment & QR', icon: QrCode },
    { id: 'printing', label: 'Printing & Copies', icon: Printer }
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Header Toolbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-lg text-white">Receipt Settings &amp; Designer</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Live WYSIWYG
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Customize shop branding, item columns, taxes, UPI QR, and thermal paper layout with instant preview
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Mobile Preview Toggle */}
          <button
            type="button"
            onClick={() => setMobilePreviewPinned((v) => !v)}
            className="lg:hidden px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-emerald-400" />
            <span>{mobilePreviewPinned ? 'Hide Preview' : 'Show Preview'}</span>
          </button>

          {/* Download PDF / HTML */}
          <button
            type="button"
            onClick={handleDownloadFile}
            className="px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Export printable receipt file"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">Export File</span>
          </button>

          {/* Test Print */}
          <button
            type="button"
            onClick={handleTestPrint}
            disabled={testPrintStatus.state === 'printing'}
            className="px-3.5 py-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/70 border border-amber-500/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>{testPrintStatus.state === 'printing' ? 'Printing...' : 'Print Test'}</span>
          </button>

          {/* Save Settings */}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="px-4 py-1.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-between gap-2 shadow-md shrink-0 ${
            notification.type === 'success'
              ? 'bg-emerald-950 border-b border-emerald-500/40 text-emerald-200'
              : 'bg-red-950 border-b border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Split Screen Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* Left Column: Customization Controls (7 cols on desktop) */}
        <div className="lg:col-span-7 flex flex-col h-full min-h-0 border-r border-slate-800 bg-slate-900/60 overflow-hidden">
          {/* Preset Quick-Buttons & Tabs */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Quick Presets:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyPreset('standard_80')}
                  className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  Standard 80mm
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('compact_80')}
                  className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  Compact Saver
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('mobile_58')}
                  className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  Mobile 58mm
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('gst_tax_invoice')}
                  className="px-2 py-1 text-[11px] font-semibold bg-amber-950 hover:bg-amber-900 text-amber-300 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
                >
                  GST Tax Invoice
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content Panels (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* 1. STORE & BRANDING */}
            {activeTab === 'store' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Store className="w-4 h-4 text-amber-400" />
                    <span>Store Profile &amp; Contact Info</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Restaurant Name (English)
                      </label>
                      <input
                        type="text"
                        value={formData.restaurantName || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, restaurantName: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="SRI SARAVANA BHAVAN"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Restaurant Name (Tamil / Regional)
                      </label>
                      <input
                        type="text"
                        value={formData.restaurantNameTamil || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, restaurantNameTamil: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="ஸ்ரீ சரவண பவன்"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Store Branch Name (Multi-Store)
                      </label>
                      <input
                        type="text"
                        value={formData.storeBranchName || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, storeBranchName: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="Main Branch / Kallakurichi"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={formData.phone || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="7708159933"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, email: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="contact@srisaravanabhavan.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        GSTIN Number
                      </label>
                      <input
                        type="text"
                        value={formData.gstNumber || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, gstNumber: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none uppercase"
                        placeholder="33AAAAA0000A1Z5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Store Address (Multi-line)
                    </label>
                    <textarea
                      rows={2}
                      value={formData.address || ''}
                      onChange={(e) => updateSettings((p) => ({ ...p, address: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none resize-none"
                      placeholder="No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213"
                    />
                  </div>
                </div>

                {/* Logo & Watermark Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Logo &amp; Watermark Display</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Logo Position Mode
                      </label>
                      <select
                        value={formData.logoDisplay || 'watermark'}
                        onChange={(e) => updateSettings((p) => ({ ...p, logoDisplay: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="watermark">Centered Watermark (Behind Text)</option>
                        <option value="header">Top Header Logo</option>
                        <option value="both">Both Top Header &amp; Watermark</option>
                        <option value="none">No Logo (Hide Everywhere)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Watermark Opacity: {Math.round((formData.watermarkOpacity || 0.12) * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0.05"
                        max="0.35"
                        step="0.02"
                        value={formData.watermarkOpacity || 0.12}
                        onChange={(e) => updateSettings((p) => ({ ...p, watermarkOpacity: parseFloat(e.target.value) }))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                  </div>

                  {/* Header Field Visibility Switches */}
                  <div className="pt-2 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.receiptShowTamilName !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowTamilName: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Tamil Title</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowEnglishName)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowEnglishName: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show English Title</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowAddress)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowAddress: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Address</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowPhone)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowPhone: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Phone</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowEmail)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowEmail: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Email</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowGstFssai)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowGstFssai: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show GST/FSSAI</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 2. INVOICE & HEADERS */}
            {activeTab === 'invoice' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Invoice Titles &amp; Meta Format</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-300">
                          Invoice Title Banner
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-amber-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.receiptShowInvoiceTitle)}
                            onChange={(e) => updateSettings((p) => ({ ...p, receiptShowInvoiceTitle: e.target.checked }))}
                            className="w-3.5 h-3.5 rounded accent-amber-500"
                          />
                          <span>Show on Receipt</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formData.invoiceTitle || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, invoiceTitle: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none uppercase"
                        placeholder="e.g. TAX INVOICE (leave blank / unchecked to hide)"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Invoice Number Prefix
                      </label>
                      <input
                        type="text"
                        value={formData.invoiceNumberPrefix !== undefined ? formData.invoiceNumberPrefix : 'BN-'}
                        onChange={(e) => updateSettings((p) => ({ ...p, invoiceNumberPrefix: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="BN- or INV-"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Date Display Format
                      </label>
                      <select
                        value={formData.invoiceDateFormat || 'DD-MM-YYYY'}
                        onChange={(e) => updateSettings((p) => ({ ...p, invoiceDateFormat: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 29-10-2026)</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 29/10/2026)</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-10-29)</option>
                        <option value="MMM DD, YYYY">MMM DD, YYYY (e.g. Oct 29, 2026)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Custom Header Note / Slogan
                      </label>
                      <input
                        type="text"
                        value={formData.receiptHeader || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptHeader: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="Taste of Traditional Hospitality"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Footer Thank-You Message
                    </label>
                    <input
                      type="text"
                      value={formData.thankYouMessage || ''}
                      onChange={(e) => updateSettings((p) => ({ ...p, thankYouMessage: e.target.value, receiptFooter: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      placeholder="*** THANK YOU VISIT AGAIN ***"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Return Policy / Terms Note
                    </label>
                    <input
                      type="text"
                      value={formData.returnPolicy || ''}
                      onChange={(e) => updateSettings((p) => ({ ...p, returnPolicy: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      placeholder="Items once sold cannot be returned or exchanged."
                    />
                  </div>

                  {/* Field Toggles */}
                  <div className="pt-2 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.showInvoiceDate !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, showInvoiceDate: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Date</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.showInvoiceTime !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, showInvoiceTime: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Time</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.showOrderType)}
                        onChange={(e) => updateSettings((p) => ({ ...p, showOrderType: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Order Type</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.showTableNumber)}
                        onChange={(e) => updateSettings((p) => ({ ...p, showTableNumber: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Table No</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.showCaptainCode)}
                        onChange={(e) => updateSettings((p) => ({ ...p, showCaptainCode: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Captain Code</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowReturnPolicy)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowReturnPolicy: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Show Return Policy</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 3. ITEM COLUMNS */}
            {activeTab === 'items' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <LayoutTemplate className="w-4 h-4 text-amber-400" />
                    <span>Item Table Column Configuration</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Control which columns appear in the receipt items table. Column widths auto-balance to display full item names clearly.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Item Serial (# / SL)</div>
                        <div className="text-[11px] text-slate-400">Number column (1, 2, 3...)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.receiptShowItemSl !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowItemSl: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Item SKU / Code</div>
                        <div className="text-[11px] text-slate-400">Product code (e.g. DOS01)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowItemCode)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowItemCode: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Rate / Unit Price</div>
                        <div className="text-[11px] text-slate-400">Price per unit</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.receiptShowRate !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowRate: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Item Discount Column</div>
                        <div className="text-[11px] text-slate-400">Discount per item row</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowItemDiscount)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowItemDiscount: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Item Tax / GST %</div>
                        <div className="text-[11px] text-slate-400">Tax percentage (e.g. 5%)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowItemTax)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowItemTax: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Line Total Column</div>
                        <div className="text-[11px] text-slate-400">Qty × Rate amount</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.receiptShowLineTotal !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowLineTotal: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 4. TAXES & TOTALS */}
            {activeTab === 'totals' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Totals Breakdown &amp; Tax Visibility</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Total Quantity Count</div>
                        <div className="text-[11px] text-slate-400">Summary count of total items</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.receiptShowTotalQty !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowTotalQty: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Subtotal Row</div>
                        <div className="text-[11px] text-slate-400">Before discounts &amp; taxes</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.receiptShowSubtotal !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowSubtotal: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Discount Row</div>
                        <div className="text-[11px] text-slate-400">Visible when discount &gt; ₹0</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowDiscount)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowDiscount: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">CGST Breakdown (2.5%)</div>
                        <div className="text-[11px] text-slate-400">Central GST line</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowCgst)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowCgst: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">SGST Breakdown (2.5%)</div>
                        <div className="text-[11px] text-slate-400">State GST line</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowSgst)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowSgst: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Round-Off Row</div>
                        <div className="text-[11px] text-slate-400">Decimal adjustment line</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowRoundOff)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowRoundOff: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 5. STYLING & LAYOUT */}
            {activeTab === 'styling' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Type className="w-4 h-4 text-amber-400" />
                    <span>Typography, Separators &amp; Paper Width</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Receipt Paper Width
                      </label>
                      <select
                        value={formData.customPaperWidthMm ? 'custom' : formData.paperWidth || '80mm'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            updateSettings((p) => ({ ...p, customPaperWidthMm: 72 }));
                          } else {
                            updateSettings((p) => ({ ...p, paperWidth: val as any, customPaperWidthMm: undefined }));
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="80mm">Standard 80 mm (3-Inch Roll)</option>
                        <option value="58mm">Mobile 58 mm (2-Inch Roll)</option>
                        <option value="custom">Custom Width (mm)</option>
                      </select>
                    </div>

                    {formData.customPaperWidthMm && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Custom Width in mm: {formData.customPaperWidthMm} mm
                        </label>
                        <input
                          type="number"
                          min="40"
                          max="110"
                          value={formData.customPaperWidthMm}
                          onChange={(e) => updateSettings((p) => ({ ...p, customPaperWidthMm: parseInt(e.target.value) || 72 }))}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Font Family
                      </label>
                      <select
                        value={formData.receiptFontFamily || 'tamil-noto'}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptFontFamily: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="tamil-noto">Bilingual Tamil Noto / Mukta Malar (Crisp POS)</option>
                        <option value="monospace">Monospace (Classic Dot-Matrix / ESC/POS)</option>
                        <option value="sans-serif">Clean Sans-Serif (Modern Modernist)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Base Font Size: {formData.receiptFontSize || 12} px
                      </label>
                      <input
                        type="range"
                        min="8"
                        max="18"
                        step="0.5"
                        value={formData.receiptFontSize || 12}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptFontSize: parseFloat(e.target.value) }))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Separator Line Style
                      </label>
                      <select
                        value={formData.receiptSeparatorStyle || 'dashed'}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptSeparatorStyle: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="dashed">Dashed (-----------------)</option>
                        <option value="dotted">Dotted (·················)</option>
                        <option value="solid">Solid (─────────────────)</option>
                        <option value="double">Double (═════════════════)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Line Spacing
                      </label>
                      <select
                        value={formData.receiptLineSpacing || 'normal'}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptLineSpacing: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="tight">Tight (1.15)</option>
                        <option value="normal">Normal (1.25)</option>
                        <option value="relaxed">Relaxed (1.40)</option>
                      </select>
                    </div>
                  </div>

                  {/* Margins */}
                  <div className="pt-3 border-t border-slate-800">
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Thermal Paper Margins (mm)
                    </label>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400">Top (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={formData.receiptMarginTop !== undefined ? formData.receiptMarginTop : 2}
                          onChange={(e) => updateSettings((p) => ({ ...p, receiptMarginTop: parseInt(e.target.value) || 0 }))}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Bottom (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={formData.receiptMarginBottom !== undefined ? formData.receiptMarginBottom : 4}
                          onChange={(e) => updateSettings((p) => ({ ...p, receiptMarginBottom: parseInt(e.target.value) || 0 }))}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Left (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={formData.receiptMarginLeft !== undefined ? formData.receiptMarginLeft : 2}
                          onChange={(e) => updateSettings((p) => ({ ...p, receiptMarginLeft: parseInt(e.target.value) || 0 }))}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs text-center"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Right (mm)</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={formData.receiptMarginRight !== undefined ? formData.receiptMarginRight : 2}
                          onChange={(e) => updateSettings((p) => ({ ...p, receiptMarginRight: parseInt(e.target.value) || 0 }))}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs text-center"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bold Switches */}
                  <div className="pt-2 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.boldRestaurantName !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, boldRestaurantName: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Bold Store Title</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.boldBillNumber !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, boldBillNumber: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Bold Bill Number</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.boldItemHeader !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, boldItemHeader: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Bold Table Headers</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.boldGrandTotal !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, boldGrandTotal: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Bold Grand Total</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.boldFooter !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, boldFooter: e.target.checked }))}
                        className="rounded accent-amber-500"
                      />
                      <span>Bold Footer</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 6. PAYMENT & QR */}
            {activeTab === 'payment-qr' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-amber-400" />
                    <span>UPI QR Code &amp; Payment Options</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        UPI VPA ID (e.g. 7708159933@upi)
                      </label>
                      <input
                        type="text"
                        value={formData.upiId || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, upiId: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="7708159933@upi"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Payee Name (for UPI apps)
                      </label>
                      <input
                        type="text"
                        value={formData.receiptPayeeName || ''}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptPayeeName: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                        placeholder="Sri Saravana Bhavan"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Dynamic UPI QR Code</div>
                        <div className="text-[11px] text-slate-400">Scan &amp; Pay directly via GPay, PhonePe, Paytm</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowQrCode)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowQrCode: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Invoice Barcode</div>
                        <div className="text-[11px] text-slate-400">Scannable barcode of Bill Number</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowBarcode)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowBarcode: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Payment Method Row</div>
                        <div className="text-[11px] text-slate-400">Shows Cash, UPI, or Card mode</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowPaymentMethod)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowPaymentMethod: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Amount Paid / Tendered</div>
                        <div className="text-[11px] text-slate-400">Cash received from customer</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowAmountPaid)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowAmountPaid: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Change Returned</div>
                        <div className="text-[11px] text-slate-400">Change given back to customer</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.receiptShowChangeReturned)}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptShowChangeReturned: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 7. PRINTING & COPIES */}
            {activeTab === 'printing' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Print Queue &amp; Multi-Copy Settings</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Number of Copies to Print
                      </label>
                      <select
                        value={formData.receiptPrintCopies || 1}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptPrintCopies: parseInt(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="1">1 Copy (Customer Receipt)</option>
                        <option value="2">2 Copies (Customer + Merchant/Kitchen)</option>
                        <option value="3">3 Copies (Customer + Kitchen + Accounts)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Cutter Paper Feed Lines
                      </label>
                      <select
                        value={formData.receiptFeedLines || 2}
                        onChange={(e) => updateSettings((p) => ({ ...p, receiptFeedLines: parseInt(e.target.value) || 2 }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                      >
                        <option value="1">1 Line (Minimal Tear Margin)</option>
                        <option value="2">2 Lines (Standard Cutter Clearance)</option>
                        <option value="3">3 Lines (Spacious)</option>
                        <option value="4">4 Lines (Max Separation)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Auto-Print on Bill Save</div>
                        <div className="text-[11px] text-slate-400">Dispatches print immediately upon payment</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.autoPrintOnSave !== false}
                        onChange={(e) => updateSettings((p) => ({ ...p, autoPrintOnSave: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Skip On-Screen Preview Modal</div>
                        <div className="text-[11px] text-slate-400">Zero-click rapid direct checkout</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.skipPrintPreview)}
                        onChange={(e) => updateSettings((p) => ({ ...p, skipPrintPreview: e.target.checked }))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live WYSIWYG Receipt Preview (5 cols on desktop) */}
        <div
          className={`lg:col-span-5 flex flex-col h-full min-h-0 bg-slate-950 p-4 border-t lg:border-t-0 border-slate-800 ${
            mobilePreviewPinned ? 'block' : 'hidden lg:flex'
          }`}
        >
          {/* Preview Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Live Receipt Preview
              </h4>
              <span className="text-[11px] font-mono text-slate-400">
                ({formData.paperWidth || '80mm'})
              </span>
            </div>

            {/* Watermark Reset */}
            {(formData.logoOffsetX !== 0 || formData.logoOffsetY !== 0) && (
              <button
                type="button"
                onClick={() => updateSettings((p) => ({ ...p, logoOffsetX: 0, logoOffsetY: 0 }))}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-amber-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Center Logo</span>
              </button>
            )}
          </div>

          {/* Watermark Nudge Controls Bar */}
          {formData.watermarkEnabled !== false && formData.logoDisplay !== 'none' && (
            <div className="mb-3 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0">
              <span className="text-slate-400">Watermark Nudge:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleNudge(-5, 0)}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                  title="Move Left"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(0, -5)}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                  title="Move Up"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(0, 5)}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                  title="Move Down"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(5, 0)}
                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                  title="Move Right"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings((p) => ({ ...p, logoOffsetX: 0, logoOffsetY: 0 }))}
                  className="px-1.5 h-6 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                  title="Center Position"
                >
                  <Crosshair className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Paper Roll Canvas Area */}
          <div className="flex-1 overflow-y-auto flex items-start justify-center p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80 shadow-inner">
            <div className="shadow-2xl rounded-sm transition-all overflow-hidden bg-white">
              <ReceiptTemplate
                bill={SAMPLE_BILL}
                items={SAMPLE_ITEMS}
                settings={formData}
                sampleMode={true}
                interactiveWatermark={true}
                id="live-receipt-designer-preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
